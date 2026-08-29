import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import { verifyFirebaseToken } from '../../modules/profile/index.js';
import { getPersonalizedFeed, searchOpportunities, checkRateLimit } from '../../modules/discovery/index.js';
import { getUserLeaderboardSnapshot } from '../../modules/ranking/index.js';

describe('Discovery & Personalization Integration Tests', () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  it('verifies Firebase ID Token server-side and returns user session', async () => {
    const auth = await verifyFirebaseToken('usr_part_1');
    assert.strictEqual(auth.user_id, 'usr_part_1');
    assert.strictEqual(auth.email, 'usr_part_1@dev.com');
    assert.strictEqual(auth.email_verified, true);
  });

  it('ranks personalized feed with visibly different order for users with different skills and career goals', () => {
    // User A: Ramakrishna (Interest: AI/ML, Skills: React, TypeScript, AI/ML)
    const feedUserA = getPersonalizedFeed('usr_part_1');
    
    // User C: Michael (Interest: Cloud Infrastructure, Skills: DevOps)
    const feedUserC = getPersonalizedFeed('usr_part_3');

    assert.ok(feedUserA.length > 0);
    assert.ok(feedUserC.length > 0);

    // Top recommendation for User A should be AI/ML related
    const topA = feedUserA[0];
    assert.ok(topA.field_of_interest === 'AI/ML' || topA.tags.includes('ai_ml') || topA.tags.includes('react'));

    // Top recommendation for User C should be Cloud Infrastructure / DevOps related
    const topC = feedUserC[0];
    assert.ok(topC.field_of_interest === 'Cloud Infrastructure' || topC.tags.includes('devops') || topC.tags.includes('sqlite'));

    // The feed order between User A and User C must differ!
    assert.notStrictEqual(topA.id, topC.id, 'Personalized feed order must visibly differ for users with different career goals and skills');
  });

  it('enforces rate limiting on search endpoint to prevent scraping', () => {
    const clientId = 'test_scraper_ip_123';
    
    // Perform requests up to limit
    for (let i = 0; i < 60; i++) {
      checkRateLimit(clientId, 60);
    }

    // 61st request must be blocked with rate limit error
    assert.throws(() => {
      checkRateLimit(clientId, 60);
    }, /Rate limit exceeded/);
  });

  it('aggregates global user leaderboard using points ledger O(log n) ranking pattern', () => {
    const leaderboard = getUserLeaderboardSnapshot();
    assert.ok(Array.isArray(leaderboard));
    assert.ok(leaderboard.length > 0);

    // Order check: highest points first
    assert.ok(leaderboard[0].total_points >= leaderboard[leaderboard.length - 1].total_points);
  });
});
