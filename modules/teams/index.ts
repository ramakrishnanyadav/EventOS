import { getDb } from '../common/db.js';
import { emitOutboxEvent } from '../common/outbox.js';
import crypto from 'node:crypto';

export function joinTeam(teamId: string, userId: string, eventId: string): { success: boolean; message: string } {
  const db = getDb();
  
  // Check if participant already has an active team for this event (DB UNIQUE constraint + app check)
  const existing = db.prepare('SELECT team_id FROM team_members WHERE user_id = ? AND event_id = ?').get(userId, eventId) as any;
  if (existing) {
    return { success: false, message: `Invariant Violation: Participant '${userId}' is already a member of active team '${existing.team_id}' for event '${eventId}'.` };
  }

  const memberId = `tm_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  try {
    db.prepare('INSERT INTO team_members (id, team_id, user_id, event_id, joined_at) VALUES (?, ?, ?, ?, ?)').run(
      memberId,
      teamId,
      userId,
      eventId,
      now
    );

    emitOutboxEvent('TEAM_MEMBER_JOINED', 'Team', teamId, userId, {
      team_id: teamId,
      user_id: userId,
      event_id: eventId,
    });

    return { success: true, message: 'Successfully joined team' };
  } catch (err: any) {
    return { success: false, message: `DB Constraint Error: ${err.message}` };
  }
}
