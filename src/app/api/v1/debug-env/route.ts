import { NextResponse } from 'next/server';

export async function GET() {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();
  const openaiKey = process.env.OPENAI_API_KEY ?? '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  const envKeys = Object.keys(process.env).filter(key =>
    key.startsWith('OPENAI') ||
    key.startsWith('ANTHROPIC') ||
    key === 'AI_PROVIDER' ||
    key === 'DATABASE_URL'
  );

  return NextResponse.json({
    provider,
    hasOpenAIKey: !!openaiKey,
    openaiKeyPreview: openaiKey ? `${openaiKey.substring(0, 4)}...` : null,
    hasAnthropicKey: !!anthropicKey,
    anthropicKeyPreview: anthropicKey ? `${anthropicKey.substring(0, 4)}...` : null,
    databaseUrlSet: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    envKeys,
  });
}
