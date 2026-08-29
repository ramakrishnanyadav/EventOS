import { getDb } from '../common/db.js';

export interface ParticipantRecord {
  id: string;
  user_id: string;
  event_id: string;
  checked_in: boolean;
  checkin_time: string | null;
}

export interface UnifiedRegistration {
  kind: 'EVENT' | 'OPPORTUNITY';
  id: string;
  title: string;
  org_name: string;
  deadline_or_dates: string;
  status: string;
  cta_route: string;
  created_at: string;
}

export interface UserTeamEngagement {
  team_id: string;
  team_name: string;
  event_id: string;
  event_name: string;
  role: string;
  members: { id: string; name: string; role?: string }[];
  created_at: string;
}

export interface UserSubmissionItem {
  event_id: string;
  event_name: string;
  event_slug: string;
  team_id: string;
  team_name: string;
  submission_id: string | null;
  title: string;
  problem_statement: string;
  solution_summary: string;
  repo_url: string;
  demo_url: string;
  completion_pct: number;
  status: 'NOT_STARTED' | 'DRAFT' | 'FINAL';
  deadline: string;
}

export interface UserScheduleItem {
  session_id: string;
  event_id: string;
  event_name: string;
  title: string;
  start_time: string;
  end_time: string;
  venue_id: string;
  venue_name: string;
  capacity_pct: number;
  congestion_level: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
  recommendation: string;
}

export interface UserNotificationItem {
  id: string;
  title: string;
  message: string;
  urgency: 'HIGH' | 'MEDIUM' | 'INFO';
  cta_label: string;
  cta_route: string;
  created_at: string;
}

export function getParticipantByUserId(userId: string, eventId: string): ParticipantRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM participants WHERE user_id = ? AND event_id = ?').get(userId, eventId) as any;
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    event_id: row.event_id,
    checked_in: Boolean(row.checked_in),
    checkin_time: row.checkin_time,
  };
}

/**
 * 1. getMyRegistrations(userId) — Unifies events and opportunity registrations
 */
export function getMyRegistrations(userId: string): UnifiedRegistration[] {
  if (!userId) return [];
  const db = getDb();
  const result: UnifiedRegistration[] = [];

  // Multi-day events from participants table
  const pRows = db.prepare(`
    SELECT p.id, p.event_id, p.checked_in, p.created_at, e.name as event_name, e.registration_deadline, o.name as org_name
    FROM participants p
    JOIN events e ON p.event_id = e.id
    LEFT JOIN organizations o ON e.org_id = o.id
    WHERE p.user_id = ?
  `).all(userId) as any[];

  for (const p of pRows) {
    result.push({
      kind: 'EVENT',
      id: p.event_id,
      title: p.event_name,
      org_name: p.org_name || 'EVENTOS Global Labs',
      deadline_or_dates: p.registration_deadline || 'Active',
      status: p.checked_in ? 'Checked In ✓' : 'Registered ✓',
      cta_route: `#/events/${p.event_id}`,
      created_at: p.created_at || new Date().toISOString(),
    });
  }

  // Opportunity registrations from opportunity_registrations table
  const oRows = db.prepare(`
    SELECT r.id, r.opportunity_id, r.status, r.created_at, o.title as opp_title, o.org_name, o.deadline, o.category
    FROM opportunity_registrations r
    JOIN opportunities o ON r.opportunity_id = o.id
    WHERE r.user_id = ?
  `).all(userId) as any[];

  for (const o of oRows) {
    if (!result.some(r => r.id === o.opportunity_id)) {
      result.push({
        kind: 'OPPORTUNITY',
        id: o.opportunity_id,
        title: o.opp_title,
        org_name: o.org_name,
        deadline_or_dates: o.deadline || 'Closing Soon',
        status: o.status || 'Registered ✓',
        cta_route: `#/opportunities/${o.opportunity_id}`,
        created_at: o.created_at || new Date().toISOString(),
      });
    }
  }

  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return result;
}

/**
 * 2. getMyTeams(userId) — Fetches all team memberships with populated member names
 */
export function getMyTeams(userId: string): UserTeamEngagement[] {
  if (!userId) return [];
  const db = getDb();

  const teamRows = db.prepare(`
    SELECT tm.team_id, tm.event_id, t.name as team_name, t.created_at, e.name as event_name
    FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    LEFT JOIN events e ON tm.event_id = e.id
    WHERE tm.user_id = ?
  `).all(userId) as any[];

  return teamRows.map(tr => {
    const memberRows = db.prepare(`
      SELECT tm.user_id, u.name, u.role
      FROM team_members tm
      LEFT JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
    `).all(tr.team_id) as any[];

    return {
      team_id: tr.team_id,
      team_name: tr.team_name,
      event_id: tr.event_id,
      event_name: tr.event_name || 'EVENTOS Hackathon',
      role: tr.user_id === userId ? 'Lead' : 'Member',
      members: memberRows.map(m => ({ id: m.user_id, name: m.name || m.user_id, role: m.role })),
      created_at: tr.created_at || new Date().toISOString(),
    };
  });
}

/**
 * 3. getMySubmissions(userId) — Per-team submission status across all user teams
 */
