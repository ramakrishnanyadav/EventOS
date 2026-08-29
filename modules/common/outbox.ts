import { getDb } from './db.js';
import crypto from 'node:crypto';

export interface OutboxEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id: string;
  sequence_number: number;
  payload: Record<string, any>;
  created_at: string;
}

let currentSequenceNumber = 1;

export function emitOutboxEvent(
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  actorId: string,
  payload: Record<string, any>
): OutboxEvent {
  const db = getDb();
  const eventId = `evt_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // Get current max sequence number
  const row = db.prepare('SELECT MAX(sequence_number) as max_seq FROM outbox_events').get() as { max_seq: number | null };
  const nextSeq = (row?.max_seq ?? 0) + 1;
  currentSequenceNumber = nextSeq;

  const event: OutboxEvent = {
    id: eventId,
    event_type: eventType,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    actor_id: actorId,
    sequence_number: nextSeq,
    payload,
    created_at: now,
  };

  db.prepare(`
    INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, actor_id, sequence_number, payload_json, processed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    event.id,
    event.event_type,
    event.aggregate_type,
    event.aggregate_id,
    event.actor_id,
    event.sequence_number,
    JSON.stringify(event.payload),
    event.created_at
  );

  return event;
}

export function processUnprocessedOutboxEvents(): OutboxEvent[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, event_type, aggregate_type, aggregate_id, actor_id, sequence_number, payload_json, created_at
    FROM outbox_events
    WHERE processed = 0
    ORDER BY sequence_number ASC
  `).all() as any[];

  const processed: OutboxEvent[] = [];

  for (const row of rows) {
    db.prepare('UPDATE outbox_events SET processed = 1 WHERE id = ?').run(row.id);
    processed.push({
      id: row.id,
      event_type: row.event_type,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      actor_id: row.actor_id,
      sequence_number: row.sequence_number,
      payload: JSON.parse(row.payload_json),
      created_at: row.created_at,
    });
  }

  return processed;
}
