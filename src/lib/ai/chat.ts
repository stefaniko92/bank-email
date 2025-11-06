import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';

type Provider = 'openai' | 'anthropic';

const provider = ((process.env.AI_PROVIDER ?? 'openai').toLowerCase() as Provider) ?? 'openai';

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

function logRequest(targetProvider: Provider, model: string, prompt: string) {
  const preview = prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt;
  console.log(
    `[AI] Sending request`,
    JSON.stringify({
      provider: targetProvider,
      model,
      promptPreview: preview,
      promptLength: prompt.length,
    }),
  );
}

function logResponse(targetProvider: Provider, model: string, durationMs: number, outputLength: number) {
  console.log(
    `[AI] Received response`,
    JSON.stringify({
      provider: targetProvider,
      model,
      durationMs,
      outputLength,
    }),
  );
}

export async function generateText(options: GenerateOptions): Promise<string> {
  const { system, prompt, maxTokens = 4096, temperature = 0.2 } = options;
  const start = Date.now();

  if (provider === 'anthropic') {
    const client = getAnthropic();
    const model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
    logRequest('anthropic', model, prompt);

    try {
      const response = await client.messages.create({
        model,
        system,
        max_tokens: maxTokens,
        temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const textBlocks = response.content.filter((part): part is TextBlock => part.type === 'text');
      const text = textBlocks.map(part => part.text).join('\n').trim();
      logResponse('anthropic', model, Date.now() - start, text.length);
      return text;
    } catch (error) {
      console.error(`[AI] Anthropic request failed`, error);
      throw error;
    }
  }

  const client = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  logRequest('openai', model, prompt);

  try {
    const response = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content?.trim() ?? '';
    logResponse('openai', model, Date.now() - start, text.length);
    return text;
  } catch (error) {
    console.error(`[AI] OpenAI request failed`, error);
    throw error;
  }
}
