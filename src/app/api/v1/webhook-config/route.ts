import { NextRequest, NextResponse } from 'next/server';
import { getWebhookConfig, upsertWebhookConfig } from '@/lib/storage';

export async function GET() {
  try {
    const config = await getWebhookConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Webhook configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      url: config.url,
      enabled: config.enabled,
      updatedAt: config.updated_at
    });
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
    
    const updated = await upsertWebhookConfig({
      url: data.url,
      enabled: data.enabled
    });

    return NextResponse.json({
      success: true,
      config: {
        url: updated.url,
        enabled: updated.enabled,
        updatedAt: updated.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating webhook config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 
