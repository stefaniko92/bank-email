/**
 * @fileOverview Extracts transaction details directly from PDF files using Gemini AI.
 *
 * - extractTransactionDetails - A function that extracts transaction details from text content.
 * - ExtractTransactionDetailsInput - The input type for the extractTransactionDetails function.
 * - ExtractTransactionDetailsOutput - The return type for the ExtractTransactionDetails function.
 */

import { genkit } from 'genkit';
import { googleAI, gemini15Pro } from '@genkit-ai/googleai';
import { z } from 'zod';

const TransactionSchema = z.object({
  nazivSedistePrimaoca: z.string(),
  iznosOdobrenja: z.string(),
  pozivNaBrojOdobrenja: z.string(),
  referentnaOznaka: z.string(),
  datumKnjizenja: z.string()
});

export type Transaction = z.infer<typeof TransactionSchema>;

export async function extractTransactionDetails(pdfBuffer: Buffer): Promise<Transaction[]> {
  try {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY || (process.env as any).google?.genai_api_key;
    if (!apiKey) {
      throw new Error('Google Gemini API key not found in environment variables');
    }

    console.log('Initializing Gemini AI with API key:', apiKey.substring(0, 10) + '...');

    const ai = genkit({
      plugins: [googleAI({ apiKey })],
      model: gemini15Pro
    });

    // Convert PDF buffer to base64
    const base64Pdf = pdfBuffer.toString('base64');

    // Prepare the prompt with strict JSON output instructions
    const prompt = `
      You are a JSON generator that extracts transaction details from bank statements.
      Analyze the provided PDF and extract all transactions.
      
      Return ONLY a valid JSON array of transactions with these exact fields:
      {
        "nazivSedistePrimaoca": "string (recipient name)",
        "iznosOdobrenja": "string (amount)",
        "pozivNaBrojOdobrenja": "string (reference number)",
        "referentnaOznaka": "string (reference mark)",
        "datumKnjizenja": "string (posting date)"
      }
      
      Rules:
      1. Return ONLY the JSON array, no other text
      2. Use "N/A" for missing values
      3. Ensure all values are strings
      4. Format must be exactly as shown above
      5. Do not include any explanations or markdown
      6. Extract ALL transactions from the document
    `;

    // Generate transaction details using AI with PDF input
    const { text: responseText } = await ai.generate({
      model: gemini15Pro,
      prompt: [
        { text: prompt },
        { media: { url: `data:application/pdf;base64,${base64Pdf}` } }
      ],
      config: {
        temperature: 0.1,
        topP: 0.1,
        topK: 16,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    });

    // Log the raw Gemini response
    console.log('Gemini raw response:', responseText);

    // Parse and validate the response
    try {
      const parsedResponse = JSON.parse(responseText);
      if (!Array.isArray(parsedResponse)) {
        throw new Error('Response is not an array');
      }

      // Validate each transaction against the schema
      const transactions = parsedResponse.map(transaction => {
        const result = TransactionSchema.safeParse(transaction);
        if (!result.success) {
          throw new Error(`Invalid transaction format: ${result.error.message}`);
        }
        return result.data;
      });

      // Log the parsed transactions
      console.log('Parsed transactions:', JSON.stringify(transactions, null, 2));

      return transactions;
    } catch (error) {
      console.error('Error parsing AI response:', error);
      console.error('Raw response:', responseText);
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error in extractTransactionDetails:', error);
    throw error;
  }
} 