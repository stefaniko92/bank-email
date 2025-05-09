import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// GET endpoint to retrieve webhook configuration
export async function GET() {
  try {
    const configRef = db.collection('config').doc('webhook');
    const configDoc = await configRef.get();
    
    if (!configDoc.exists) {
      return NextResponse.json(
        { error: 'Webhook configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(configDoc.data());
  } catch (error) {
    console.error('Error getting webhook config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST endpoint to update webhook configuration
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate input
    if (data.url !== undefined && typeof data.url !== 'string') {
      return NextResponse.json(
        { error: 'URL must be a string' },
        { status: 400 }
      );
    }
    
    if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Enabled flag must be a boolean' },
        { status: 400 }
      );
    }
    
    // Update configuration
    const configRef = db.collection('config').doc('webhook');
    await configRef.set({
      url: data.url,
      enabled: data.enabled,
      lastUpdated: new Date().toISOString()
    }, { merge: true }); // Use merge to only update specified fields
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating webhook config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Test endpoint to verify webhook is working
export async function PUT(request: NextRequest) {
  try {
    const config = await request.json();
    
    if (!config.url) {
      return NextResponse.json(
        { error: 'Webhook URL is required' },
        { status: 400 }
      );
    }

    // Update webhook configuration
    const configRef = db.collection('config').doc('webhook');
    await configRef.set({
      ...config,
      lastUpdated: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating webhook config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 