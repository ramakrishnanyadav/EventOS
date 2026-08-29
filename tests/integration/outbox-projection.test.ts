import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting, getDb } from '../../modules/common/db.js';
import { processUnprocessedOutboxEvents } from '../../modules/common/outbox.js';
import { submitJudgeScore } from '../../modules/judging/index.js';
import { rebuildLeaderboardProjection, getLeaderboardSnapshot } from '../../modules/ranking/index.js';

describe('Integration — Outbox Relay & Monotonic Leaderboard Projections', () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  test('Submitting score writes to outbox_events in transaction and increments leaderboard sequence number', () => {
    const eventId = 'event_hack_2026';
    const teamId = 'team_42';
    const judgeId = 'usr_judge_1';

    // 1. Submit judge score
    const result = submitJudgeScore(eventId, teamId, judgeId, { tech: 38, impact: 38, design: 18 }, 94.0, judgeId);
    assert.strictEqual(result.success, true);

    // 2. Verify outbox event written
    const outboxEvents = processUnprocessedOutboxEvents();
    assert.ok(outboxEvents.length >= 1);
    assert.ok(outboxEvents.some((e) => e.event_type === 'SCORE_SUBMITTED'));

    // 3. Rebuild leaderboard projection
    const proj = rebuildLeaderboardProjection(eventId, judgeId);
    assert.ok(proj.sequence_number >= 2);

    // 4. Verify rank #1 is Team 42 with 94.0 pts
    const snapshot = getLeaderboardSnapshot(eventId);
    assert.strictEqual(snapshot.rankings[0].team_id, 'team_42');
    assert.strictEqual(snapshot.rankings[0].score, 94.0);
  });
});
