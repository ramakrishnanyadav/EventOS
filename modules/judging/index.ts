import { getDb } from '../common/db.js';
import { emitOutboxEvent } from '../common/outbox.js';
import crypto from 'node:crypto';

export type NormalizationStrategy = 'RAW' | 'ZSCORE' | 'TRIMMED_MEAN' | 'MEDIAN' | 'WINSORIZED';

export function submitJudgeScore(
  eventId: string,
  teamId: string,
  judgeUserId: string,
  criteriaScores: Record<string, number>,
  rawScore: number,
  actorId: string
): { success: boolean; message: string; score_id?: string } {
  const db = getDb();

  // 1. Conflict of Interest Check
  const conflict = db.prepare('SELECT id FROM judge_conflicts WHERE judge_user_id = ? AND team_id = ?').get(judgeUserId, teamId);
  if (conflict) {
    return { success: false, message: `Conflict of Interest: Judge '${judgeUserId}' is prohibited from evaluating team '${teamId}'.` };
  }

  // 2. Fetch Active Rubric Version
  const eventRow = db.prepare('SELECT active_rubric_version FROM events WHERE id = ?').get(eventId) as any;
  if (!eventRow) return { success: false, message: `Event '${eventId}' not found.` };

  const rubricRow = db.prepare('SELECT id, max_score FROM rubric_versions WHERE event_id = ? AND version = ?').get(eventId, eventRow.active_rubric_version) as any;
  if (!rubricRow) return { success: false, message: `Active rubric version not found.` };

  // 3. Score Bounds Check
  if (rawScore < 0 || rawScore > rubricRow.max_score) {
    return { success: false, message: `Score Bounds Exceeded: Raw score ${rawScore} must be between 0 and ${rubricRow.max_score}.` };
  }

  const scoreId = `score_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO scores (id, event_id, team_id, judge_user_id, rubric_version_id, criteria_scores_json, raw_score, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(judge_user_id, team_id, rubric_version_id) DO UPDATE SET
        criteria_scores_json = excluded.criteria_scores_json,
        raw_score = excluded.raw_score,
        submitted_at = excluded.submitted_at
    `).run(scoreId, eventId, teamId, judgeUserId, rubricRow.id, JSON.stringify(criteriaScores), rawScore, now);

    // 4. Update normalized score table with default RAW score
    db.prepare(`
      INSERT OR REPLACE INTO normalized_scores (id, event_id, team_id, strategy, final_score, updated_at)
      VALUES (?, ?, ?, 'RAW', ?, ?)
    `).run(`ns_${teamId}`, eventId, teamId, rawScore, now);

    // 5. Check for Cross-Judge Variance Anomaly
    checkAndFlagJudgeAnomalies(eventId, teamId, judgeUserId, rawScore);

    // 6. Emit Outbox Event
    emitOutboxEvent('SCORE_SUBMITTED', 'Judging', teamId, actorId, {
      score_id: scoreId,
      team_id: teamId,
      judge_user_id: judgeUserId,
      raw_score: rawScore,
    });

    return { success: true, message: 'Score submitted successfully', score_id: scoreId };
  } catch (err: any) {
    return { success: false, message: `Score Submission Error: ${err.message}` };
  }
}

/**
 * Check cross-judge variance and raise ANOMALY_DETECTED if variance exceeds threshold.
 * System never auto-adjusts a score—only flags for human organizer review.
 */
export function checkAndFlagJudgeAnomalies(eventId: string, teamId: string, currentJudgeId: string, currentScore: number): void {
  const db = getDb();
  const rows = db.prepare('SELECT raw_score FROM scores WHERE event_id = ? AND team_id = ?').all(eventId, teamId) as any[];
  if (rows.length < 2) return;

  const scores = rows.map((r) => r.raw_score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const deviation = Math.abs(currentScore - avg);

  // If judge score deviates by > 20 points from mean, flag anomaly
  if (deviation > 20.0) {
    const anomalyId = `anom_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO judge_anomalies (id, event_id, team_id, judge_user_id, flag_reason, severity, created_at)
      VALUES (?, ?, ?, ?, ?, 'WARNING', ?)
    `).run(
      anomalyId,
      eventId,
      teamId,
      currentJudgeId,
      `ANOMALY_DETECTED: Judge score ${currentScore} deviates by ${deviation.toFixed(1)} pts from team average (${avg.toFixed(1)} pts)`,
      now
    );

    emitOutboxEvent('JUDGE_ANOMALY_FLAGGED', 'Judging', teamId, currentJudgeId, {
      anomaly_id: anomalyId,
      team_id: teamId,
      judge_user_id: currentJudgeId,
      deviation,
    });
  }
}

/**
 * Normalization Engines: RAW, ZSCORE, TRIMMED_MEAN, MEDIAN, WINSORIZED
 */
export function computeNormalizedScores(scores: number[], strategy: NormalizationStrategy): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];

  const sorted = [...scores].sort((a, b) => a - b);

  switch (strategy) {
    case 'RAW': {
      return sorted.reduce((a, b) => a + b, 0) / sorted.length;
    }
    case 'MEDIAN': {
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case 'TRIMMED_MEAN': {
      if (sorted.length <= 2) return sorted.reduce((a, b) => a + b, 0) / sorted.length;
      // Trim min and max
      const trimmed = sorted.slice(1, sorted.length - 1);
      return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    }
    case 'WINSORIZED': {
      if (sorted.length <= 2) return sorted.reduce((a, b) => a + b, 0) / sorted.length;
      // Replace min with next lowest, replace max with next highest
      const winsorized = [...sorted];
      winsorized[0] = winsorized[1];
      winsorized[winsorized.length - 1] = winsorized[winsorized.length - 2];
      return winsorized.reduce((a, b) => a + b, 0) / winsorized.length;
    }
    case 'ZSCORE': {
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const variance = sorted.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / sorted.length;
      const stdDev = Math.sqrt(variance) || 1;
      // Map z-score mean 0 to 50 scale for display
      return 50 + (mean / stdDev);
    }
    default:
      return sorted.reduce((a, b) => a + b, 0) / sorted.length;
  }
}
