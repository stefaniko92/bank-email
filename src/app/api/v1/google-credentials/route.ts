'use server';

import { NextResponse } from 'next/server';

export async function GET() {
  if (!process.env.GOOGLE_API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_API_KEY environment variable is not set' },
      { status: 500 }
    );
  }

  return NextResponse.json({ apiKey: process.env.GOOGLE_API_KEY });
} 