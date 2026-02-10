import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import { parseMultipartForm } from './utils/multipart-form';
import { extractTransactionDetails } from './ai/flows/extract-transaction-details';
import { appendTransactionsToSheet } from './services/google-sheets';

initializeApp();
const db = getFirestore();

let webhookConfigCache: any = null;
let lastConfigFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to retry Firestore operations
async function retryOperation<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (error.code === 4) { // DEADLINE_EXCEEDED
        console.warn(`Retry ${i + 1}/${maxRetries} due to timeout`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function getWebhookConfig() {
  const now = Date.now();
  if (webhookConfigCache && (now - lastConfigFetch) < CACHE_TTL) {
    return webhookConfigCache;
  }

  const configSnap = await retryOperation(() =>
    db.collection('config').where('type', '==', 'webhook').get()
  );
  webhookConfigCache = configSnap.empty ? null : configSnap.docs[0].data();
  lastConfigFetch = now;
  return webhookConfigCache;
}

async function retryWebhookSend(webhookUrl: string, payload: any, maxRetries = 5): Promise<void> {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🚀 Webhook attempt ${attempt}/${maxRetries} to ${webhookUrl}`);

      await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000 // Increased timeout to 30 seconds for hibernating apps
      });

      console.log(`✅ Webhook sent successfully on attempt ${attempt}`);
      return;

    } catch (error: any) {
      lastError = error;
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      const isConnectionError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';

      if (attempt < maxRetries && (isTimeout || isConnectionError)) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        console.warn(`⏳ Webhook attempt ${attempt} failed (${error.message}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If it's the last attempt or a non-retryable error, throw
      throw error;
    }
  }

  throw lastError;
}

export const emailReceive = onRequest({
  timeoutSeconds: 540,
  memory: '1GiB',
  region: 'us-central1',
  concurrency: 80,
  cors: true,
  invoker: 'public',
  minInstances: 1,
  maxInstances: 10
}, async (req, res) => {
  res.status(200).json({ success: true, message: 'Webhook received' });

  process.nextTick(async () => {
    try {
      console.log('📥 Processing Mailgun webhook...');

      let parsedBody: Record<string, any> = {};
      let files: Record<string, Buffer> = {};
      let transactions: any[] = [];

      if (req.headers['content-type']?.includes('multipart/form-data') && req.rawBody) {
        console.log('📧 Processing multipart form data...');
        const { fields, files: parsedFiles } = await parseMultipartForm(req);
        parsedBody = fields;
        files = Object.fromEntries(
          Object.entries(parsedFiles).map(([key, file]) => [key, file.buffer])
        );
        console.log('📧 Parsed form fields:', JSON.stringify(parsedBody, null, 2));
        for (const [k, v] of Object.entries(files)) {
          console.log(`📦 File ${k} buffer size: ${v.length}`);
        }
      } else {
        console.log('📧 Processing regular request body...');
        parsedBody = req.body;
        console.log('📧 Request body:', JSON.stringify(parsedBody, null, 2));
      }

      const messageDetails = {
        subject: parsedBody.subject || parsedBody.Subject || '',
        from: parsedBody.from || parsedBody.From || '',
        to: parsedBody.to || parsedBody.To || '',
        'message-id': parsedBody['message-id'] || parsedBody['Message-Id'] || '',
        body: parsedBody['body-plain'] || '',
        attachments: (() => {
          try {
            return parsedBody.attachments ? JSON.parse(parsedBody.attachments) : [];
          } catch (err) {
            console.warn('⚠️ Failed to parse attachments JSON:', parsedBody.attachments);
            return [];
          }
        })()
      };

      console.log('📧 Email Details:');
      console.log('  Subject:', messageDetails.subject);
      console.log('  From:', messageDetails.from);
      console.log('  To:', messageDetails.to);
      console.log('  Message ID:', messageDetails['message-id']);
      console.log('  Body:', messageDetails.body);
      console.log('  Attachments:', JSON.stringify(messageDetails.attachments, null, 2));
      console.log('  Files parsed:', Object.keys(files).join(', '));

      for (const [key, buffer] of Object.entries(files)) {
        if (key.toLowerCase().endsWith('.pdf') || key.startsWith('attachment')) {
          try {
            console.log(`🧠 Running OpenAI extractTransactionDetails on: ${key}, size: ${buffer.length}`);
            const result = await extractTransactionDetails(buffer);
            console.log(`✅ OpenAI extractTransactionDetails result for ${key}:`, JSON.stringify(result));
            transactions.push(...result);
          } catch (err: any) {
            console.error(`OpenAI processing error for ${key}:`, err);
          }
        }
      }

      const emailData = {
        subject: messageDetails.subject,
        from: messageDetails.from,
        to: messageDetails.to,
        timestamp: new Date().toISOString(),
        messageId: messageDetails['message-id'],
        attachments: messageDetails.attachments.map((a: any) => ({
          filename: a.name,
          contentType: a['content-type'],
          size: a.size
        })),
        _metadata: {
          processedAt: new Date().toISOString(),
          source: 'mailgun-webhook'
        }
      };

      if (transactions.length === 0) {
        console.warn('⚠️ No transactions found, skipping webhook.');
        return;
      }

      console.log('📝 Storing email metadata to Firestore');
      const batch = db.batch();
      batch.set(db.collection('emails').doc(messageDetails['message-id']), emailData);
      await batch.commit();

      const webhookConfig = await getWebhookConfig();

      console.log('🔍 Webhook config:', webhookConfig);

      if (webhookConfig?.url && webhookConfig?.enabled) {
        try {
          console.log(`🚀 Sending data to external webhook: ${webhookConfig.url}`);
          console.log('📤 Payload being sent to webhook:', JSON.stringify({
            transactions,
            email: {
              subject: emailData.subject,
              from: emailData.from,
              timestamp: emailData.timestamp
            }
          }, null, 2));

          await retryWebhookSend(webhookConfig.url, {
            transactions,
            email: {
              subject: emailData.subject,
              from: emailData.from,
              timestamp: emailData.timestamp
            }
          });
          console.log('✅ Webhook sent successfully');
        } catch (err) {
          console.error('Webhook send failed:', err);
        }
      } else {
        console.log('ℹ️ No active webhook config found. Skipping external POST.');
      }

      // Append transactions to Google Sheet (one sheet per year)
      const sheetsCredentials = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      if (sheetsCredentials && spreadsheetId && transactions.length > 0) {
        try {
          const { appended, errors } = await appendTransactionsToSheet(
            spreadsheetId,
            sheetsCredentials,
            transactions
          );
          if (appended > 0) {
            console.log(`📊 Appended ${appended} transaction(s) to Google Sheet`);
          }
          if (errors.length > 0) {
            console.warn('Google Sheets errors:', errors);
          }
        } catch (sheetsErr: any) {
          console.error('Google Sheets append failed:', sheetsErr?.message || sheetsErr);
        }
      }
    } catch (err: any) {
      console.error('Fatal async error:', err);
      if (err.code) {
        console.error('Error code:', err.code);
      }
      if (err.details) {
        console.error('Error details:', err.details);
      }
    }
  });
});
