import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin for server-side
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    // Check if we have the required environment variables
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      console.error('Missing Firebase environment variables:', {
        projectId: !!process.env.FIREBASE_PROJECT_ID,
        clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: !!process.env.FIREBASE_PRIVATE_KEY
      });
      throw new Error('Missing required Firebase environment variables. Please check your .env.local file.');
    }

    try {
      // Parse the private key properly
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, ''); // Remove surrounding quotes if present

      const app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });

      // Initialize Firestore with explicit settings
      const firestore = getFirestore(app);
      
      return app;
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
      throw error;
    }
  }
  return getApps()[0];
}

// Initialize Firebase Admin
let app;
let db: Firestore;

try {
  app = initializeFirebaseAdmin();
  db = getFirestore(app);
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
  // Re-throw the error to prevent the app from starting with invalid Firebase configuration
  throw error;
}

export { db }; 