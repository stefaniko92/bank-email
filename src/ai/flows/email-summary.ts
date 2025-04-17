// Email Summary Flow
'use server';
/**
 * @fileOverview Summarizes email content for quick review, extracting key information.
 *
 * - summarizeEmail - A function that summarizes email content.
 * - SummarizeEmailInput - The input type for the summarizeEmail function.
 * - SummarizeEmailOutput - The return type for the summarizeEmail function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {Email} from '@/services/email';

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

export async function summarizeEmail(input: SummarizeEmailInput): Promise<SummarizeEmailOutput> {
  return summarizeEmailFlow(input);
}

const summarizeEmailPrompt = ai.definePrompt({
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
});

const summarizeEmailFlow = ai.defineFlow<
  typeof SummarizeEmailInputSchema,
  typeof SummarizeEmailOutputSchema
>(
  {
    name: 'summarizeEmailFlow',
    inputSchema: SummarizeEmailInputSchema,
    outputSchema: SummarizeEmailOutputSchema,
  },
  async input => {
    const {output} = await summarizeEmailPrompt(input);
    return output!;
  }
);
