import { getDb } from '../common/db.js';
import { emitOutboxEvent } from '../common/outbox.js';
import crypto from 'node:crypto';

export interface EventConfig {
  id: string;
  org_id: string;
  name: string;
  active_rubric_version: number;
  active_ranking_version: number;
  active_team_policy_version: number;
  created_at: string;
}

export function getEventConfig(eventId: string): EventConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as any;
  if (!row) return null;
  return row as EventConfig;
}

export function createNewRubricVersion(eventId: string, criteria: any[], actorId: string): number {
  const db = getDb();
  const event = getEventConfig(eventId);
  if (!event) throw new Error(`Event '${eventId}' not found.`);

  const nextVersion = event.active_rubric_version + 1;
  const newRubricId = `rubric_v${nextVersion}_${crypto.randomUUID().substring(0, 6)}`;
  const now = new Date().toISOString();

  // Immutable insert for new config version
  db.prepare(`
    INSERT INTO rubric_versions (id, event_id, version, criteria_json, max_score, created_at)
    VALUES (?, ?, ?, ?, 100.0, ?)
  `).run(newRubricId, eventId, nextVersion, JSON.stringify(criteria), now);

  // Update active pointer on event record
  db.prepare(`
    UPDATE events SET active_rubric_version = ? WHERE id = ?
  `).run(nextVersion, eventId);

  emitOutboxEvent('EVENT_RUBRIC_UPDATED', 'Event', eventId, actorId, {
    event_id: eventId,
    new_version: nextVersion,
    rubric_id: newRubricId,
  });

  return nextVersion;
}
