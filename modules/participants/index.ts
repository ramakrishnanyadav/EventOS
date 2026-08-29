import { getDb } from '../common/db.js';

export interface ParticipantRecord {
  id: string;
  user_id: string;
  event_id: string;
  checked_in: boolean;
  checkin_time: string | null;
}

export interface EventEngagement {
  event_id: string;
  event_name: string;
  event_slug: string;
  registration_type: 'EVENT' | 'OPPORTUNITY';
  team_id: string | null;
  team_name: string | null;
  submission_id: string | null;
  submission_status: 'NOT_STARTED' | 'DRAFT' | 'FINAL';
  submission_deadline: string;
  accepts_submissions: boolean;
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
 * Single source of truth returning all event & opportunity engagements for a user
 */
export function getMyEventEngagements(userId: string): EventEngagement[] {
  if (!userId) return [];
  const db = getDb();
  const engagements: EventEngagement[] = [];

  // 1. Direct Event Registrations (participants table)
  const participantRows = db.prepare(`
    SELECT p.event_id, e.name as event_name, e.slug as event_slug, e.registration_deadline, e.status
    FROM participants p
    JOIN events e ON p.event_id = e.id
    WHERE p.user_id = ?
  `).all(userId) as any[];

  for (const p of participantRows) {
    // Check team membership
    const tm = db.prepare(`
      SELECT tm.team_id, t.name as team_name
      FROM team_members tm
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.user_id = ? AND tm.event_id = ?
    `).get(userId, p.event_id) as any;

    let submissionId: string | null = null;
    let submissionStatus: 'NOT_STARTED' | 'DRAFT' | 'FINAL' = 'NOT_STARTED';

    if (tm) {
      const sub = db.prepare('SELECT id, status FROM submissions WHERE team_id = ?').get(tm.team_id) as any;
      if (sub) {
        submissionId = sub.id;
        submissionStatus = sub.status === 'FINAL' ? 'FINAL' : 'DRAFT';
      }
    }

    engagements.push({
      event_id: p.event_id,
      event_name: p.event_name,
      event_slug: p.event_slug,
      registration_type: 'EVENT',
      team_id: tm ? tm.team_id : null,
      team_name: tm ? tm.team_name : null,
      submission_id: submissionId,
      submission_status: submissionStatus,
      submission_deadline: p.registration_deadline,
      accepts_submissions: true,
    });
  }

  // 2. Opportunity Registrations (HACKATHON / COMPETITION categories)
  const oppRows = db.prepare(`
    SELECT r.opportunity_id, o.title as event_name, o.category, o.deadline, o.created_at
    FROM opportunity_registrations r
    JOIN opportunities o ON r.opportunity_id = o.id
    WHERE r.user_id = ? AND o.category IN ('HACKATHON', 'COMPETITION', 'INTERNSHIP', 'JOB', 'MOCK_TEST', 'MOCK_INTERVIEW', 'MENTORSHIP')
  `).all(userId) as any[];

  for (const o of oppRows) {
    // Avoid duplicate if already added as an event
    if (!engagements.some(e => e.event_id === o.opportunity_id)) {
      const acceptsSubmissions = ['HACKATHON', 'COMPETITION'].includes(o.category);
      
      // Check if submission exists
      const sub = db.prepare('SELECT id, status FROM submissions WHERE event_id = ? AND team_id IN (SELECT team_id FROM team_members WHERE user_id = ?)').get(o.opportunity_id, userId) as any
               || db.prepare('SELECT id, status FROM submissions WHERE event_id = ?').get(o.opportunity_id) as any;

      let subId: string | null = sub ? sub.id : null;
      let subStatus: 'NOT_STARTED' | 'DRAFT' | 'FINAL' = sub ? (sub.status === 'FINAL' ? 'FINAL' : 'DRAFT') : 'NOT_STARTED';

      engagements.push({
        event_id: o.opportunity_id,
        event_name: o.event_name,
        event_slug: `opp-${o.opportunity_id}`,
        registration_type: 'OPPORTUNITY',
        team_id: `team_${o.opportunity_id}_${userId}`,
        team_name: `Team ${o.event_name.slice(0, 12)}`,
        submission_id: subId || `sub_${o.opportunity_id}_${userId}`,
        submission_status: subStatus,
        submission_deadline: o.deadline,
        accepts_submissions: acceptsSubmissions,
      });
    }
  }

  return engagements;
}
