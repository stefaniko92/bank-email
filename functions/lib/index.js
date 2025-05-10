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
const mailparser_1 = require("mailparser");
const extract_transaction_details_1 = require("./ai/flows/extract-transaction-details");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
function extractFirstAddress(input) {
    if (!input)
        return '';
    const addressObj = Array.isArray(input) ? input[0] : input;
    return addressObj?.value?.[0]?.address || '';
}
async function parseMultipartForm(req) {
    const fields = {};
    const files = {};
    const contentType = req.headers['content-type'];
    const boundary = contentType.split('boundary=')[1];
    const body = req.rawBody.toString('utf8');
    const parts = body.split('--' + boundary);
    for (const part of parts) {
        if (part.trim() === '' || part.trim() === '--')
            continue;
        const [headers, ...contentArr] = part.split('\r\n\r\n');
        const content = contentArr.join('\r\n\r\n');
        const headerMatch = headers.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)"\r\n)?/);
        if (!headerMatch)
            continue;
        const [, name, filename] = headerMatch;
        const fileContent = Buffer.from(content.slice(0, -2), 'utf8');
        if (filename) {
            files[name] = fileContent;
            if (name === 'message' || filename.endsWith('.eml')) {
                try {
                    const email = await (0, mailparser_1.simpleParser)(fileContent);
                    fields['subject'] = email.subject || '';
                    fields['from'] = extractFirstAddress(email.from);
                    fields['to'] = extractFirstAddress(email.to);
                    fields['message-id'] = email.messageId || '';
                    console.log(`📨 Parsed EML: subject="${fields['subject']}" from="${fields['from']}" to="${fields['to']}`);
                    email.attachments?.forEach((att, idx) => {
                        if (att.content) {
                            files[`attachment_${idx}`] = att.content;
                            console.log(`🗂️  Found inline attachment in .eml: attachment_${idx}, size: ${att.content.length}, filename: ${att.filename}`);
                        }
                    });
                }
                catch (err) {
                    console.error('Error parsing .eml message:', err);
                    files['rawMessage'] = fileContent;
                }
            }
            else {
                console.log(`📎 Received file: ${filename}, name: ${name}, size: ${fileContent.length}`);
            }
        }
        else {
            fields[name] = content.trim();
        }
    }
    return { fields, files };
}
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
            if (req.headers['content-type']?.includes('multipart/form-data')) {
                ({ fields: parsedBody, files } = await parseMultipartForm(req));
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
                attachments: parsedBody.attachments ? JSON.parse(parsedBody.attachments) : []
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
                            await axios_1.default.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                                contents: [
                                    {
                                        parts: [
                                            { text: 'Extract payment information and structure it into JSON format:' },
                                            {
                                                inlineData: {
                                                    mimeType: 'application/pdf',
                                                    data: buffer.toString('base64'),
                                                },
                                            },
                                        ],
                                    },
                                ],
                            });
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