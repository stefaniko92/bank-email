import '@/lib/setup-node-warnings';
import { NextRequest, NextResponse } from 'next/server';
import { extractTransactionDetails, type Transaction } from '@/ai/flows/extract-transaction-details';
import { getWebhookConfig as fetchWebhookConfig, saveEmailWithTransactions } from '@/lib/storage';
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

    await saveEmailWithTransactions(
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

    try {
      const webhookConfig = await fetchWebhookConfig();
      if (webhookConfig?.enabled && webhookConfig?.url) {
        const payload = {
          transactions,
          email: {
            subject: emailData.subject,
            from: emailData.from,
            timestamp: emailData.timestamp,
          },
        };
        await sendWebhookWithRetry(webhookConfig.url, payload);
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
