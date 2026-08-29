import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import {
  getOpportunityById,
  registerForOpportunity,
  getUserRegistrationStatus,
  getPersonalizedFeed,
} from '../../modules/discovery/index.js';

describe('Opportunity Module Unit Tests', () => {
  before(() => {
    resetDbForTesting();
  });

  it('fetches opportunity by ID with parsed eligibility and responsibilities', () => {
    const opp = getOpportunityById('opp_1');
    assert.ok(opp);
    assert.strictEqual(opp.id, 'opp_1');
    assert.strictEqual(opp.title, 'AI Systems Engineering Intern');
    assert.strictEqual(opp.category, 'INTERNSHIP');
    assert.ok(Array.isArray(opp.eligibility));
    assert.ok(Array.isArray(opp.responsibilities));
    assert.ok(opp.eligibility.length > 0);
    assert.ok(opp.responsibilities.length > 0);
  });

  it('registers user for an opportunity and prevents duplicate errors', () => {
    const userId = 'usr_part_1';
    const oppId = 'opp_1';

    // 1. First registration attempt
    const res1 = registerForOpportunity(oppId, userId);
    assert.strictEqual(res1.success, true);
    assert.ok(res1.registration_id);

    // 2. Registration status check
    const status1 = getUserRegistrationStatus(oppId, userId);
    assert.strictEqual(status1, true);

    // 3. Second duplicate registration attempt (idempotent)
    const res2 = registerForOpportunity(oppId, userId);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.alreadyRegistered, true);
  });

  it('returns false for unregistered user status', () => {
    const status = getUserRegistrationStatus('opp_2', 'usr_unregistered_999');
    assert.strictEqual(status, false);
  });

  it('retrieves personalized feed with eligibility and responsibilities', () => {
    const feed = getPersonalizedFeed('usr_part_1', 'INTERNSHIP');
    assert.ok(Array.isArray(feed));
    assert.ok(feed.length >= 1);
    assert.ok(Array.isArray(feed[0].eligibility));
    assert.ok(Array.isArray(feed[0].responsibilities));
  });
});
