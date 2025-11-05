import { NextRequest, NextResponse } from 'next/server';
import { extractTransactionDetails, type Transaction } from '@/ai/flows/extract-transaction-details';
import { getDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type MailgunFile = {
  key: string;
  filename: string;
  contentType: string;
  size: number;
  buffer: Buffer;
};

type MailgunFields = Record<string, string>;

async function parseMailgunRequest(request: NextRequest): Promise<{ fields: MailgunFields; files: MailgunFile[] }> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const formData = await request.formData();
    const fields: MailgunFields = {};
    const files: MailgunFile[] = [];

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        const arrayBuffer = await value.arrayBuffer();
        files.push({
          key,
          filename: value.name,
          contentType: value.type || 'application/octet-stream',
          size: value.size,
          buffer: Buffer.from(arrayBuffer),
        });
      } else if (typeof value === 'string') {
        fields[key] = value;
      }
    }

    return { fields, files };
  }

  try {
    const jsonBody = await request.json();
    return { fields: jsonBody ?? {}, files: [] };
  } catch {
    return { fields: {}, files: [] };
  }
}

function parseAttachmentsMeta(raw: unknown): Array<{ filename: string; contentType: string; size: number }> {
  if (typeof raw !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          filename: String((item as any).name ?? ''),
          contentType: String((item as any)['content-type'] ?? ''),
          size: Number((item as any).size ?? 0),
        }));
    }
  } catch (error) {
    console.warn('Failed to parse attachments metadata:', error);
  }

  return [];
}

async function sendWebhookWithRetry(url: string, payload: unknown, maxRetries = 5) {
  let attempt = 1;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const shouldRetry = response.status >= 500 && attempt < maxRetries;
        if (!shouldRetry) {
          const bodyText = await response.text();
          throw new Error(`Webhook responded with ${response.status}: ${bodyText}`);
        }
      } else {
        return;
      }
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= maxRetries;
      if (isLastAttempt) {
        throw error;
      }

      const backoff = Math.min(2000 * 2 ** (attempt - 1), 30000);
      console.warn(`Webhook attempt ${attempt} failed (${(error as Error).message}). Retrying in ${backoff}ms…`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }

    attempt += 1;
  }

  throw lastError;
}

export async function POST(request: NextRequest) {
  try {
    const { fields, files } = await parseMailgunRequest(request);

    const messageDetails = {
      subject: fields.subject || fields.Subject || '',
      from: fields.from || fields.From || '',
      to: fields.to || fields.To || '',
      messageId: fields['message-id'] || fields['Message-Id'] || '',
      body: fields['body-plain'] || '',
    };

    const attachmentsFromMailgun = parseAttachmentsMeta(fields.attachments ?? fields.Attachments);
    const attachmentMetadata = attachmentsFromMailgun.length
      ? attachmentsFromMailgun
      : files.map(file => ({
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
        }));

    const pdfFiles = files.filter(file => {
      if (!file.size) return false;
      const name = file.filename.toLowerCase();
      return file.contentType === 'application/pdf' || name.endsWith('.pdf') || file.key.toLowerCase().startsWith('attachment');
    });

    if (!pdfFiles.length) {
      console.warn('No PDF attachments detected on Mailgun payload');
    }

    const transactions: Transaction[] = [];
    for (const file of pdfFiles) {
      try {
        console.log(`Processing PDF attachment ${file.filename} (${file.size} bytes)`);
        const extracted = await extractTransactionDetails(file.buffer);
        transactions.push(...extracted);
      } catch (error) {
        console.error(`Failed to process attachment ${file.filename}:`, error);
      }
    }

    if (!transactions.length) {
      return NextResponse.json({
        success: true,
        transactionsFound: 0,
        message: 'No transactions detected in uploaded PDFs.',
      });
    }

    const db = getDb();
    const emailDocId = messageDetails.messageId || db.collection('emails').doc().id;

    const emailData = {
      subject: messageDetails.subject,
      from: messageDetails.from,
      to: messageDetails.to,
      timestamp: new Date().toISOString(),
      messageId: messageDetails.messageId,
      attachments: attachmentMetadata,
      _metadata: {
        processedAt: new Date().toISOString(),
        source: 'mailgun-webhook',
      },
    };

    await db.collection('emails').doc(emailDocId).set(emailData, { merge: true });

    try {
      const configSnapshot = await db.collection('config').doc('webhook').get();
      if (configSnapshot.exists) {
        const configData = configSnapshot.data() as { url?: string; enabled?: boolean } | undefined;
        if (configData?.enabled && configData?.url) {
          const payload = {
            transactions,
            email: {
              subject: emailData.subject,
              from: emailData.from,
              timestamp: emailData.timestamp,
            },
          };
          await sendWebhookWithRetry(configData.url, payload);
        }
      }
    } catch (error) {
      console.error('Failed to forward webhook payload:', error);
    }

    return NextResponse.json({
      success: true,
      transactionsFound: transactions.length,
      message: 'Transactions extracted successfully.',
    });
  } catch (error) {
    console.error('Mailgun webhook processing failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 },
    );
  }
}
