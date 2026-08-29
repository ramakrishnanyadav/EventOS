import { getDb } from '../common/db.js';
import { emitOutboxEvent } from '../common/outbox.js';

export interface LeaderboardEntry {
  rank: number;
  team_id: string;
  team_name: string;
  score: number;
  status: string;
}

export function rebuildLeaderboardProjection(eventId: string, actorId: string): { sequence_number: number; rankings: LeaderboardEntry[] } {
  const db = getDb();
  
  // Query teams, submissions, and normalized scores
  const rows = db.prepare(`
    SELECT 
      t.id as team_id,
      t.name as team_name,
      COALESCE(sub.status, 'NO_SUBMISSION') as submission_status,
      COALESCE(ns.final_score, 0.0) as score
    FROM teams t
    LEFT JOIN submissions sub ON sub.team_id = t.id
    LEFT JOIN normalized_scores ns ON ns.team_id = t.id
    WHERE t.event_id = ?
    ORDER BY score DESC, t.name ASC
  `).all(eventId) as any[];

  const rankings: LeaderboardEntry[] = rows.map((r, idx) => ({
    rank: idx + 1,
    team_id: r.team_id,
    team_name: r.team_name,
    score: Number(r.score.toFixed(1)),
    status: r.submission_status,
  }));

  // Increment sequence number
  const currentProj = db.prepare('SELECT sequence_number FROM leaderboard_projections WHERE event_id = ?').get(eventId) as any;
  const nextSeq = (currentProj?.sequence_number ?? 0) + 1;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO leaderboard_projections (event_id, rankings_json, sequence_number, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(eventId, JSON.stringify(rankings), nextSeq, now);

  emitOutboxEvent('LEADERBOARD_PROJECTION_UPDATED', 'Leaderboard', eventId, actorId, {
    event_id: eventId,
    sequence_number: nextSeq,
    rankings_count: rankings.length,
  });

  return { sequence_number: nextSeq, rankings };
}

export function getLeaderboardSnapshot(eventId: string): { sequence_number: number; rankings: LeaderboardEntry[] } {
  const db = getDb();
  const row = db.prepare('SELECT rankings_json, sequence_number FROM leaderboard_projections WHERE event_id = ?').get(eventId) as any;
  if (!row) return { sequence_number: 0, rankings: [] };
  return {
    sequence_number: row.sequence_number,
    rankings: JSON.parse(row.rankings_json),
  };
}

export interface UserLeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  handle: string;
  institution: string;
  total_points: number;
  badge_count: number;
}

export function getUserLeaderboardSnapshot(): UserLeaderboardEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT 
      p.user_id,
      p.name,
      p.handle,
      p.institution,
      COALESCE(SUM(l.points), 0) as total_points,
      (SELECT COUNT(*) FROM user_badges ub WHERE ub.user_id = p.user_id) as badge_count
    FROM user_profiles_v2 p
    LEFT JOIN points_ledger l ON l.user_id = p.user_id
    GROUP BY p.user_id
    ORDER BY total_points DESC, p.name ASC
  `).all() as any[];

  return rows.map((r, idx) => ({
    rank: idx + 1,
    user_id: r.user_id,
    name: r.name,
    handle: r.handle,
    institution: r.institution,
    total_points: Number(r.total_points),
    badge_count: Number(r.badge_count),
  }));
}

