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
  model: 'gemini-1.0-pro',
  prompt: `
You are a structured data extractor for Serbian bank statements.

You will receive plain text extracted from a Serbian bank statement (Izvod). Your job is to analyze the **first transaction** in the text and return key data in a structured JSON format.

### Example input:

Text:
MASLINA TRAVEL NIS  
MIODRAG GASIC PR,  
BOROVA 31B, DONJA VREZI  
170005004484200057  0,00  3.600,00  221  
05-171-209-2025  
87000137250  
869(2)  
23.04.2025 Placanje po racunu. [IZVTR00588513603]

Expected JSON output:
{
  "nazivSedistePrimaoca": "MASLINA TRAVEL NIS, MIODRAG GASIC PR, BOROVA 31B, DONJA VREZI",
  "iznosOdobrenja": "3.600,00",
  "pozivNaBrojOdobrenja": "87000137250",
  "datumKnjizenja": "2025-04-23"
}

### Now extract data from this input:

Text:
{{{pdfContent}}}

Only respond with JSON in the format:
{
  "nazivSedistePrimaoca": "...",
  "iznosOdobrenja": "...",
  "pozivNaBrojOdobrenja": "...",
  "datumKnjizenja": "YYYY-MM-DD"
}

If any value is not found, use "unknown".
`
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
