'use server';

import {NextResponse} from 'next/server';
import {logEmail, logTransaction, getWebhookConfig} from '@/lib/firebase';
import {extractAllTransactionDetails} from '@/ai/flows/extract-transaction-details';
import {extractTextFromPdf} from '@/lib/pdf-utils';

/**
 * @fileOverview Receives email data from Mailgun via POST request, extracts transaction details from PDFs, and forwards to a configured webhook (source app).
 *
 * This route handles POST requests to receive email data from Mailgun.
 * It extracts any transaction details from PDF attachments and forwards them to a configured webhook.
 * It logs the received data and returns a JSON response indicating success or failure.
 */

/**
 * Forwards transaction data to the configured external webhook (source app)
 */
async function forwardToWebhook(transactions: any[], emailData: any) {
  try {
    // Get webhook configuration
    const config = await getWebhookConfig();
    
    if (!config?.enabled || !config?.url) {
      console.log(`Webhook forwarding disabled or URL not configured. URL: ${config?.url}, Enabled: ${config?.enabled}`);
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
      responseData = { status: response.status, message: 'Webhook acknowledged' };
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
async function extractBase64PdfContent(emailData: any): Promise<{ content: string | null, filename: string | null }> {
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
        const contentType = emailData[`attachment-${i}-content-type`];
        const contentName = emailData[`attachment-${i}-name`];

        if (contentType?.includes('application/pdf') || contentName?.toLowerCase().endsWith('.pdf')) {
          const base64Content = emailData[`attachment-${i}-content`];
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

    // Log the received email data to Firebase
    await logEmail({
      subject: emailSubject,
      from: emailFrom,
      messageId: emailId,
      timestamp: new Date().toISOString(),
      ...data // Include all email data
    });

    // Check if the email contains PDF attachments
    const { content: base64PdfContent, filename: pdfFilename } = await extractBase64PdfContent(data);

    if (base64PdfContent) {
      pdfProcessed = true;
      console.log(`Processing PDF: ${pdfFilename || 'Unknown filename'}`);
      try {
        // Convert base64 to array buffer
        const pdfBuffer = Buffer.from(base64PdfContent, 'base64');
        
        // Extract text from PDF
        const extractedText = await extractTextFromPdf(pdfBuffer.buffer);
        console.log('Extracted text length:', extractedText?.length);

        if (extractedText && extractedText.trim().length > 0) {
          // Extract transaction details using AI
          console.log("Calling AI to extract transaction details...");
          const result = await extractAllTransactionDetails({ pdfContent: extractedText });
          console.log(`AI extraction result: ${result.transactions.length} transactions found.`);

          // Store extracted transactions
          extractedTransactions = result.transactions;
          
          // Log transactions to Firebase
          for (const transaction of result.transactions) {
            await logTransaction({
              ...transaction,
              emailId: emailId,
              emailSubject: emailSubject,
              emailFrom: emailFrom,
              pdfFilename: pdfFilename
            });
          }
          
          // Forward transactions to webhook if there are any
          if (result.transactions && result.transactions.length > 0) {
            webhookResponse = await forwardToWebhook(result.transactions, data);
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
    const status = errorOccurred && !webhookResponse ? 500 : 200;

    return NextResponse.json({
      received: true,
      data: {
        emailId: emailId,
        subject: emailSubject,
        from: emailFrom,
        pdfProcessed: pdfProcessed,
        transactionsExtracted: extractedTransactions.length,
        webhookForwarded: !!webhookResponse && !webhookResponse.error,
        webhookResponse: webhookResponse
      },
      ...(status === 500 && { error: errorMessage })
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

    