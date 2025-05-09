import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin for server-side
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    // Check if we have the required environment variables
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Missing required Firebase environment variables. Please check your .env.local file.');
    }

    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The private key needs to be properly formatted
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
    });
  }
  return getApps()[0];
}

// Initialize Firebase Admin
const app = initializeFirebaseAdmin();
const db = getFirestore(app);

// Webhook configuration
export async function getWebhookConfig() {
  try {
    const configRef = db.collection('config').doc('webhook');
    const configDoc = await configRef.get();
    
    if (configDoc.exists) {
      return configDoc.data();
    }
    
    // Return default config if none exists
    const defaultConfig = {
      url: process.env.WEBHOOK_URL || '',
      enabled: true,
      lastUpdated: new Date().toISOString()
    };

    // Create default config if it doesn't exist
    await configRef.set(defaultConfig);
    return defaultConfig;
  } catch (error) {
    console.error('Error getting webhook config:', error);
    throw error;
  }
}

export async function updateWebhookConfig(config: any) {
  try {
    const configRef = db.collection('config').doc('webhook');
    await configRef.set({
      ...config,
      lastUpdated: new Date().toISOString()
    });
    return config;
  } catch (error) {
    console.error('Error updating webhook config:', error);
    throw error;
  }
}

// Email logs
export async function logEmail(emailData: any) {
  try {
    const logsRef = db.collection('email_logs');
    await logsRef.add({
      ...emailData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging email:', error);
    throw error;
  }
}

// Transaction logs
export async function logTransaction(transactionData: any) {
  try {
    const logsRef = db.collection('transaction_logs');
    await logsRef.add({
      ...transactionData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging transaction:', error);
    throw error;
  }
} 