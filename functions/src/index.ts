import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Export your API routes as Firebase Functions
export const webhookConfig = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const db = admin.firestore();
    const configRef = db.collection('config').doc('webhook');

    if (req.method === 'GET') {
      const configDoc = await configRef.get();
      
      if (!configDoc.exists) {
        res.status(404).json({ error: 'Webhook configuration not found' });
        return;
      }

      res.json(configDoc.data());
    } 
    else if (req.method === 'POST') {
      const data = req.body;
      
      // Validate input
      if (data.url !== undefined && typeof data.url !== 'string') {
        res.status(400).json({ error: 'URL must be a string' });
        return;
      }
      
      if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
        res.status(400).json({ error: 'Enabled flag must be a boolean' });
        return;
      }
      
      // Update configuration
      await configRef.set({
        url: data.url,
        enabled: data.enabled,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      
      res.json({ success: true });
    }
    else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error handling webhook config:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Test webhook endpoint
export const testWebhook = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = admin.firestore();
    const configRef = db.collection('config').doc('webhook');
    const configDoc = await configRef.get();
    
    if (!configDoc.exists || !configDoc.data()?.url) {
      res.status(400).json({ error: 'No webhook URL configured' });
      return;
    }

    const config = configDoc.data() as { url: string };

    // Create a test payload
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook payload',
      sampleData: {
        transactions: [
          {
            nazivSedistePrimaoca: "Test Recipient",
            iznosOdobrenja: "1.000,00",
            pozivNaBrojOdobrenja: "TEST-123",
            referentnaOznaka: "TEST-REF",
            datumKnjizenja: new Date().toISOString().split('T')[0]
          }
        ],
        email: {
          subject: "Test Email",
          from: "test@example.com",
          to: "recipient@example.com",
          timestamp: new Date().toISOString(),
          messageId: "test-message-id"
        }
      }
    };

    // Send test request to webhook
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    // Get response body
    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    if (!response.ok) {
      res.status(500).json({
        success: false,
        error: `Webhook test failed with status: ${response.status}`,
        response: responseBody
      });
      return;
    }

    res.json({
      success: true,
      message: 'Webhook test successful',
      status: response.status,
      response: responseBody
    });
  } catch (error) {
    console.error('Error testing webhook:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}); 