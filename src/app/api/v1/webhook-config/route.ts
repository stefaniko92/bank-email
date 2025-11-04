import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const db = getDb();
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

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
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
    
    const configRef = db.collection('config').doc('webhook');
    
    // Update configuration
    await configRef.set({
      url: data.url,
      enabled: data.enabled,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating webhook config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 
