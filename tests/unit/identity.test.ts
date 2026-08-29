import test from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import { ensureProfileExists, updateUserProfile, getFullProfile } from '../../modules/profile/index.js';

test('Single Source of Truth User Identity Test Suite', async (t) => {
  resetDbForTesting();

  await t.test('ensureProfileExists creates honest clean initial profile for new user', () => {
    const userId = 'user_new_test_100';
    const email = 'newuser@example.com';
    const name = 'Sarah Connor';

    const prof = ensureProfileExists(userId, email, name);

    assert.ok(prof);
    assert.strictEqual(prof.user_id, userId);
    assert.strictEqual(prof.name, 'Sarah Connor');
    assert.strictEqual(prof.institution, 'Not set yet');
    assert.strictEqual(prof.gamification.total_points, 0);
    assert.strictEqual(Array.isArray(prof.skills), true);
    assert.strictEqual(prof.skills.length, 0);
  });

  await t.test('updateUserProfile persists identity, education, skills, and goals incrementally', () => {
    const userId = 'user_new_test_100';

    // Step 1: Identity update
    const p1 = updateUserProfile(userId, { name: 'Sarah Connor Tech', handle: 'sarah_tech' });
    assert.strictEqual(p1.name, 'Sarah Connor Tech');
    assert.strictEqual(p1.handle, 'sarah_tech');

    // Step 2: Education update
    const p2 = updateUserProfile(userId, { institution: 'MIT', degree: 'BS', field: 'Robotics' });
    assert.strictEqual(p2.institution, 'MIT');
    assert.strictEqual(p2.education.length, 1);
    assert.strictEqual(p2.education[0].institution, 'MIT');

    // Step 3: Skills update
    const p3 = updateUserProfile(userId, { skills: ['React.js', 'PyTorch', 'Rust'] });
    assert.strictEqual(p3.skills.length, 3);
    assert.strictEqual(p3.skills.some((s: any) => s.canonical_id === 'react'), true);

    // Step 4: Goals update
    const p4 = updateUserProfile(userId, { goals: { field_of_interest: 'AI/ML' } });
    assert.strictEqual(p4.profile_completed, 1);
  });

  await t.test('getFullProfile returns honest zero values for new account', () => {
    const userId = 'user_brand_new_99';
    ensureProfileExists(userId, 'fresh@dev.com', 'Fresh User');

    const full = getFullProfile(userId);
    assert.ok(full);
    assert.strictEqual(full.name, 'Fresh User');
    assert.strictEqual(full.gamification.total_points, 0);
    assert.strictEqual(full.activity_streak.current_streak, 0);
  });

});
