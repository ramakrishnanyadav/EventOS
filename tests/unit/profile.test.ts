import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import {
  canonicalizeSkill,
  addLedgerEntry,
  getStreakInfo,
  getUserPointsTotal,
  evaluateAndAwardBadges,
  getUserBadges,
  validateAndStoreResume,
  checkHandleAvailability,
  saveOnboardingStep,
  filterProfileVisibility,
} from '../../modules/profile/index.js';

describe('Profile Module Unit Tests', () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  it('canonicalizes string variants into a single canonical skill id', () => {
    const res1 = canonicalizeSkill('React.js');
    const res2 = canonicalizeSkill('React');
    const res3 = canonicalizeSkill('Frontend React');

    assert.strictEqual(res1.canonical_id, 'react');
    assert.strictEqual(res2.canonical_id, 'react');
    assert.strictEqual(res3.canonical_id, 'react');
    assert.strictEqual(res1.display_name, 'React');
  });

  it('maintains immutable points ledger, total points aggregate, and streak calculation', () => {
    const userId = 'usr_part_1';
    const initialPoints = getUserPointsTotal(userId);

    addLedgerEntry(userId, 'DAILY_SUBMISSION', 100, { eventId: 'event_hack_2026' });

    const newPoints = getUserPointsTotal(userId);
    assert.strictEqual(newPoints, initialPoints + 100);

    const streak = getStreakInfo(userId);
    assert.strictEqual(typeof streak.current_streak, 'number');
    assert.strictEqual(typeof streak.max_streak, 'number');
    assert.ok(streak.current_streak >= 1);
  });

  it('evaluates rule-based badges on profile completion', () => {
    const userId = 'usr_part_1';
    const awarded = evaluateAndAwardBadges(userId);
    assert.ok(Array.isArray(awarded));

    const badges = getUserBadges(userId);
    assert.ok(badges.some(b => b.code === 'PROFILE_COMPLETE'));
  });

  it('enforces PDF resume type allowlist and file size limits', () => {
    const userId = 'usr_part_1';

    // Valid PDF
    const valid = validateAndStoreResume(userId, 'my_resume.pdf', 'application/pdf', 2 * 1024 * 1024);
    assert.ok(valid.signed_url.includes('token='));

    // Invalid non-PDF file
    assert.throws(() => {
      validateAndStoreResume(userId, 'malicious.exe', 'application/x-msdownload', 1024);
    }, /Only PDF resumes are allowlisted/);

    // Exceeding 10MB limit
    assert.throws(() => {
      validateAndStoreResume(userId, 'huge_resume.pdf', 'application/pdf', 15 * 1024 * 1024);
    }, /exceeds 10MB limit/);
  });

  it('verifies unique handle availability check live at DB level', () => {
    const isAvailable1 = checkHandleAvailability('ramakrishna');
    assert.strictEqual(isAvailable1, false, 'Handle @ramakrishna is taken');

    const isAvailable2 = checkHandleAvailability('unique_brand_new_handle_99');
    assert.strictEqual(isAvailable2, true, 'Brand new handle should be available');
  });

  it('sanitizes public profile output by removing private fields server-side', () => {
    const fullProfile = {
      user_id: 'usr_part_1',
      name: 'Ramakrishna Yadav',
      handle: 'ramakrishna',
      email: 'ramakrishna@dev.com',
      cgpa: 3.92,
      resume_url: '/storage/resumes/signed_path.pdf',
      education: [{ degree: 'MCA', cgpa: 3.92 }],
      achievements: { verified: [], self_reported: [] },
    };

    const publicView = filterProfileVisibility(fullProfile, 'public');
    assert.strictEqual(publicView.resume_url, undefined, 'Public viewer must NOT receive resume_url');
    assert.strictEqual(publicView.email, undefined, 'Public viewer must NOT receive email');
    assert.strictEqual(publicView.cgpa, undefined, 'Public viewer must NOT receive cgpa');

    const ownerView = filterProfileVisibility(fullProfile, 'owner');
    assert.strictEqual(ownerView.resume_url, '/storage/resumes/signed_path.pdf');
    assert.strictEqual(ownerView.email, 'ramakrishna@dev.com');
  });
});
