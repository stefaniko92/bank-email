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
  model: 'gemini20flash',
  prompt: `You are an expert at extracting transaction details from text.

  Given the following text extracted from a PDF, extract the transaction details.

  Text: {{{pdfContent}}}

  Specifically, extract the following fields:

  - Naziv i sedište primaoca platioca (Name and address of the recipient / payer)
  - Iznos odobrenja (Amount of approval)
  - Poziv na broj odobrenja (Reference number of approval)
  - Datum knjiženja (Date of posting)

  Make sure to output the date in ISO format (YYYY-MM-DD).
  If a field cannot be determined, return "unknown".

  Be precise.
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


