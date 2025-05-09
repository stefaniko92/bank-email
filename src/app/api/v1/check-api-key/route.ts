import { NextResponse } from 'next/server';

export async function GET() {
  const hasApiKey = !!process.env.GOOGLE_GENAI_API_KEY;
  
  return NextResponse.json({ hasApiKey });
} 