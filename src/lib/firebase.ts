import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Webhook configuration
export async function getWebhookConfig() {
  try {
    const configRef = doc(db, 'config', 'webhook');
    const configDoc = await getDoc(configRef);
    
    if (configDoc.exists()) {
      return configDoc.data();
    }
    
    // Return default config if none exists
    return {
      url: process.env.WEBHOOK_URL || '',
      enabled: true,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting webhook config:', error);
    throw error;
  }
}

export async function updateWebhookConfig(config: any) {
  try {
    const configRef = doc(db, 'config', 'webhook');
    await setDoc(configRef, {
      ...config,
      lastUpdated: serverTimestamp()
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
    const logsRef = collection(db, 'email_logs');
    await addDoc(logsRef, {
      ...emailData,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging email:', error);
    throw error;
  }
}

// Transaction logs
export async function logTransaction(transactionData: any) {
  try {
    const logsRef = collection(db, 'transaction_logs');
    await addDoc(logsRef, {
      ...transactionData,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging transaction:', error);
    throw error;
  }
} 