import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import { parseMultipartForm } from './utils/multipart-form';
import { extractTransactionDetails } from './ai/flows/extract-transaction-details';

initializeApp();
const db = getFirestore();

export const emailReceive = onRequest({
  timeoutSeconds: 540,
  memory: '1GiB',
  region: 'us-central1',
  concurrency: 80,
  cors: true,
  invoker: 'public'
}, async (req, res) => {
  res.status(200).json({ success: true, message: 'Webhook received' });

  process.nextTick(async () => {
    try {
      console.log('📥 Processing Mailgun webhook...');
      let parsedBody: Record<string, any> = {};
      let files: Record<string, Buffer> = {};
      let transactions: any[] = [];

      if (req.headers['content-type']?.includes('multipart/form-data') && req.rawBody) {
        const { fields, files: parsedFiles } = await parseMultipartForm(req);
        parsedBody = fields;
        files = Object.fromEntries(
          Object.entries(parsedFiles).map(([key, file]) => [key, file.buffer])
        );
        for (const [k, v] of Object.entries(files)) {
          console.log(`📦 File ${k} buffer size: ${v.length}`);
        }
      } else {
        parsedBody = req.body;
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

      console.log(`📨 Subject: ${messageDetails.subject}`);
      console.log(`📧 From: ${messageDetails.from}`);
      console.log(`📎 Attachments in metadata: ${messageDetails.attachments.length}`);
      console.log(`📁 Files parsed: ${Object.keys(files).join(', ')}`);

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
      await db.collection('emails').doc(messageDetails['message-id']).set(emailData);

      const configSnap = await db.collection('config').where('type', '==', 'webhook').get();
      const webhookConfig = configSnap.empty ? null : configSnap.docs[0].data();

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

          await axios.post(webhookConfig.url, {
            transactions,
            email: {
              subject: emailData.subject,
              from: emailData.from,
              timestamp: emailData.timestamp
            }
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          console.log('✅ Webhook sent successfully');
        } catch (err) {
          console.error('Webhook send failed:', err);
        }
      } else {
        console.log('ℹ️ No active webhook config found. Skipping external POST.');
      }
    } catch (err: any) {
      console.error('Fatal async error:', err);
    }
  });
});
