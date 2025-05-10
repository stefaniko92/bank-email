"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailReceive = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const axios_1 = __importDefault(require("axios"));
const extract_transaction_details_1 = require("./ai/flows/extract-transaction-details");
const multipart_form_1 = require("./utils/multipart-form");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
exports.emailReceive = (0, https_1.onRequest)({
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
            let parsedBody = {};
            let files = {};
            let transactions = [];
            if (req.headers['content-type']?.includes('multipart/form-data') && req.rawBody) {
                const { fields, files: parsedFiles } = await (0, multipart_form_1.parseMultipartForm)(req);
                parsedBody = fields;
                files = Object.fromEntries(Object.entries(parsedFiles).map(([key, file]) => [key, file.buffer]));
                for (const [k, v] of Object.entries(files)) {
                    console.log(`📦 File ${k} buffer size: ${v.length}`);
                }
            }
            else {
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
                    }
                    catch (err) {
                        console.warn('⚠️ Failed to parse attachments JSON:', parsedBody.attachments);
                        return [];
                    }
                })()
            };
            console.log(`🔁 Checking for duplicate message ID: ${messageDetails['message-id']}`);
            const existing = await db.collection('emails')
                .where('messageId', '==', messageDetails['message-id'])
                .limit(1)
                .get();
            if (!existing.empty) {
                console.log(`⚠️ Duplicate message-id detected: ${messageDetails['message-id']}, skipping.`);
                return;
            }
            console.log(`📨 Subject: ${messageDetails.subject}`);
            console.log(`📧 From: ${messageDetails.from}`);
            console.log(`📎 Attachments in metadata: ${messageDetails.attachments.length}`);
            console.log(`📁 Files parsed: ${Object.keys(files).join(', ')}`);
            for (const [key, buffer] of Object.entries(files)) {
                if (key.toLowerCase().endsWith('.pdf') || key.startsWith('attachment')) {
                    try {
                        console.log(`🧠 Running Gemini extractTransactionDetails on: ${key}, size: ${buffer.length}`);
                        const result = await (0, extract_transaction_details_1.extractTransactionDetails)(buffer);
                        console.log(`📦 Raw Gemini result for ${key}:`, JSON.stringify(result, null, 2));
                        console.log(`✅ Gemini extractTransactionDetails result for ${key}:`, JSON.stringify(result));
                        transactions.push(...result);
                    }
                    catch (err) {
                        console.error(`Gemini processing error for ${key}:`, err);
                    }
                }
            }
            if (transactions.length === 0 && messageDetails.attachments?.length) {
                for (const attachment of messageDetails.attachments) {
                    if (attachment['content-type'] === 'application/pdf' && attachment.url) {
                        try {
                            console.log(`🌐 Downloading PDF from Mailgun: ${attachment.url}`);
                            const pdfResp = await axios_1.default.get(attachment.url, {
                                responseType: 'arraybuffer',
                                auth: { username: 'api', password: process.env.MAILGUN_API_KEY || '' },
                            });
                            const buffer = Buffer.from(pdfResp.data);
                            console.log(`📄 Downloaded PDF size: ${buffer.length}`);
                            const extracted = await (0, extract_transaction_details_1.extractTransactionDetails)(buffer);
                            console.log(`✅ Gemini fallback extracted ${extracted.length} items from ${attachment.name}`);
                            transactions.push(...extracted);
                        }
                        catch (err) {
                            console.error(`Gemini fallback error for ${attachment.name}:`, err);
                        }
                    }
                }
            }
            const emailData = {
                subject: messageDetails.subject,
                from: messageDetails.from,
                to: messageDetails.to,
                timestamp: new Date().toISOString(),
                messageId: messageDetails['message-id'],
                attachments: messageDetails.attachments.map((a) => ({
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
                    await axios_1.default.post(webhookConfig.url, {
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
                }
                catch (err) {
                    console.error('Webhook send failed:', err);
                }
            }
            else {
                console.log('ℹ️ No active webhook config found. Skipping external POST.');
            }
        }
        catch (err) {
            console.error('Fatal async error:', err);
        }
    });
});
//# sourceMappingURL=index.js.map