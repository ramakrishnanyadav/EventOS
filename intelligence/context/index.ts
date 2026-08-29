import { getDb } from '../../modules/common/db.js';
import { getUserSession, evaluatePolicy, UserSession, AuthorizationPolicy } from '../../modules/identity/index.js';
import { getAllVenues, VenueMetrics } from '../../modules/venues/index.js';
import { getOpenIncidents, IncidentRecord } from '../../modules/incidents/index.js';

export interface UserContext {
  session: UserSession;
  policy: AuthorizationPolicy;
  eventId: string;
  currentTime: string;
  participantState?: {
    checkedIn: boolean;
    hasActiveTeam: boolean;
    teamId?: string;
    teamName?: string;
    submissionStatus?: 'DRAFT' | 'FINAL' | 'NONE';
    submissionPct?: number;
    deadlineMinutesRemaining?: number;
    upcomingSession?: {
      name: string;
      venueName: string;
      startTime: string;
      minutesUntilStart: number;
    };
    currentVenueCongestion?: VenueMetrics;
  };
  judgeState?: {
    assignedTeamsCount: number;
    evaluatedTeamsCount: number;
    remainingAssignments: { team_id: string; team_name: string; deadline_pressure: number }[];
    conflictedTeamIds: string[];
    workloadLagMinutes: number;
  };
  organizerState?: {
    attendancePct: number;
    submissionCompletionPct: number;
    judgingCompletionPct: number;
    venues: VenueMetrics[];
    openIncidents: IncidentRecord[];
    judgeGroupsLagging: boolean;
  };
}

export function assembleContext(userId: string, eventId: string): UserContext {
  const session = getUserSession(userId);
  if (!session) throw new Error(`User '${userId}' not found.`);

  const policy = evaluatePolicy(session);
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  const ctx: UserContext = {
    session,
    policy,
    eventId,
    currentTime: nowIso,
  };

  // Participant Context
  if (session.role === 'PARTICIPANT' || session.role === 'ORGANIZER') {
    const partRow = db.prepare('SELECT id, checked_in FROM participants WHERE user_id = ? AND event_id = ?').get(userId, eventId) as any;
    const teamRow = db.prepare(`
      SELECT t.id, t.name FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ? AND tm.event_id = ?
    `).get(userId, eventId) as any;

    let subRow: any = null;
    if (teamRow) {
      subRow = db.prepare('SELECT status, completion_pct FROM submissions WHERE team_id = ?').get(teamRow.id);
    }

    // Default 30 min submission deadline window for demo
    const deadlineMinutesRemaining = 28;

    // Upcoming session
    const sessionRow = db.prepare(`
      SELECT s.name, v.name as venue_name, s.start_time
      FROM sessions s
      JOIN venues v ON v.id = s.venue_id
      WHERE s.event_id = ?
      ORDER BY s.start_time ASC LIMIT 1
    `).get(eventId) as any;

    const hallB = db.prepare("SELECT * FROM venues WHERE name LIKE '%Hall B%'").get() as any;
    const hallBMetrics = hallB ? getAllVenues(eventId).find(v => v.id === hallB.id) : undefined;

    ctx.participantState = {
      checkedIn: Boolean(partRow?.checked_in),
      hasActiveTeam: Boolean(teamRow),
      teamId: teamRow?.id,
      teamName: teamRow?.name,
      submissionStatus: subRow?.status ?? 'NONE',
      submissionPct: subRow?.completion_pct ?? 0,
      deadlineMinutesRemaining,
      upcomingSession: sessionRow ? {
        name: sessionRow.name,
        venueName: sessionRow.venue_name,
        startTime: sessionRow.start_time,
        minutesUntilStart: 28,
      } : undefined,
      currentVenueCongestion: hallBMetrics,
    };
  }

  // Judge Context (Policy Filtered)
  if (policy.canAccessJudgingData && session.role === 'JUDGE') {
    const assignments = db.prepare(`
      SELECT ja.team_id, t.name as team_name
      FROM judge_assignments ja
      JOIN teams t ON t.id = ja.team_id
      WHERE ja.judge_user_id = ? AND ja.event_id = ?
    `).all(userId, eventId) as any[];

    const evaluated = db.prepare(`
      SELECT DISTINCT team_id FROM scores WHERE judge_user_id = ? AND event_id = ?
    `).all(userId, eventId) as any[];

    const conflicts = db.prepare(`
      SELECT team_id FROM judge_conflicts WHERE judge_user_id = ?
    `).all(userId) as any[];

    const evaluatedSet = new Set(evaluated.map((e: any) => e.team_id));
    const conflictSet = new Set(conflicts.map((c: any) => c.team_id));

    const remaining = assignments
      .filter((a: any) => !evaluatedSet.has(a.team_id) && !conflictSet.has(a.team_id))
      .map((a: any) => ({
        team_id: a.team_id,
        team_name: a.team_name,
        deadline_pressure: 85, // Ranked pressure metric
      }));

    ctx.judgeState = {
      assignedTeamsCount: assignments.length,
      evaluatedTeamsCount: evaluated.length,
      remainingAssignments: remaining,
      conflictedTeamIds: Array.from(conflictSet),
      workloadLagMinutes: 0,
    };
  }

  // Organizer Context (Policy Filtered)
  if (policy.canAccessOrganizerDashboard) {
    const venues = getAllVenues(eventId);
    const incidents = getOpenIncidents(eventId);

    ctx.organizerState = {
      attendancePct: 94,
      submissionCompletionPct: 88,
      judgingCompletionPct: 65,
      venues,
      openIncidents: incidents,
      judgeGroupsLagging: true,
    };
  }

  return ctx;
}
