import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import { extractTransactionDetails } from './ai/flows/extract-transaction-details';
import * as functions from 'firebase-functions';
import { simpleParser } from 'mailparser';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Helper: parse multipart/form-data
function parseMultipartForm(req: any): Promise<{ fields: Record<string, string>, files: Record<string, Buffer> }> {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting parseMultipartForm');
      const fields: Record<string, string> = {};
      const files: Record<string, Buffer> = {};

      // Get the boundary from the content type
      const contentType = req.headers['content-type'];
      const boundary = contentType.split('boundary=')[1];
      console.log('Boundary:', boundary);

      // Convert raw body to string
      const body = req.rawBody.toString('utf8');
      console.log('Raw body length:', body.length);

      // Split the body into parts
      const parts = body.split('--' + boundary);
      console.log('Found parts:', parts.length);

      // Process each part
      parts.forEach((part: string, index: number) => {
        if (part.trim() === '' || part.trim() === '--') return;

        const [headers, ...contentArr] = part.split('\r\n\r\n');
        const content = contentArr.join('\r\n\r\n');

        // Parse headers
        const headerMatch = headers.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?/);
        if (!headerMatch) return;

        const [, name, filename] = headerMatch;
        console.log('Processing part:', { name, filename });

        if (filename) {
          // This is a file
          const fileContent = Buffer.from(content.slice(0, -2), 'utf8'); // Remove trailing \r\n
          files[name] = fileContent;

          // If this is an email file, parse it
          if (name === 'message' || (filename && filename.endsWith('.eml'))) {
            try {
              simpleParser(fileContent).then(email => {
                console.log('Successfully parsed email:', {
                  subject: email.subject,
                  from: email.from,
                  to: email.to,
                  messageId: email.messageId
                });

                const fromAddress = typeof email.from === 'string' ? email.from :
                  (Array.isArray(email.from) ? email.from[0]?.value?.[0]?.address : email.from?.value?.[0]?.address);
                const toAddress = typeof email.to === 'string' ? email.to :
                  (Array.isArray(email.to) ? email.to[0]?.value?.[0]?.address : email.to?.value?.[0]?.address);

                fields['subject'] = email.subject || '';
                fields['from'] = fromAddress || '';
                fields['to'] = toAddress || '';
                fields['message-id'] = email.messageId || '';

                if (email.attachments?.length) {
                  console.log(`Found ${email.attachments.length} attachments`);
                  email.attachments.forEach((attachment, index) => {
                    if (attachment.content) {
                      files[`attachment_${index}`] = attachment.content;
                    }
                  });
                }
              });
            } catch (error) {
              console.error('Error parsing email:', error);
              files['rawMessage'] = fileContent;
            }
          }
        } else {
          // This is a field
          fields[name] = content.trim();
        }
      });

      console.log('Successfully processed all parts');
      resolve({ fields, files });
    } catch (error) {
      console.error('Error in parseMultipartForm:', error);
      reject(error);
    }
  });
}

