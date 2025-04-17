// 'use server';
/**
 * @fileOverview Extracts transaction details from PDF content using AI.
 *
 * - extractTransactionDetails - A function that extracts transaction details from PDF content.
 * - ExtractTransactionDetailsInput - The input type for the extractTransactionDetails function.
 * - ExtractTransactionDetailsOutput - The return type for the extractTransactionDetails function.
 */

'use server';
import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ExtractTransactionDetailsInputSchema = z.object({
  pdfContent: z.string().describe('The text content extracted from the PDF attachment.'),
});
export type ExtractTransactionDetailsInput = z.infer<typeof ExtractTransactionDetailsInputSchema>;

const ExtractTransactionDetailsOutputSchema = z.object({
  transactionId: z.string().describe('The unique identifier for the transaction.'),
  amount: z.number().describe('The transaction amount.'),
  date: z.string().describe('The transaction date in ISO format (YYYY-MM-DD).'),
  vendor: z.string().describe('The name of the vendor involved in the transaction.'),
});
export type ExtractTransactionDetailsOutput = z.infer<typeof ExtractTransactionDetailsOutputSchema>;

export async function extractTransactionDetails(
  input: ExtractTransactionDetailsInput
): Promise<ExtractTransactionDetailsOutput> {
  return extractTransactionDetailsFlow(input);
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
      transactionId: z.string().describe('The unique identifier for the transaction.'),
      amount: z.number().describe('The transaction amount.'),
      date: z.string().describe('The transaction date in ISO format (YYYY-MM-DD).'),
      vendor: z.string().describe('The name of the vendor involved in the transaction.'),
    }),
  },
  prompt: `You are an expert at extracting transaction details from text.

  Given the following text extracted from a PDF, extract the transaction details.

  Text: {{{pdfContent}}}

  Make sure to output the transaction date in ISO format (YYYY-MM-DD).
  If a field cannot be determined, return "unknown".`,
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
