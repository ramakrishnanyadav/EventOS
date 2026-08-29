import { getDb } from '../common/db.js';

export interface ParticipantRecord {
  id: string;
  user_id: string;
  event_id: string;
  checked_in: boolean;
  checkin_time: string | null;
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
