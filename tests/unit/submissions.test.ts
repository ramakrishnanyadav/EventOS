import test from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import { getMyEventEngagements } from '../../modules/participants/index.js';
import { getSubmissionById, saveSubmission } from '../../modules/submissions/index.js';
import { registerForOpportunity } from '../../modules/discovery/index.js';

test('Submissions & Engagements Module Unit Tests', async (t) => {
  resetDbForTesting();

  await t.test('returns empty array for user with zero registrations', () => {
    const engagements = getMyEventEngagements('user_with_zero_registrations_99');
    assert.strictEqual(Array.isArray(engagements), true);
    assert.strictEqual(engagements.length, 0);
  });

  await t.test('joins opportunity registrations and generates submission-eligible engagement', () => {
    const userId = 'usr_part_1';
    const oppId = 'opp_7'; // Seeded hackathon opportunity (EVENTOS Global Hackathon 2026)

    registerForOpportunity(oppId, userId);

    const engagements = getMyEventEngagements(userId);
    assert.strictEqual(engagements.length >= 1, true);

    const match = engagements.find(e => e.event_id === oppId);
    assert.ok(match, 'Engagement match should exist');
    assert.strictEqual(match?.registration_type, 'OPPORTUNITY');
    assert.strictEqual(match?.accepts_submissions, true);
  });

  await t.test('saves submission draft and updates status retrieved by getSubmissionById', () => {
    const subId = 'sub_neuralshift_1'; // Existing seeded submission ID for team_42
    const eventId = 'event_hack_2026';
    const teamId = 'team_42';
    const userId = 'usr_part_1';

    const saveRes = saveSubmission(
      subId,
      eventId,
      teamId,
      'Test AI Agent OS',
      'Solving live event ops',
      'https://github.com/test/repo',
      'https://demo.test.com',
      85,
      false,
      userId
    );

    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(saveRes.submission.status, 'DRAFT');

    const fetched = getSubmissionById(subId);
    assert.ok(fetched);
    assert.strictEqual(fetched?.title, 'Test AI Agent OS');
    assert.strictEqual(fetched?.repo_url, 'https://github.com/test/repo');
    assert.strictEqual(fetched?.status, 'DRAFT');
  });

});
