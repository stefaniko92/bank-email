import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import * as functions from 'firebase-functions';

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

export { db };

// Email logs
export async function logEmail(emailData: any) {
  try {
    console.log('Starting to log email data...');
    console.log('Email data keys:', Object.keys(emailData));
    
    // Create a sanitized copy of the data
    const sanitizedData: {[key: string]: any} = {};
    
    // Process each field in the email data
    for (const [key, value] of Object.entries(emailData)) {
      console.log(`Processing field ${key}:`, typeof value);
      
      if (value && typeof value === 'object') {
        // Handle objects by converting to plain object
        try {
          // If it's a File-like object with content, ensure it's properly stored
          const fileLikeObject = value as { content?: string };
          if (fileLikeObject.content && typeof fileLikeObject.content === 'string') {
            sanitizedData[key] = {
              ...value,
              content: fileLikeObject.content.substring(0, 100) + '...' // Truncate content for logging
            };
          } else {
            sanitizedData[key] = value;
          }
        } catch (error) {
          console.error(`Error processing field ${key}:`, error);
          sanitizedData[key] = String(value);
        }
      } else {
        sanitizedData[key] = value;
      }
    }
    
    // Add metadata
    sanitizedData._metadata = {
      timestamp: new Date().toISOString(),
      processedAt: new Date().toISOString()
    };
    
    // Log to Firestore
    const emailsRef = collection(db, 'emails');
    const docRef = await addDoc(emailsRef, sanitizedData);
    console.log('Email logged with ID:', docRef.id);
    
    return docRef.id;
  } catch (error) {
    console.error('Error logging email:', error);
    throw error;
  }
}

// Transaction logs
export async function logTransaction(transactionData: any) {
  try {
    console.log('Logging transaction data:', transactionData);
    
    const transactionsRef = collection(db, 'transactions');
    const docRef = await addDoc(transactionsRef, {
      ...transactionData,
      timestamp: new Date().toISOString(),
      processedAt: new Date().toISOString()
    });
    
    console.log('Transaction logged with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error logging transaction:', error);
    throw error;
  }
}

// Webhook configuration
export async function getWebhookConfig() {
  try {
    const configRef = collection(db, 'config');
    const q = query(configRef, where('type', '==', 'webhook'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No webhook configuration found');
      return null;
    }
    
    const config = querySnapshot.docs[0].data();
    console.log('Found webhook config:', config);
    return config;
  } catch (error) {
    console.error('Error getting webhook config:', error);
    throw error;
  }
}

// Update webhook configuration
export async function updateWebhookConfig(config: any) {
  try {
    const configRef = collection(db, 'config');
    const q = query(configRef, where('type', '==', 'webhook'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // Create new config
      const docRef = await addDoc(configRef, {
        type: 'webhook',
        ...config,
        updatedAt: new Date().toISOString()
      });
      console.log('Created new webhook config with ID:', docRef.id);
      return docRef.id;
    } else {
      // Update existing config
      const docRef = doc(db, 'config', querySnapshot.docs[0].id);
      await updateDoc(docRef, {
        ...config,
        updatedAt: new Date().toISOString()
      });
      console.log('Updated webhook config');
      return querySnapshot.docs[0].id;
    }
  } catch (error) {
    console.error('Error updating webhook config:', error);
    throw error;
  }
} 