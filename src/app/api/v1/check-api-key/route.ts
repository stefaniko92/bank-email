import { NextResponse } from 'next/server';

export async function GET() {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

  const hasApiKey =
    provider === 'anthropic'
      ? hasAnthropicKey
      : hasOpenAIKey;

  return NextResponse.json({
    provider,
    hasApiKey,
    hasOpenAIKey,
    hasAnthropicKey,
  });
}
