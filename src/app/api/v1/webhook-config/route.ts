'use server';

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Configuration file path
const CONFIG_FILE_PATH = path.join(process.cwd(), 'webhook-config.json');

/**
 * Gets the current webhook configuration
 * In a production environment, this should use a more robust storage mechanism
 */
async function getWebhookConfig() {
  try {
    const fileExists = await fs.access(CONFIG_FILE_PATH).then(() => true).catch(() => false);
    
    if (!fileExists) {
      // Create default config if file doesn't exist
      const defaultConfig = { 
        url: process.env.WEBHOOK_URL || '', 
        enabled: true,
        lastUpdated: new Date().toISOString()
      };
      await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }
    
    const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error reading webhook config:', error);
    return { 
      url: process.env.WEBHOOK_URL || '', 
      enabled: true,
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Updates the webhook configuration
 */
async function updateWebhookConfig(config: any) {
  try {
    // Merge with existing config
    const existingConfig = await getWebhookConfig();
    const updatedConfig = {
      ...existingConfig,
      ...config,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(updatedConfig, null, 2));
    return updatedConfig;
  } catch (error) {
    console.error('Error updating webhook config:', error);
    throw error;
  }
}

// GET endpoint to retrieve webhook configuration
export async function GET() {
  try {
    const config = await getWebhookConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get webhook configuration' },
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
    const updatedConfig = await updateWebhookConfig({
      url: data.url,
      enabled: data.enabled
    });
    
    return NextResponse.json(updatedConfig);
  } catch (error) {
    console.error('Error updating webhook config:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook configuration' },
      { status: 500 }
    );
  }
}

// Test endpoint to verify webhook is working
export async function PUT(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }
    
    // Send test payload to webhook
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook payload'
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook test failed with status: ${response.status}`);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Webhook test successful',
      status: response.status
    });
  } catch (error) {
    console.error('Error testing webhook:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
} 