// Helper: download Mailgun-hosted PDF attachment
async function downloadAttachment(url: string): Promise<Buffer> {
  try {
    const response = await axios.get(url, {
      auth: {
        username: 'api',
        password: functions.config().mailgun.api_key
      },
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    throw error;
  }
}

// Helper: fetch Mailgun-stored message
async function fetchMessageDetails(messageUrl: string) {
  try {
    const response = await axios.get(messageUrl, {
      auth: {
        username: 'api',
        password: functions.config().mailgun.api_key
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching message details:', error);
    throw error;
  }
}

interface EmailData {
  subject: string;
  from: string;
  to: string;
  timestamp: string;
  messageId: string;
  transactions?: any[];
  _metadata: {
    processedAt: string;
    source: string;
  };
}

interface WebhookPayload {
  transactions: any[];
  email: {
    subject: string;
    from: string;
    timestamp: string;
  };
}

export const emailReceive = onRequest({
  timeoutSeconds: 540,
  memory: '1GiB',
  region: 'us-central1',
  minInstances: 0,
  maxInstances: 100,
  concurrency: 80,
  cors: true,
  invoker: 'public'
}, async (request, response) => {
  try {
    console.log('==================== EMAIL WEBHOOK REQUEST START ====================');
    console.log('Request Method:', request.method);
    console.log('Content-Type:', request.headers['content-type']);
    
    // Add immediate error handling for request parsing
    try {
      console.log('Raw body type:', typeof request.body);
      console.log('Raw body:', JSON.stringify(request.body, null, 2));
    } catch (error) {
      console.error('Error logging request body:', error);
    }
    
    console.log('Headers:', JSON.stringify(request.headers, null, 2));

    // Handle both raw JSON and form-data
    let parsedBody: Record<string, any>;
    let rawMessage: Buffer | undefined;
    
    try {
      if (request.headers['content-type']?.includes('multipart/form-data')) {
        console.log('Processing multipart form data');
        const { fields, files } = await parseMultipartForm(request);
        console.log('Parsed fields:', fields);
        console.log('Parsed files:', Object.keys(files));
        parsedBody = fields;
        rawMessage = files['message'];
      } else {
        console.log('Processing raw JSON body');
        parsedBody = request.body;
      }
    } catch (error) {
      console.error('Error parsing request:', error);
      response.status(400).json({
        success: false,
        message: 'Error parsing request',
        error: error instanceof Error ? error.message : 'Unknown parsing error'
      });
      return;
    }

    console.log('Parsed body:', JSON.stringify(parsedBody, null, 2));
    if (rawMessage) {
      console.log('Raw message size:', rawMessage.length);
    }

    // Extract message URL from various possible locations
    const messageUrl = 
      parsedBody['message-url'] || 
      parsedBody.messageUrl || 
      parsedBody.message_url ||
      parsedBody['Message-Url'] ||
      parsedBody['message-id'] ? 
        `https://storage-europe-west1.api.mailgun.net/v3/domains/${parsedBody.domain || 'bank.travelcollab.com'}/messages/${parsedBody['message-id']}` : 
        null;

    console.log('Message URL extraction:', {
      found: !!messageUrl,
      url: messageUrl,
      possibleFields: {
        'message-url': parsedBody['message-url'],
        'messageUrl': parsedBody.messageUrl,
        'message_url': parsedBody.message_url,
        'Message-Url': parsedBody['Message-Url'],
        'message-id': parsedBody['message-id'],
        'message_id': parsedBody['message_id'],
        'Message-Id': parsedBody['Message-Id'],
        'Message-ID': parsedBody['Message-ID'],
        'messageId': parsedBody.messageId
      },
      rawBody: parsedBody
    });

    console.log('==================== MAILGUN MESSAGE DETAILS START ====================');
    let messageDetails: {
      subject: string;
      from: string;
      to: string;
      'message-id': string;
      body: string;
      attachments: any[];
    };
    
    if (rawMessage) {
      console.log('Processing raw message content');
      try {
        // Parse the raw message content
        const messageContent = rawMessage.toString('utf-8');
        const lines = messageContent.split('\n');
        const headers: Record<string, string> = {};
        let body = '';
        let inBody = false;

        for (const line of lines) {
          if (!inBody) {
            if (line.trim() === '') {
              inBody = true;
              continue;
            }
            const [key, ...values] = line.split(':');
            if (key && values.length > 0) {
              headers[key.trim().toLowerCase()] = values.join(':').trim();
            }
          } else {
            body += line + '\n';
          }
        }

        messageDetails = {
          subject: headers['subject'] || '',
          from: headers['from'] || '',
          to: headers['to'] || '',
          'message-id': headers['message-id'] || '',
          body: body.trim(),
          attachments: [] // We'll handle attachments separately if needed
        };
        console.log('Successfully parsed raw message content');
      } catch (error) {
        console.error('Error parsing raw message:', error);
        if (messageUrl) {
          messageDetails = await fetchMessageDetails(messageUrl);
        } else {
          throw new Error('No message URL available for fetching details');
        }
      }
    } else if (!messageUrl && parsedBody['body-plain']) {
      console.log('Test request detected, using raw message content');
      messageDetails = {
        subject: parsedBody.subject || parsedBody.Subject || '',
        from: parsedBody.from || parsedBody.From || '',
        to: parsedBody.to || parsedBody.To || '',
        'message-id': parsedBody['Message-Id'] || parsedBody['message-id'] || '',
        body: parsedBody['body-plain'],
        attachments: [] // We'll handle attachments separately if needed
      };
    } else if (messageUrl) {
      messageDetails = await fetchMessageDetails(messageUrl);
    } else {
      console.error('No message URL found in request. Available fields:', Object.keys(parsedBody));
      response.status(400).json({
        success: false,
        message: 'Missing required message URL',
        error: 'No message URL found in request',
        details: {
          availableFields: Object.keys(parsedBody),
          contentType: request.headers['content-type'],
          sampleFields: {
            subject: parsedBody.subject,
            from: parsedBody.from,
            to: parsedBody.to,
            timestamp: parsedBody.timestamp,
            'message-id': parsedBody['message-id'],
            'message_id': parsedBody['message_id'],
            'Message-Id': parsedBody['Message-Id'],
            'Message-ID': parsedBody['Message-ID'],
            'messageId': parsedBody.messageId,
            domain: parsedBody.domain,
            recipient: parsedBody.recipient,
            sender: parsedBody.sender
          },
          rawBody: parsedBody
        }
      });
      return;
    }

    console.log('Selected message URL:', messageUrl);
    console.log('==================== MESSAGE URL EXTRACTION END ====================');

    console.log('==================== MAILGUN MESSAGE DETAILS END ====================');

    const attachments = messageDetails.attachments || [];
    console.log('Found attachments:', attachments.length);

    const transactions: any[] = [];

    for (const attachment of attachments) {
      if (attachment['content-type'] === 'application/pdf') {
        console.log('==================== PDF PROCESSING START ====================');
        try {
          const pdfBuffer = await downloadAttachment(attachment.url);
          console.log('Downloaded PDF successfully, size:', pdfBuffer.length);

          if (pdfBuffer.length === 0) throw new Error('Empty PDF buffer');

          const extracted = await extractTransactionDetails(pdfBuffer);
          if (!Array.isArray(extracted)) throw new Error('Invalid extracted data');

          for (const t of extracted) {
            if (!t.nazivSedistePrimaoca || !t.iznosOdobrenja || !t.pozivNaBrojOdobrenja || !t.referentnaOznaka || !t.datumKnjizenja) {
              throw new Error('Invalid transaction structure');
            }
          }

          transactions.push(...extracted);
          console.log('PDF processing completed. Transactions:', extracted.length);
        } catch (error) {
          console.error('Error processing PDF:', error);
        }
        console.log('==================== PDF PROCESSING END ====================');
      }
    }

    if (transactions.length === 0) {
      console.warn('No transactions extracted from attachments');
    }

    const emailData: EmailData = {
      subject: parsedBody.subject || '',
      from: parsedBody.from || parsedBody.sender || '',
      to: parsedBody.to || parsedBody.recipient || '',
      timestamp: (() => {
        try {
          const timestamp = parseInt(parsedBody.timestamp);
          if (isNaN(timestamp) || timestamp <= 0) {
            console.warn('Invalid timestamp received:', parsedBody.timestamp);
            return new Date().toISOString();
          }
          return new Date(timestamp * 1000).toISOString();
        } catch (error) {
          console.warn('Error converting timestamp:', error);
          return new Date().toISOString();
        }
      })(),
      messageId: parsedBody['message-id'] || parsedBody['Message-Id'] || parsedBody['messageId'] || '',
      _metadata: {
        processedAt: new Date().toISOString(),
        source: 'mailgun-webhook'
      }
    };

    // Only add transactions if they exist
    if (transactions && transactions.length > 0) {
      emailData.transactions = transactions;
    }

    console.log('Storing email data:', JSON.stringify(emailData, null, 2));

    const docRef = await db.collection('email_logs').add(emailData);
    console.log('Email logged with ID:', docRef.id);

    const webhookPayload: WebhookPayload = {
      transactions,
      email: {
        subject: emailData.subject,
        from: emailData.from,
        timestamp: emailData.timestamp
      }
    };

    try {
      const webhookRes = await axios.post('https://app.travelcollab.com/invoice/receiver', webhookPayload);
      console.log('Webhook sent:', webhookRes.status, webhookRes.statusText);
    } catch (err) {
      console.error('Error sending webhook:', err);
      if (axios.isAxiosError(err)) {
        console.error('Webhook response error:', {
          status: err.response?.status,
          data: err.response?.data
        });
      }
    }

    response.status(200).json({
      success: true,
      message: 'Email processed successfully',
      emailId: docRef.id
    });
  } catch (error) {
    console.error('Fatal processing error:', error);
    response.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown'
    });
  }
  console.log('==================== EMAIL WEBHOOK REQUEST END ====================');
});
