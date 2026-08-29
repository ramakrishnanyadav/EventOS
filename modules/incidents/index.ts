import { getDb } from '../common/db.js';

export interface IncidentRecord {
  id: string;
  event_id: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: 'OPEN' | 'RESOLVED';
  created_at: string;
}

export function getOpenIncidents(eventId: string): IncidentRecord[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM incidents WHERE event_id = ? AND status = 'OPEN' ORDER BY created_at DESC").all(eventId) as any[];
  return rows as IncidentRecord[];
}
