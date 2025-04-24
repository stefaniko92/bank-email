'use server';
/**
 * @fileOverview Extracts transaction details from PDF content using AI.
 *
 * - extractTransactionDetails - A function that extracts transaction details from PDF content.
 * - ExtractTransactionDetailsInput - The input type for the extractTransactionDetails function.
 * - ExtractTransactionDetailsOutput - The return type for the ExtractTransactionDetails function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ExtractTransactionDetailsInputSchema = z.object({
  pdfContent: z.string().describe('The text content extracted from the PDF attachment.'),
});
export type ExtractTransactionDetailsInput = z.infer<typeof ExtractTransactionDetailsInputSchema>;

const ExtractTransactionDetailsOutputSchema = z.object({
  nazivSedistePrimaoca: z.string().describe('The name and address of the recipient.'),
  iznosOdobrenja: z.string().describe('The amount of the transaction.'),
  pozivNaBrojOdobrenja: z.string().describe('The reference number of the transaction.'),
  datumKnjizenja: z.string().describe('The date of the transaction in ISO format (YYYY-MM-DD).'),
});
export type ExtractTransactionDetailsOutput = z.infer<typeof ExtractTransactionDetailsOutputSchema>;

export async function extractTransactionDetails(
  input: ExtractTransactionDetailsInput
): Promise<ExtractTransactionDetailsOutput> {
    return await extractTransactionDetailsFlow(input);
}

const extractTransactionDetailsPrompt = ai.definePrompt({
  name: 'extractTransactionDetailsPrompt',
  input: {
    schema: z.object({
      pdfContent: z.string().describe('The text content extracted from the PDF attachment.'),
    }),
  },
  output: {
    schema: z.object({
      nazivSedistePrimaoca: z.string().describe('The name and address of the recipient.'),
      iznosOdobrenja: z.string().describe('The amount of the transaction.'),
      pozivNaBrojOdobrenja: z.string().describe('The reference number of the transaction.'),
      datumKnjizenja: z.string().describe('The date of the transaction in ISO format (YYYY-MM-DD).'),
    }),
  },
  prompt: `
You are an AI assistant specialized in reading bank statement text and extracting key transaction details.

You will be given text extracted from a bank statement in Serbian. Identify and extract the following fields from the first transaction listed in the text:

- nazivSedistePrimaoca: The full name and address of the recipient
- iznosOdobrenja: The credited amount in dinars (e.g., "3.600,00")
- pozivNaBrojOdobrenja: The reference number for the credit (e.g., "87000137250")
- datumKnjizenja: The date of the transaction in ISO format (YYYY-MM-DD)

Only extract the **first transaction** listed in the text.

Text:
{{{pdfContent}}}

Return a JSON object in this format:
{
  "nazivSedistePrimaoca": "...",
  "iznosOdobrenja": "...",
  "pozivNaBrojOdobrenja": "...",
  "datumKnjizenja": "YYYY-MM-DD"
}
If any field is missing or unclear, return "unknown" as the value.
Be precise and do not invent data.
`,
});

const extractTransactionDetailsFlow = ai.defineFlow<
  typeof ExtractTransactionDetailsInputSchema,
  typeof ExtractTransactionDetailsOutputSchema
>(
  {
    name: 'extractTransactionDetailsFlow',
    inputSchema: ExtractTransactionDetailsInputSchema,
    outputSchema: ExtractTransactionDetailsOutputSchema,
  },
  async input => {
      const {output} = await extractTransactionDetailsPrompt(input);
      return output!;
  }
);
