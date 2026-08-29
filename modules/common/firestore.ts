import admin from 'firebase-admin';

const firebaseAdmin = (admin as any).default || admin;

// Initialize Firebase Admin SDK if not already initialized
if (firebaseAdmin && (!firebaseAdmin.apps || !firebaseAdmin.apps.length)) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.applicationDefault(),
      });
    } else {
      firebaseAdmin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'eventos-97aad',
      });
    }
  } catch (e: any) {
    console.warn('Firebase Admin SDK init warning:', e.message);
  }
}

export function getFirestoreInstance() {
  try {
    if (firebaseAdmin && firebaseAdmin.apps && firebaseAdmin.apps.length) {
      return firebaseAdmin.firestore();
    }
  } catch (e) {
    // Firestore instance uninitialized or running in limited env
  }
  return null;
}

export async function saveFirestoreProfile(userId: string, profileData: Record<string, any>): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    const docRef = db.collection('profiles').doc(userId);
    await docRef.set({
      uid: userId,
      ...profileData,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e: any) {
    console.warn(`[Firestore Sync Warning] Profiles write for ${userId}:`, e.message);
    return false;
  }
}

export async function saveFirestoreRegistration(userId: string, eventId: string, regData: Record<string, any>): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    const docId = `${userId}_${eventId}`;
    const docRef = db.collection('registrations').doc(docId);
    await docRef.set({
      id: docId,
      user_id: userId,
      event_id: eventId,
      ...regData,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e: any) {
    console.warn(`[Firestore Sync Warning] Registrations write for ${docId}:`, e.message);
    return false;
  }
}

export async function saveFirestoreSubmission(userId: string, eventId: string, subData: Record<string, any>): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    const docId = subData.id || `sub_${userId}_${eventId}`;
    const docRef = db.collection('submissions').doc(docId);
    await docRef.set({
      id: docId,
      user_id: userId,
      event_id: eventId,
      ...subData,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e: any) {
    console.warn(`[Firestore Sync Warning] Submissions write for ${docId}:`, e.message);
    return false;
  }
}

export async function saveFirestoreTeam(teamId: string, teamData: Record<string, any>): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    const docRef = db.collection('teams').doc(teamId);
    await docRef.set({
      team_id: teamId,
      ...teamData,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e: any) {
    console.warn(`[Firestore Sync Warning] Teams write for ${teamId}:`, e.message);
    return false;
  }
}

export async function saveFirestoreAuthAccount(userId: string, accountData: Record<string, any>): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  try {
    const docRef = db.collection('auth_accounts').doc(userId);
    await docRef.set({
      uid: userId,
      ...accountData,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e: any) {
    console.warn(`[Firestore Sync Warning] AuthAccounts write for ${userId}:`, e.message);
    return false;
  }
}
