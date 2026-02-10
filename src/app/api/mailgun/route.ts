import '@/lib/setup-node-warnings';
import { NextRequest, NextResponse } from 'next/server';
import { extractTransactionDetails, type Transaction } from '@/ai/flows/extract-transaction-details';
import {
  getWebhookConfig as fetchWebhookConfig,
  markTransactionsDelivered,
  saveEmailWithTransactions,
} from '@/lib/storage';
import { appendTransactionsToSheet } from '@/lib/google-sheets';
import { sendFailureEmail } from '@/lib/notifications/email';

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
      if (value instanceof File || (typeof value === 'object' && value !== null && 'arrayBuffer' in value)) {
        const blob = value as File | Blob;
        const arrayBuffer = await blob.arrayBuffer();
        const name = blob instanceof File ? blob.name : key;
        const type = blob instanceof File ? blob.type : 'application/octet-stream';
        const size = blob.size;
        files.push({
          key,
          filename: name || key,
          contentType: type || 'application/octet-stream',
          size,
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
        const status = response.status;
        const bodyText = await response.text();

        console.warn(
          `Webhook call to ${url} failed with status ${status} on attempt ${attempt}. Response body: ${bodyText}`,
        );

        if (!shouldRetry) {
          throw new Error(`Webhook responded with ${status}: ${bodyText}`);
        }
      } else {
        console.log(`Webhook call to ${url} succeeded on attempt ${attempt}`);
        return;
      }
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= maxRetries;
      if (isLastAttempt) {
        throw error;
      }

      const backoff = Math.min(2000 * 2 ** (attempt - 1), 30000);
      console.warn(
        `Webhook attempt ${attempt} to ${url} failed: ${(error as Error).message}. Retrying in ${backoff}ms…`,
      );
      await new Promise(resolve => setTimeout(resolve, backoff));
    }

    attempt += 1;
  }

  throw lastError;
}

const DEFAULT_WEBHOOK_CHUNK_SIZE = 50;

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
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
      console.warn('No PDF attachments detected. Files received:', files.map(f => ({ key: f.key, name: f.filename, type: f.contentType, size: f.size })));
    }

    const transactions: Transaction[] = [];
    for (const file of pdfFiles) {
      try {
        console.log(`Processing PDF attachment ${file.filename} (${file.size} bytes)`);
        const extracted = await extractTransactionDetails(file.buffer);
        transactions.push(...extracted);
      } catch (error) {
        console.error(`Failed to process attachment ${file.filename}:`, error);
        await sendFailureEmail({
          subject: `PDF extraction failed for ${file.filename}`,
          body: [
            `File name: ${file.filename}`,
            `File size: ${file.size} bytes`,
            `Content type: ${file.contentType}`,
            '',
            `Error: ${error instanceof Error ? error.message : String(error)}`,
            '',
            `Mail from: ${messageDetails.from}`,
            `Mail subject: ${messageDetails.subject}`,
            `Mail messageId: ${messageDetails.messageId}`,
          ].join('\n'),
        });
      }
    }

    if (!transactions.length) {
      if (pdfFiles.length > 0) {
        await sendFailureEmail({
          subject: `No transactions extracted for ${messageDetails.subject || 'email without subject'}`,
          body: [
            'Extraction completed without any transactions.',
            '',
            `From: ${messageDetails.from}`,
            `To: ${messageDetails.to}`,
            `Subject: ${messageDetails.subject}`,
            `Message ID: ${messageDetails.messageId}`,
          ].join('\n'),
        });
      }
      return NextResponse.json({
        success: true,
        transactionsFound: 0,
        message: 'No transactions detected in uploaded PDFs.',
      });
    }

    // Google Sheets backup – runs first, before Postgres/webhook (so we have data even if downstream fails)
    // Koristi Service Account (GOOGLE_SHEETS_CREDENTIALS_JSON), ne API key – Sheets API ne podržava API key za upis.
    const sheetsCredentials = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    console.log('[Sheets] Start:', {
      hasCredentials: !!sheetsCredentials,
      hasId: !!spreadsheetId,
      spreadsheetIdPreview: spreadsheetId ? `${spreadsheetId.slice(0, 12)}...` : '(empty)',
      txCount: transactions.length,
    });
    if (!sheetsCredentials) console.log('[Sheets] GOOGLE_SHEETS_CREDENTIALS_JSON nije podešen (Service Account JSON)');
    if (!spreadsheetId) console.log('[Sheets] GOOGLE_SHEETS_SPREADSHEET_ID nije podešen');
    try {
      if (sheetsCredentials && spreadsheetId && transactions.length > 0) {
        console.log('[Sheets] Pozivam appendTransactionsToSheet...');
        const { appended, errors } = await appendTransactionsToSheet(
          spreadsheetId,
          sheetsCredentials,
          transactions
        );
        console.log(`[Sheets] Završeno: upisano ${appended}/${transactions.length} redova`);
        if (errors.length > 0) console.warn('[Sheets] Greške:', errors);
      } else if (transactions.length > 0) {
        console.log('[Sheets] Preskačem – nedostaju kredencijali ili nema transakcija');
      }
    } catch (e) {
      console.error('[Sheets] Izuzetak:', e instanceof Error ? e.message : String(e));
      if (e instanceof Error && e.stack) console.error('[Sheets] Stack:', e.stack);
    }

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

    const { emailId, pendingTransactions, totalTransactions } = await saveEmailWithTransactions(
      {
        subject: emailData.subject,
        from: emailData.from,
        to: emailData.to,
        body: messageDetails.body,
        timestamp: emailData.timestamp,
        messageId: emailData.messageId,
        attachments: emailData.attachments,
      },
      transactions,
    );

    let deliveredCount = 0;
    try {
      const webhookConfig = await fetchWebhookConfig();
      if (webhookConfig?.enabled && webhookConfig?.url) {
        if (!pendingTransactions.length) {
          console.log('No new transactions to forward (all already delivered).');
        } else {
          const chunkSize =
            Number.parseInt(process.env.WEBHOOK_CHUNK_SIZE ?? '', 10) || DEFAULT_WEBHOOK_CHUNK_SIZE;
          const chunks = chunkItems(pendingTransactions, chunkSize);

          for (const chunk of chunks) {
            const payload = {
              transactions: chunk.map(item => item.transaction),
              email: {
                subject: emailData.subject,
                from: emailData.from,
                timestamp: emailData.timestamp,
              },
            };

            await sendWebhookWithRetry(webhookConfig.url, payload);
            await markTransactionsDelivered(
              chunk.map(item => item.key),
              emailId,
            );
            deliveredCount += chunk.length;
          }
        }
      }
    } catch (error) {
      console.error('Failed to forward webhook payload:', error);
    }

    return NextResponse.json({
      success: true,
      transactionsFound: totalTransactions,
      forwarded: deliveredCount,
      message: deliveredCount
        ? `Delivered ${deliveredCount} new transaction(s).`
        : 'Transactions stored locally; nothing new to forward.',
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
