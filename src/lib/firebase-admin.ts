import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const hasFirebaseEnv = Boolean(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
);

if (!hasFirebaseEnv) {
  console.warn('Firebase Admin environment variables are not fully configured. Server-side Firestore access will fail until they are set.');
}

let firebaseApp: App | null = null;
let firestoreInstance: Firestore | null = null;

function initializeFirebaseAdmin(): App {
  if (firebaseApp) {
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyEnv = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyEnv) {
    throw new Error('Missing required Firebase environment variables. Please check your configuration.');
  }

  const privateKey = privateKeyEnv
    .replace(/\\n/g, '\n')
    .replace(/^"|"$/g, '');

  firebaseApp = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

  return firebaseApp;
}

export function getDb(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const app = initializeFirebaseAdmin();
  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}
