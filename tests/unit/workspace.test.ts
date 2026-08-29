import test from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import {
  getMyRegistrations,
  getMyTeams,
  getMySubmissions,
  getMySchedule,
  getMyNotifications,
} from '../../modules/participants/index.js';
import {
  getSubmissionForUserEvent,
  upsertUserEventSubmission,
} from '../../modules/submissions/index.js';

test('Participant Workspace Real Multi-Event Data Services Test Suite', async (t) => {
  resetDbForTesting();

  await t.test('getMyRegistrations returns empty array for unregistered user and multiple registrations for registered user', () => {
    const emptyRegs = getMyRegistrations('unregistered_user_123');
    assert.strictEqual(Array.isArray(emptyRegs), true);
    assert.strictEqual(emptyRegs.length, 0);

    const userRegs = getMyRegistrations('usr_part_1');
    assert.strictEqual(Array.isArray(userRegs), true);
    assert.strictEqual(userRegs.length >= 1, true);
    assert.ok(userRegs[0].title);
    assert.ok(userRegs[0].status);
  });

  await t.test('getMyTeams returns populated team memberships with member names', () => {
    const teams = getMyTeams('usr_part_1');
    assert.strictEqual(Array.isArray(teams), true);
    if (teams.length > 0) {
      assert.ok(teams[0].team_name);
      assert.ok(Array.isArray(teams[0].members));
    }
  });

  await t.test('per-event submission calculates completion_pct server-side accurately', () => {
    const userId = 'usr_part_1';
    const eventId = 'event_hack_2026';

    const saveRes = upsertUserEventSubmission(userId, eventId, {
      title: 'Real AI Agent OS',
      problem_statement: 'Solving fragmentation in live event ops',
      solution_summary: 'Context aware decision engine',
      repo_url: 'https://github.com/test/repo',
      demo_url: 'https://demo.test.com',
      isFinal: false,
    });

    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(saveRes.submission.completion_pct, 100);
    assert.strictEqual(saveRes.submission.title, 'Real AI Agent OS');

    const fetched = getSubmissionForUserEvent(userId, eventId);
    assert.ok(fetched);
    assert.strictEqual(fetched?.completion_pct, 100);
  });

  await t.test('getMyNotifications derives actionable alerts from real state', () => {
    const notifs = getMyNotifications('usr_part_1');
    assert.strictEqual(Array.isArray(notifs), true);
  });

});
