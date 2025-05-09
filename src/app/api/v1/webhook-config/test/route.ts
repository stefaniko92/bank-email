import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // Get current webhook configuration
    const configRef = db.collection('config').doc('webhook');
    const configDoc = await configRef.get();
    
    if (!configDoc.exists || !configDoc.data()?.url) {
      return NextResponse.json(
        { error: 'No webhook URL configured' },
        { status: 400 }
      );
    }

    const config = configDoc.data() as { url: string };

    // Create a test payload
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook payload',
      sampleData: {
        transactions: [
          {
            nazivSedistePrimaoca: "Test Recipient",
            iznosOdobrenja: "1.000,00",
            pozivNaBrojOdobrenja: "TEST-123",
            referentnaOznaka: "TEST-REF",
            datumKnjizenja: new Date().toISOString().split('T')[0]
          }
        ],
        email: {
          subject: "Test Email",
          from: "test@example.com",
          to: "recipient@example.com",
          timestamp: new Date().toISOString(),
          messageId: "test-message-id"
        }
      }
    };

    // Send test request to webhook
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    // Get response body
    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Webhook test failed with status: ${response.status}`,
        response: responseBody
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook test successful',
      status: response.status,
      response: responseBody
    });
  } catch (error) {
    console.error('Error testing webhook:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 