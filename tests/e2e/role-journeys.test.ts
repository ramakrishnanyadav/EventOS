import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import { handleAssistantQuery } from '../../intelligence/assistant/index.js';

describe('E2E Role Journeys', () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  test('Participant Journey: Query "What do I need to do now?" returns time-specific recommendation', () => {
    const res = handleAssistantQuery('usr_part_1', 'event_hack_2026', 'participant_now');
    assert.strictEqual(res.authorized, true);
    assert.strictEqual(res.role, 'PARTICIPANT');
    assert.ok(res.explanation.includes('28 minutes left'));
    assert.ok(res.explanation.includes('Hall B'));
  });

  test('Judge Journey: Query "What should I evaluate next?" ranks assigned non-conflicted team', () => {
    const res = handleAssistantQuery('usr_judge_1', 'event_hack_2026', 'judge_next');
    assert.strictEqual(res.authorized, true);
    assert.strictEqual(res.role, 'JUDGE');
    assert.strictEqual(res.decision.recommended_team_id, 'team_42');
  });

  test('Organizer Journey: Query "Is everything okay?" produces Health Score 87/100 and top risks', () => {
    const res = handleAssistantQuery('usr_org_1', 'event_hack_2026', 'organizer_health');
    assert.strictEqual(res.authorized, true);
    assert.strictEqual(res.role, 'ORGANIZER');
    assert.strictEqual(res.decision.event_health_score, 87);
    assert.ok(res.explanation.includes('Event Health is 87/100'));
  });
});
