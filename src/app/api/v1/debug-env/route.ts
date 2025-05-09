import { NextResponse } from 'next/server';
import { getGoogleApiKey } from '@/lib/env';

export async function GET() {
  const apiKey = getGoogleApiKey();
  
  return NextResponse.json({
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey ? apiKey.length : 0,
    envKeys: Object.keys(process.env).filter(key => key.includes('GOOGLE')),
    nodeEnv: process.env.NODE_ENV,
    // Log the first few characters of the API key for debugging (if it exists)
    apiKeyPreview: apiKey ? `${apiKey.substring(0, 4)}...` : null,
  });
} 