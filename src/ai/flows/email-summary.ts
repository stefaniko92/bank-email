// Email Summary Flow
/**
 * @fileOverview Summarizes email content for quick review, extracting key information.
 *
 * - summarizeEmail - A function that summarizes email content.
 * - SummarizeEmailInput - The input type for the summarizeEmail function.
 * - SummarizeEmailOutput - The return type for the summarizeEmail function.
 */

import { genkit } from 'genkit';
import { googleAI, gemini15Pro } from '@genkit-ai/googleai';
import { extractTextFromPdf } from '@/lib/pdf-utils';
import { z } from 'zod';

const EmailDataSchema = z.object({
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  text: z.string(),
  html: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    contentType: z.string(),
    content: z.instanceof(Buffer)
  })).optional()
});

type EmailData = z.infer<typeof EmailDataSchema>;

const SummarizeEmailInputSchema = z.object({
  email: z.object({
    from: z.string().describe('The sender of the email.'),
    to: z.string().describe('The recipient of the email.'),
    subject: z.string().describe('The subject of the email.'),
    body: z.string().describe('The body of the email.'),
  }).describe('The email to summarize')
});
export type SummarizeEmailInput = z.infer<typeof SummarizeEmailInputSchema>;

const SummarizeEmailOutputSchema = z.object({
  summary: z.string().describe('A brief summary of the email content.'),
});
export type SummarizeEmailOutput = z.infer<typeof SummarizeEmailOutputSchema>;

if (!process.env.GOOGLE_GENAI_API_KEY) {
  console.warn('GOOGLE_GENAI_API_KEY environment variable is not set. Email summarization will fail until it is configured.');
}

type GenkitInstance = ReturnType<typeof genkit>;
type SummarizeEmailPromptExecutor = (input: SummarizeEmailInput, opts?: unknown) => Promise<{ output?: SummarizeEmailOutput }>;
type SummarizeEmailFlowExecutor = (input: SummarizeEmailInput) => Promise<SummarizeEmailOutput>;

let aiInstance: GenkitInstance | null = null;
let summarizeEmailPromptInstance: SummarizeEmailPromptExecutor | null = null;
let summarizeEmailFlowInstance: SummarizeEmailFlowExecutor | null = null;

function getAi(): GenkitInstance {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY environment variable is not set');
  }

  if (!aiInstance) {
    aiInstance = genkit({
      plugins: [googleAI({ apiKey })],
      model: gemini15Pro
    });
  }

  return aiInstance;
}

function getSummarizeEmailPrompt(): SummarizeEmailPromptExecutor {
  if (!summarizeEmailPromptInstance) {
    const ai = getAi();
    summarizeEmailPromptInstance = ai.definePrompt({
      name: 'summarizeEmailPrompt',
      input: {
        schema: z.object({
          email: z.object({
            from: z.string().describe('The sender of the email.'),
            to: z.string().describe('The recipient of the email.'),
            subject: z.string().describe('The subject of the email.'),
            body: z.string().describe('The body of the email.'),
          }).describe('The email to summarize')
        }),
      },
      output: {
        schema: z.object({
          summary: z.string().describe('A brief summary of the email content.'),
        }),
      },
      prompt: `You are an AI assistant tasked with summarizing emails for quick review.\n  Please provide a concise summary of the following email, highlighting the key information.\n\n  Sender: {{{email.from}}}\n  Recipient: {{{email.to}}}\n  Subject: {{{email.subject}}}\n  Body: {{{email.body}}}\n\n  Summary: `,
    }) as SummarizeEmailPromptExecutor;
  }

  return summarizeEmailPromptInstance!;
}

function getSummarizeEmailFlow(): SummarizeEmailFlowExecutor {
  if (!summarizeEmailFlowInstance) {
    const ai = getAi();
    const prompt = getSummarizeEmailPrompt();

    summarizeEmailFlowInstance = ai.defineFlow<
      typeof SummarizeEmailInputSchema,
      typeof SummarizeEmailOutputSchema
    >(
      {
        name: 'summarizeEmailFlow',
        inputSchema: SummarizeEmailInputSchema,
        outputSchema: SummarizeEmailOutputSchema,
      },
      async input => {
        const {output} = await prompt(input);
        return output!;
      }
    ) as SummarizeEmailFlowExecutor;
  }

  return summarizeEmailFlowInstance!;
}

export async function summarizeEmail(input: SummarizeEmailInput): Promise<SummarizeEmailOutput> {
  const flow = getSummarizeEmailFlow();
  return flow(input);
}

export async function generateEmailSummary(emailData: EmailData) {
  // Extract text from PDF attachments if any
  let attachmentText = '';
  if (emailData.attachments) {
    for (const attachment of emailData.attachments) {
      if (attachment.contentType === 'application/pdf') {
        const text = await extractTextFromPdf(attachment.content.buffer);
        attachmentText += text + '\n';
      }
    }
  }

  const ai = getAi();
  const prompt = `Please summarize this email:
Subject: ${emailData.subject}
From: ${emailData.from}
To: ${emailData.to}
Content: ${emailData.text}
${attachmentText ? `Attachments content: ${attachmentText}` : ''}`;

  const { text } = await ai.generate({
    prompt,
    config: {
      temperature: 0.3,
      maxOutputTokens: 500
    }
  });

  return text;
}
