'use server';

import {NextResponse} from 'next/server';
import {logEmail} from '@/services/email-logger';
import {extractAllTransactionDetails} from '@/ai/flows/extract-transaction-details';
import {extractTextFromPdf} from '@/lib/pdf-utils';
import fs from 'fs/promises';
import path from 'path';

/**
 * @fileOverview Receives email data from Mailgun via POST request, extracts transaction details from PDFs, and forwards to a configured webhook (source app).
 *
 * This route handles POST requests to receive email data from Mailgun.
 * It extracts any transaction details from PDF attachments and forwards them to a configured webhook.
 * It logs the received data and returns a JSON response indicating success or failure.
 */

// Configuration file path
const CONFIG_FILE_PATH = path.join(process.cwd(), 'webhook-config.json');

/**
 * Gets the current webhook configuration
 */
async function getWebhookConfig() {
  try {
    const fileExists = await fs.access(CONFIG_FILE_PATH).then(() => true).catch(() => false);

    if (!fileExists) {
      // Use environment variable as fallback if config file doesn't exist
      const envUrl = process.env.WEBHOOK_URL || process.env.SOURCE_APP_WEBHOOK_URL || '';
      console.log(`Webhook config file not found. Using URL from environment: ${envUrl || 'Not Set'}`);
      return {
        url: envUrl,
        enabled: !!envUrl, // Enable only if URL is set
        lastUpdated: new Date().toISOString()
      };
    }

    const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    const config = JSON.parse(configData);
    // Ensure URL from env var is considered if file has no URL
    if (!config.url) {
       config.url = process.env.WEBHOOK_URL || process.env.SOURCE_APP_WEBHOOK_URL || '';
       config.enabled = config.enabled && !!config.url; // Keep enabled state from file, but disable if no URL
    }
     console.log(`Webhook config loaded: URL=${config.url}, Enabled=${config.enabled}`);
    return config;
  } catch (error) {
    console.error('Error reading webhook config:', error);
    // Fallback to environment variable on error
     const envUrl = process.env.WEBHOOK_URL || process.env.SOURCE_APP_WEBHOOK_URL || '';
     console.log(`Error reading config file. Using URL from environment: ${envUrl || 'Not Set'}`);
    return {
      url: envUrl,
      enabled: !!envUrl,
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Forwards transaction data to the configured external webhook (source app)
 */
async function forwardToWebhook(transactions: any[], emailData: any) {
  try {
    // Get webhook configuration
    const config = await getWebhookConfig();

    if (!config.enabled || !config.url) {
      console.log(`Webhook forwarding disabled or URL not configured. URL: ${config.url}, Enabled: ${config.enabled}`);
      return null;
    }

    console.log(`Forwarding ${transactions.length} transactions to webhook: ${config.url}`);

    const payload = {
        transactions: transactions,
        email: {
          subject: emailData.subject || '',
          from: emailData.from || '',
          to: emailData.recipient || '', // Added recipient
          timestamp: new Date().toISOString(),
          messageId: emailData['Message-Id'] || 'unknown' // Added message ID
        },
      };

    console.log("Webhook Payload:", JSON.stringify(payload, null, 2)); // Log the payload

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // Increased timeout to 15 seconds
    });

    if (!response.ok) {
       const responseBody = await response.text();
      console.error(`Webhook error response body: ${responseBody}`);
      throw new Error(`Webhook responded with status: ${response.status}`);
    }

    // Try to parse JSON, but handle cases where response might not be JSON
    let responseData;
    try {
      responseData = await response.json();
       console.log('Webhook response JSON:', responseData);
    } catch (jsonError) {
       console.log('Webhook response was not JSON. Status:', response.status);
       responseData = { status: response.status, message: 'Webhook acknowledged' }; // Or handle non-JSON response as needed
    }

    return responseData;
  } catch (error) {
    console.error('Error forwarding to webhook:', error);
    return { error: error instanceof Error ? error.message : String(error) }; // Return error details
  }
}

/**
 * Extract base64 encoded PDF content from email attachments
 */
function extractBase64PdfContent(emailData: any): { content: string | null, filename: string | null } {
  try {
    // Check if we have attachments
    const attachmentCount = parseInt(emailData['attachment-count'] || '0');
    if (attachmentCount === 0) {
      console.log('No attachments found in email');
      return { content: null, filename: null };
    }

    console.log(`Found ${attachmentCount} attachments.`);

    // Find PDF attachments
    for (let i = 1; i <= attachmentCount; i++) {
      // Mailgun uses attachment-x keys starting from 1
      const attachmentKey = `attachment-${i}`;
      const attachmentFile = emailData[attachmentKey];

      // Check if the attachment data exists and is a File object (standard FormData)
      if (attachmentFile instanceof File) {
         console.log(`Processing attachment ${i}: ${attachmentFile.name} (${attachmentFile.type})`);
         if (attachmentFile.type === 'application/pdf' || attachmentFile.name.toLowerCase().endsWith('.pdf')) {
            const buffer = await attachmentFile.arrayBuffer();
            const content = Buffer.from(buffer).toString('base64');
            console.log(`Found PDF attachment: ${attachmentFile.name}`);
            return { content, filename: attachmentFile.name };
         }
      } else {
        // Fallback for potentially different Mailgun structures or testing scenarios
        // This part might need adjustment based on actual Mailgun payload structure if not using standard File objects
        const contentType = emailData[`attachment-${i}-content-type`]; // Check specific content-type field if exists
        const contentName = emailData[`attachment-${i}-name`]; // Check specific name field if exists

        if (contentType?.includes('application/pdf') || contentName?.toLowerCase().endsWith('.pdf')) {
          // Mailgun sometimes provides content directly as base64 string in specific fields
           const base64Content = emailData[`attachment-${i}-content`]; // Hypothetical field name
          if (base64Content && typeof base64Content === 'string') {
             console.log(`Found PDF attachment (fallback method): ${contentName || 'Unknown name'}`);
             return { content: base64Content, filename: contentName || null };
          }
        }
      }
    }

    console.log('No PDF attachments found');
    return { content: null, filename: null };
  } catch (error) {
    console.error('Error extracting PDF content:', error);
    return { content: null, filename: null };
  }
}


export async function POST(request: Request) {
  let webhookResponse = null;
  let extractedTransactions: any[] = [];
  let pdfProcessed = false;
  let errorOccurred = false;
  let errorMessage = '';
  let emailSubject = 'No subject';
  let emailFrom = 'Unknown sender';
  let emailId = 'unknown';

  try {
    const formData = await request.formData();
    const data: {[key: string]: any} = {};
    for (const [key, value] of formData.entries()) {
      // Store file objects directly if they are files
      if (value instanceof File) {
        data[key] = value;
      } else {
        data[key] = value.toString();
      }
    }

     // Extract basic email info for logging/response
     emailSubject = data.subject || emailSubject;
     emailFrom = data.from || emailFrom;
     emailId = data['Message-Id'] || emailId;

    // Log the received email data (consider logging less in production)
    console.log("Received email data keys:", Object.keys(data));
    await logEmail({ subject: emailSubject, from: emailFrom, messageId: emailId, timestamp: new Date().toISOString() }); // Log essentials


    // Check if the email contains PDF attachments
    const { content: base64PdfContent, filename: pdfFilename } = extractBase64PdfContent(data);

    if (base64PdfContent) {
       pdfProcessed = true;
      console.log(`Processing PDF: ${pdfFilename || 'Unknown filename'}`);
      try {
        // Convert base64 to array buffer
        const pdfBuffer = Buffer.from(base64PdfContent, 'base64');

        // Extract text from PDF
        const extractedText = await extractTextFromPdf(pdfBuffer.buffer);
        console.log('Extracted text length:', extractedText?.length);
        // console.log('Extracted text from PDF:', extractedText); // Optionally log full text for debug

        if (extractedText && extractedText.trim().length > 0) {
          // Extract transaction details using AI
           console.log("Calling AI to extract transaction details...");
          const result = await extractAllTransactionDetails({ pdfContent: extractedText });
           console.log(`AI extraction result: ${result.transactions.length} transactions found.`);
           // console.log("Extracted transactions:", JSON.stringify(result.transactions, null, 2)); // Log details for debug

          // Store extracted transactions
          extractedTransactions = result.transactions || [];

          // Forward transactions to webhook if any were extracted
          if (extractedTransactions.length > 0) {
            webhookResponse = await forwardToWebhook(extractedTransactions, data);
             if (webhookResponse?.error) {
                // Log webhook forwarding errors but don't fail the whole request
                console.error(`Webhook forwarding failed: ${webhookResponse.error}`);
                errorOccurred = true; // Mark that an error occurred during forwarding
                errorMessage = `Webhook forwarding failed: ${webhookResponse.error}`;
             }
          } else {
             console.log("No transactions extracted by AI, nothing to forward.");
          }
        } else {
           console.log("PDF text extraction resulted in empty or whitespace content.");
        }
      } catch (pdfError) {
        console.error('Error processing PDF or calling AI:', pdfError);
         errorOccurred = true;
         errorMessage = pdfError instanceof Error ? pdfError.message : String(pdfError);
      }
    } else {
       console.log("No processable PDF found in the email.");
    }

    // Determine final status code based on whether critical errors occurred
    const status = errorOccurred && !webhookResponse ? 500 : 200; // Return 500 only if PDF processing/AI failed AND webhook wasn't attempted/failed

    return NextResponse.json({
      received: true,
      data: {
        emailId: emailId,
        subject: emailSubject,
        from: emailFrom,
        pdfProcessed: pdfProcessed,
        transactionsExtracted: extractedTransactions.length,
        webhookForwarded: !!webhookResponse && !webhookResponse.error,
        webhookResponse: webhookResponse // Include webhook response/error for transparency
      },
       ...(status === 500 && { error: errorMessage }) // Include error message in response body if status is 500
    }, { status });

  } catch (error) {
    console.error('Error processing email request:', error);
    errorOccurred = true;
    errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { received: false, error: errorMessage },
      { status: 500 }
    );
  }
}

    