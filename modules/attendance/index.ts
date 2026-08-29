import { getDb } from '../common/db.js';
import { emitOutboxEvent } from '../common/outbox.js';
import crypto from 'node:crypto';

// Server ECDSA Key Pair (P-256)
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export function getServerPublicKeyPem(): string {
  return publicKey;
}

export interface QRCredentialPayload {
  credential_id: string;
  event_id: string;
  participant_id: string;
  session_id: string;
  issued_at: number;
  expires_at: number; // 20-30 second rotation
  nonce: string;
}

export interface SignedQRCredential {
  payload: QRCredentialPayload;
  signature: string; // Base64 ECDSA signature
}

/**
 * Server generates short-lived rotating signed QR credential (20-30s TTL).
 */
export function generateQRCredential(
  eventId: string,
  participantId: string,
  sessionId: string,
  ttlSeconds: number = 30
): SignedQRCredential {
  const now = Math.floor(Date.now() / 1000);
  const payload: QRCredentialPayload = {
    credential_id: `cred_${crypto.randomUUID()}`,
    event_id: eventId,
    participant_id: participantId,
    session_id: sessionId,
    issued_at: now,
    expires_at: now + ttlSeconds,
    nonce: crypto.randomBytes(8).toString('hex'),
  };

  const payloadString = JSON.stringify(payload);
  const signer = crypto.createSign('SHA256');
  signer.update(payloadString);
  signer.end();
  const signature = signer.sign(privateKey, 'base64');

  return { payload, signature };
}

/**
 * Scanner verifies signature offline using server Public Key + TTL expiry check.
 */
export function verifyQRCredentialOffline(signedCred: SignedQRCredential, serverPubKey: string = publicKey): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now > signedCred.payload.expires_at) {
    return false; // Expired credential
  }

  const verifier = crypto.createVerify('SHA256');
  verifier.update(JSON.stringify(signedCred.payload));
  verifier.end();
  return verifier.verify(serverPubKey, signedCred.signature, 'base64');
}

/**
 * Server processes check-in synchronously, enforcing server-side authoritative anti-replay TTL store.
 */
export function processCheckInSync(
  signedCred: SignedQRCredential,
  actorId: string
): { success: boolean; message: string; checkin_id?: string } {
  const isValidSig = verifyQRCredentialOffline(signedCred);
  if (!isValidSig) {
    return { success: false, message: 'Invalid or expired QR credential signature' };
  }

  const db = getDb();
  const credId = signedCred.payload.credential_id;
  const nowStr = new Date().toISOString();
  const expiresStr = new Date(signedCred.payload.expires_at * 1000).toISOString();

  // 1. Authoritative Anti-Replay Check
  const used = db.prepare('SELECT credential_id FROM used_credentials WHERE credential_id = ?').get(credId);
  if (used) {
    return { success: false, message: 'Replay detected: QR credential has already been used' };
  }

  // 2. Mark credential as used
  db.prepare('INSERT INTO used_credentials (credential_id, used_at, expires_at) VALUES (?, ?, ?)').run(
    credId,
    nowStr,
    expiresStr
  );

  // 3. Record attendance
  const checkinId = `checkin_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO attendance_records (id, event_id, participant_id, session_id, checked_in_at, credential_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(checkinId, signedCred.payload.event_id, signedCred.payload.participant_id, signedCred.payload.session_id, nowStr, credId);

  // 4. Update participant checked_in state
  db.prepare(`
    UPDATE participants SET checked_in = 1, checkin_time = ? WHERE id = ?
  `).run(nowStr, signedCred.payload.participant_id);

  // 5. Emit Outbox Event
  emitOutboxEvent('PARTICIPANT_CHECKED_IN', 'Participant', signedCred.payload.participant_id, actorId, {
    participant_id: signedCred.payload.participant_id,
    session_id: signedCred.payload.session_id,
    checkin_id: checkinId,
    credential_id: credId,
  });

  return { success: true, message: 'Check-in processed successfully', checkin_id: checkinId };
}
