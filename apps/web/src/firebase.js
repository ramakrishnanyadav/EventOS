import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCb0ImdPWNy3omRb2I-sVXPNOPG9zllxbI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "eventos-97aad.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://eventos-97aad-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "eventos-97aad",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "eventos-97aad.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "972877555580",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:972877555580:web:65dbf43e5fe52c5f4726f9",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-6VX0MD1V6Y",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

export async function syncClientFirestoreProfile(userId, data) {
  if (!userId) return;
  try {
    await setDoc(doc(db, 'profiles', userId), {
      uid: userId,
      ...data,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn('Client Firestore Profile sync warning:', e);
  }
}

export async function loginWithEmail(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (userCredential.user) {
    await sendEmailVerification(userCredential.user);
  }
  return userCredential;
}

export async function loginWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      console.warn('Popup blocked/closed. Retrying with signInWithRedirect...');
      return await signInWithRedirect(auth, googleProvider);
    }
    throw err;
  }
}

export async function loginWithGithub() {
  try {
    return await signInWithPopup(auth, githubProvider);
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      console.warn('Popup blocked/closed. Retrying with signInWithRedirect...');
      return await signInWithRedirect(auth, githubProvider);
    }
    throw err;
  }
}

export async function checkRedirectResult() {
  try {
    return await getRedirectResult(auth);
  } catch (e) {
    return null;
  }
}

export async function sendVerification(user = auth.currentUser) {
  if (user) {
    return await sendEmailVerification(user);
  }
  throw new Error('No active user session to send verification email');
}

export async function resetPassword(email) {
  return await sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  return await signOut(auth);
}

export async function getAuthToken(forceRefresh = false) {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdToken(forceRefresh);
}

export { onAuthStateChanged };
