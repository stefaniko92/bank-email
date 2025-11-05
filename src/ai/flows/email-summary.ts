import { extractTextFromPdf } from '@/lib/pdf-utils';
import { generateText } from '@/lib/ai/chat';
import { z } from 'zod';

const EmailDataSchema = z.object({
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  text: z.string(),
  html: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        content: z.instanceof(Buffer),
      }),
    )
    .optional(),
});

type EmailData = z.infer<typeof EmailDataSchema>;

const SummarizeEmailInputSchema = z.object({
  email: z.object({
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
});

export type SummarizeEmailInput = z.infer<typeof SummarizeEmailInputSchema>;

const SummarizeEmailOutputSchema = z.object({
  summary: z.string(),
});

export type SummarizeEmailOutput = z.infer<typeof SummarizeEmailOutputSchema>;

export async function summarizeEmail(input: SummarizeEmailInput): Promise<SummarizeEmailOutput> {
  const parsedInput = SummarizeEmailInputSchema.parse(input);

  const systemPrompt = `
You summarize emails for busy professionals.
Highlight intent, required actions, critical dates, and amounts in 3-4 sentences.
Avoid bullet points. Respond with plain text only.
  `.trim();

  const userPrompt = `
From: ${parsedInput.email.from}
To: ${parsedInput.email.to}
Subject: ${parsedInput.email.subject}

${parsedInput.email.body}
  `.trim();

  const summary = await generateText({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 300,
    temperature: 0.3,
  });

  return SummarizeEmailOutputSchema.parse({ summary });
}

export async function generateEmailSummary(emailData: EmailData) {
  const parsed = EmailDataSchema.parse(emailData);

  let attachmentText = '';
  if (parsed.attachments) {
    for (const attachment of parsed.attachments) {
      if (attachment.contentType === 'application/pdf') {
        const text = await extractTextFromPdf(attachment.content.buffer);
        attachmentText += `\nAttachment (${attachment.filename}):\n${text}`;
      }
    }
  }

  const prompt = `
Summarize the following email in 3-4 sentences, noting key requests, deadlines, and figures.

From: ${parsed.from}
To: ${parsed.to}
Subject: ${parsed.subject}

Body:
${parsed.text}
${attachmentText}
  `.trim();

  return generateText({
    system: 'You are an assistant that writes concise business summaries.',
    prompt,
    maxTokens: 350,
    temperature: 0.3,
  });
}
