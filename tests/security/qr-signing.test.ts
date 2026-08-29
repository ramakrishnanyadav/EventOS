import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resetDbForTesting } from '../../modules/common/db.js';
import {
  generateQRCredential,
  verifyQRCredentialOffline,
  processCheckInSync,
  getServerPublicKeyPem,
} from '../../modules/attendance/index.js';

describe('QR Security — Asymmetric Signing & Anti-Replay', () => {
  beforeEach(() => {
    resetDbForTesting();
  });

  test('Server signs rotating token with ECDSA private key and offline scanner verifies with public key', () => {
    const cred = generateQRCredential('event_hack_2026', 'part_1', 'sess_ws_1', 30);
    const pubKey = getServerPublicKeyPem();

    const isValid = verifyQRCredentialOffline(cred, pubKey);
    assert.strictEqual(isValid, true);
  });

  test('Tampered QR payload fails offline signature verification', () => {
    const cred = generateQRCredential('event_hack_2026', 'part_1', 'sess_ws_1', 30);
    const tampered = JSON.parse(JSON.stringify(cred));
    tampered.payload.participant_id = 'hacker_99'; // Tamper participant ID

    const isValid = verifyQRCredentialOffline(tampered);
    assert.strictEqual(isValid, false);
  });

  test('Server authoritative anti-replay store blocks duplicate scan of the same credential_id', () => {
    const cred = generateQRCredential('event_hack_2026', 'part_1', 'sess_ws_1', 30);

    // 1st checkin -> Success
    const res1 = processCheckInSync(cred, 'usr_part_1');
    assert.strictEqual(res1.success, true);

    // 2nd checkin with same credential -> Replay Detected
    const res2 = processCheckInSync(cred, 'usr_part_1');
    assert.strictEqual(res2.success, false);
    assert.ok(res2.message.includes('Replay detected'));
  });
});
