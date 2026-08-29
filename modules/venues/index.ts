import { getDb } from '../common/db.js';

export interface VenueMetrics {
  id: string;
  name: string;
  capacity: number;
  current_occupancy: number;
  occupancy_pct: number;
  congestion_status: 'NORMAL' | 'HIGH' | 'CRITICAL';
}

export function getVenueMetrics(venueId: string): VenueMetrics | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId) as any;
  if (!row) return null;

  const pct = Math.round((row.current_occupancy / row.capacity) * 100);
  let status: 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL';
  if (pct >= 90) status = 'CRITICAL';
  else if (pct >= 75) status = 'HIGH';

  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    current_occupancy: row.current_occupancy,
    occupancy_pct: pct,
    congestion_status: status,
  };
}

export function getAllVenues(eventId: string): VenueMetrics[] {
  const db = getDb();
  const rows = db.prepare('SELECT id FROM venues WHERE event_id = ?').all(eventId) as any[];
  return rows.map((r) => getVenueMetrics(r.id)!);
}
