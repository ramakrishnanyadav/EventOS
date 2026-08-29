# Security Guidelines — Firebase Credentials & API Protection

## Firebase Client API Key vs. Admin SDK Service Account

### 1. Firebase Web API Key (`VITE_FIREBASE_API_KEY`)
- **Public by Design**: The Client API Key identifies your Firebase web project to Google servers. It is included in client JS bundles and is **publicly accessible by design**.
- **Security Boundary**: The API key is **NOT** a secret key and does not grant administrative database access. Security is enforced on Google Firebase servers via:
  - **Firebase Security Rules** (Firestore / Realtime Database / Storage)
  - **Authorized Domains** list in Firebase Console (restricting auth popups to your domain)
  - **App Check** (optional attestation)

### 2. Firebase Admin SDK Service Account Key (`FIREBASE_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`)
- **CRITICAL PRIVATE SECRET**: The Admin SDK key grants full, un-restricted administrative control over your entire Firebase project, bypassing all security rules and client authorization gates.
- **Rules**:
  - **NEVER** expose the Admin SDK key in client code (`apps/web`).
  - **NEVER** commit service account JSON files to git.
  - **ALWAYS** load via server environment variables (`FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS`).
  - Add all service account JSON patterns to `.gitignore`.

---

## Server Identity & Token Verification

- Client-supplied headers such as `x-user-id` or `x-user-role` are **never trusted** as security boundaries.
- Protected API routes (`/api/*`) require a valid Firebase ID Token sent via `Authorization: Bearer <idToken>`.
- The server validates the Bearer token using Firebase Admin SDK (`admin.auth().verifyIdToken(idToken)`) and extracts identity and custom claims server-side.
