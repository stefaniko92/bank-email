'use server';

import {NextResponse} from 'next/server';
import {logEmail} from '@/services/email-logger';
import {extractAllTransactionDetails} from '@/ai/flows/extract-transaction-details';
import {extractTextFromPdf} from '@/lib/pdf-utils';
import fs from 'fs/promises';
import path from 'path';

/**
 * @fileOverview Receives email data from Mailgun via POST request, extracts transaction details from PDFs, and forwards to a webhook.
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
      return { 
        url: process.env.WEBHOOK_URL || '', 
        enabled: true
      };
    }
    
    const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error reading webhook config:', error);
    return { 
      url: process.env.WEBHOOK_URL || '', 
      enabled: true
    };
  }
}

/**
 * Forwards transaction data to an external webhook
 */
async function forwardToWebhook(transactions: any, emailData: any) {
  try {
    // Get webhook configuration
    const config = await getWebhookConfig();
    
    if (!config.enabled || !config.url) {
      console.log('Webhook forwarding disabled or URL not configured');
      return null;
    }

    console.log(`Forwarding ${transactions.length} transactions to webhook: ${config.url}`);
    
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactions: transactions,
        email: {
          subject: emailData.subject || '',
          from: emailData.from || '',
          timestamp: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10000), // 10 seconds timeout
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with status: ${response.status}`);
    }

    const responseData = await response.json();
    console.log('Webhook response:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error forwarding to webhook:', error);
    return null;
  }
}

/**
 * Extract base64 encoded PDF content from email attachments
 */
function extractBase64PdfContent(emailData: any): string | null {
  try {
    // Check if we have attachments
    if (!emailData['attachment-count'] || parseInt(emailData['attachment-count']) === 0) {
      console.log('No attachments found in email');
      return null;
    }

    // Find PDF attachments
    for (let i = 1; i <= parseInt(emailData['attachment-count']); i++) {
      const contentType = emailData[`attachment-${i}-content-type`];
      const contentName = emailData[`attachment-${i}-name`];
      
      if (contentType?.includes('application/pdf') || contentName?.toLowerCase().endsWith('.pdf')) {
        // Get the base64 content
        const content = emailData[`attachment-${i}-content`];
        if (content) {
          console.log(`Found PDF attachment: ${contentName}`);
          return content;
        }
      }
    }
    
    console.log('No PDF attachments found');
    return null;
  } catch (error) {
    console.error('Error extracting PDF content:', error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const data: {[key: string]: any} = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Log the received email data
    await logEmail(data);

    // Check if the email contains PDF attachments
    const base64PdfContent = extractBase64PdfContent(data);
    let webhookResponse = null;
    let extractedTransactions = [];
    
    if (base64PdfContent) {
      try {
        // Convert base64 to array buffer
        const pdfBuffer = Buffer.from(base64PdfContent, 'base64');
        
        // Extract text from PDF
        const extractedText = await extractTextFromPdf(pdfBuffer.buffer);
        console.log('Extracted text from PDF:', extractedText);
        
        if (extractedText) {
          // Extract transaction details
          const result = await extractAllTransactionDetails({ pdfContent: extractedText });
          console.log(`Extracted ${result.transactions.length} transactions:`, result.transactions);
          
          // Store extracted transactions
          extractedTransactions = result.transactions;
          
          // Forward transactions to webhook if there are any
          if (result.transactions && result.transactions.length > 0) {
            webhookResponse = await forwardToWebhook(result.transactions, data);
          }
        }
      } catch (error) {
        console.error('Error processing PDF:', error);
      }
    }

    return NextResponse.json({
      received: true, 
      data: {
        emailId: data['Message-Id'] || 'unknown',
        subject: data.subject || 'No subject',
        pdfProcessed: !!base64PdfContent,
        transactionsExtracted: extractedTransactions.length,
        webhookForwarded: !!webhookResponse
      }
    }, {status: 200});
  } catch (error) {
    console.error('Error processing email from Mailgun:', error);
    return NextResponse.json(
      {received: false, error: (error as any).message},
      {status: 500}
    );
  }
}