export function getMySubmissions(userId: string): UserSubmissionItem[] {
  const teams = getMyTeams(userId);
  const db = getDb();
  const result: UserSubmissionItem[] = [];

  for (const t of teams) {
    const sub = db.prepare('SELECT * FROM submissions WHERE team_id = ?').get(t.team_id) as any;
    
    // Calculate server-side completion_pct
    let pct = 0;
    if (sub) {
      if (sub.title) pct += 20;
      if (sub.problem_statement || sub.description) pct += 20;
      if (sub.solution_summary) pct += 20;
      if (sub.repo_url) pct += 20;
      if (sub.demo_url) pct += 20;
    }

    result.push({
      event_id: t.event_id,
      event_name: t.event_name,
      event_slug: t.event_id,
      team_id: t.team_id,
      team_name: t.team_name,
      submission_id: sub ? sub.id : null,
      title: sub ? (sub.title || '') : '',
      problem_statement: sub ? (sub.problem_statement || sub.description || '') : '',
      solution_summary: sub ? (sub.solution_summary || '') : '',
      repo_url: sub ? (sub.repo_url || '') : '',
      demo_url: sub ? (sub.demo_url || '') : '',
      completion_pct: sub ? Math.max(pct, sub.completion_pct || 0) : 0,
      status: sub ? (sub.status === 'FINAL' ? 'FINAL' : 'DRAFT') : 'NOT_STARTED',
      deadline: '2026-09-15',
    });
  }

  return result;
}

/**
 * 4. getMySchedule(userId) — Registered event sessions with venue congestion recommendations
 */
export function getMySchedule(userId: string): UserScheduleItem[] {
  if (!userId) return [];
  const db = getDb();

  const regs = getMyRegistrations(userId);
  const eventIds = regs.filter(r => r.kind === 'EVENT').map(r => r.id);

  if (eventIds.length === 0) return [];

  const sessions = db.prepare(`
    SELECT s.id as session_id, s.event_id, s.name as title, s.start_time, s.end_time, s.venue_id, e.name as event_name, v.name as venue_name, v.capacity, v.current_occupancy
    FROM sessions s
    JOIN events e ON s.event_id = e.id
    LEFT JOIN venues v ON s.venue_id = v.id
    WHERE s.event_id IN (${eventIds.map(() => '?').join(',')})
    ORDER BY s.start_time ASC
  `).all(...eventIds) as any[];

  return sessions.map(s => {
    const occ = s.current_occupancy || 50;
    const cap = s.capacity || 100;
    const pct = Math.min(100, Math.round((occ / cap) * 100));
    const level: 'NORMAL' | 'ELEVATED' | 'CRITICAL' = pct >= 90 ? 'CRITICAL' : pct >= 75 ? 'ELEVATED' : 'NORMAL';

    let rec = 'Standard transit time. Proceed to session 10 minutes prior.';
    if (level === 'CRITICAL') {
      rec = `CRITICAL: ${s.venue_name} is at ${pct}% capacity. Leave 20 minutes early to guarantee seating.`;
    } else if (level === 'ELEVATED') {
      rec = `ELEVATED: ${s.venue_name} is filling up (${pct}%). Arrive 15 minutes prior.`;
    }

    return {
      session_id: s.session_id,
      event_id: s.event_id,
      event_name: s.event_name,
      title: s.title,
      start_time: s.start_time,
      end_time: s.end_time,
      venue_id: s.venue_id,
      venue_name: s.venue_name || 'Main Hall',
      capacity_pct: pct,
      congestion_level: level,
      recommendation: rec,
    };
  });
}

/**
 * 5. getMyNotifications(userId) — Real state-derived actionable alerts
 */
export function getMyNotifications(userId: string): UserNotificationItem[] {
  const notifs: UserNotificationItem[] = [];
  const subs = getMySubmissions(userId);
  const sched = getMySchedule(userId);

  // 1. Incomplete submission alerts
  for (const s of subs) {
    if (s.completion_pct < 100 && s.status !== 'FINAL') {
      const missing: string[] = [];
      if (!s.title) missing.push('Project Title');
      if (!s.problem_statement) missing.push('Problem Statement');
      if (!s.repo_url) missing.push('GitHub Repo');
      if (!s.demo_url) missing.push('Live Demo URL');

      notifs.push({
        id: `notif_sub_${s.event_id}`,
        title: `Incomplete Submission: ${s.event_name}`,
        message: `Your draft is ${s.completion_pct}% complete. Missing: ${missing.join(', ') || 'Final Details'}.`,
        urgency: s.completion_pct < 50 ? 'HIGH' : 'MEDIUM',
        cta_label: 'Complete Submission ➔',
        cta_route: `#/submissions?eventId=${s.event_id}`,
        created_at: new Date().toISOString(),
      });
    }
  }

  // 2. High congestion venue alerts
  for (const item of sched) {
    if (item.congestion_level === 'CRITICAL' || item.congestion_level === 'ELEVATED') {
      notifs.push({
        id: `notif_sched_${item.session_id}`,
        title: `Venue Alert: ${item.venue_name}`,
        message: item.recommendation,
        urgency: item.congestion_level === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        cta_label: 'View Schedule ➔',
        cta_route: '#/dashboard/my-events',
        created_at: new Date().toISOString(),
      });
    }
  }

  return notifs;
}

export function getMyEventEngagements(userId: string) {
  const regs = getMyRegistrations(userId);
  const subs = getMySubmissions(userId);

  return regs.map(r => {
    const matchingSub = subs.find(s => s.event_id === r.id);
    return {
      event_id: r.id,
      event_name: r.title,
      event_slug: r.id,
      registration_type: r.kind,
      team_id: matchingSub?.team_id || null,
      team_name: matchingSub?.team_name || null,
      submission_id: matchingSub?.submission_id || null,
      submission_status: matchingSub?.status || 'NOT_STARTED',
      submission_deadline: r.deadline_or_dates,
      accepts_submissions: true,
    };
  });
}
