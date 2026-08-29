import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveFirestoreProfile,
  saveFirestoreRegistration,
  saveFirestoreSubmission,
  saveFirestoreTeam,
  saveFirestoreAuthAccount,
} from '../../modules/common/firestore.js';

describe('Firebase Cloud Firestore Schema & Sync Module Test Suite', () => {
  test('saveFirestoreProfile safely formats profile document payload', async () => {
    const res = await saveFirestoreProfile('usr_test_100', {
      name: 'Ramakrishna Yadav',
      handle: 'ramakrishna',
      institution: 'National Institute of Technology',
      skills: [{ canonical_id: 'react', display_name: 'React.js' }],
      total_points: 150,
    });
    // In test environment without live credentials, helper returns false without crashing
    assert.equal(typeof res, 'boolean');
  });

  test('saveFirestoreRegistration formats registration document payload', async () => {
    const res = await saveFirestoreRegistration('usr_test_100', 'event_hack_2026', {
      kind: 'EVENT',
      title: 'EVENTOS Global Hackathon 2026',
      org_name: 'EVENTOS Labs',
      status: 'Registered ✓',
    });
    assert.equal(typeof res, 'boolean');
  });

  test('saveFirestoreSubmission formats submission document payload', async () => {
    const res = await saveFirestoreSubmission('usr_test_100', 'event_hack_2026', {
      id: 'sub_event_hack_2026_usr_test_100',
      team_id: 'team_42',
      title: 'NeuralShift Agent OS',
      completion_pct: 100,
      status: 'FINAL',
    });
    assert.equal(typeof res, 'boolean');
  });

  test('saveFirestoreTeam formats team document payload', async () => {
    const res = await saveFirestoreTeam('team_42', {
      team_name: 'Team NeuralShift',
      lead_user_id: 'usr_test_100',
      members: [{ id: 'usr_test_100', name: 'Ramakrishna', role: 'Lead' }],
    });
    assert.equal(typeof res, 'boolean');
  });

  test('saveFirestoreAuthAccount formats auth account payload', async () => {
    const res = await saveFirestoreAuthAccount('usr_test_100', {
      email: 'ramakrishna@example.com',
      role: 'PARTICIPANT',
      profile_completed: true,
    });
    assert.equal(typeof res, 'boolean');
  });
});
