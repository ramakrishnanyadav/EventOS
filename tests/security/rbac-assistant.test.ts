import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import { handleAssistantQuery } from '../../intelligence/assistant/index.js';

describe('Security & RBAC Policy — Assistant Boundary', () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  test('Participant asking for judge query is REJECTED by Policy Engine before Context & LLM execution', () => {
    const participantUserId = 'usr_part_1';
    const eventId = 'event_hack_2026';

    assert.throws(
      () => {
        handleAssistantQuery(participantUserId, eventId, 'judge_next');
      },
      (err: any) => {
        return err.message.includes('403 Forbidden') && err.message.includes('canAccessJudgingData');
      }
    );
  });

  test('Participant asking for organizer health is REJECTED by Policy Engine', () => {
    const participantUserId = 'usr_part_1';
    const eventId = 'event_hack_2026';

    assert.throws(
      () => {
        handleAssistantQuery(participantUserId, eventId, 'organizer_health');
      },
      (err: any) => {
        return err.message.includes('403 Forbidden') && err.message.includes('canAccessOrganizerDashboard');
      }
    );
  });

  test('Judge asking for judge query is ALLOWED by Policy Engine', () => {
    const judgeUserId = 'usr_judge_1';
    const eventId = 'event_hack_2026';

    const result = handleAssistantQuery(judgeUserId, eventId, 'judge_next');
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.role, 'JUDGE');
  });
});
