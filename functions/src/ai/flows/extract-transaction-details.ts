import OpenAI from 'openai';
import { z } from 'zod';
import pdf from 'pdf-parse';
import { defineSecret } from 'firebase-functions/params';

export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');


const TransactionSchema = z.object({
  nazivSedistePrimaoca: z.string(),
  iznosOdobrenja: z.string(),
  pozivNaBrojOdobrenja: z.string(),
  referentnaOznaka: z.string(),
  datumKnjizenja: z.string()
});

export type Transaction = z.infer<typeof TransactionSchema>;

console.log('🔧 Initialized OpenAI client');

export async function extractTransactionDetails(pdfBuffer: Buffer): Promise<Transaction[]> {
  console.log('📄 Parsing PDF to extract text...');
  const parsed = await pdf(pdfBuffer);
  const extractedText = parsed.text;
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY.value() });

  console.log('📄 PDF text extracted, sending to OpenAI...');

  const prompt = `
    You are a JSON generator that extracts transaction details from bank statements.
    Analyze the following bank statement text and extract all transactions.

    Text:
    ${extractedText}

    Return ONLY a valid JSON array of transactions with these exact fields:
    {
      "nazivSedistePrimaoca": "string",
      "iznosOdobrenja": "string",
      "pozivNaBrojOdobrenja": "string",
      "referentnaOznaka": "string",
      "datumKnjizenja": "string"
    }

    Rules:
    1. Return ONLY the JSON array, no other text
    2. Use "N/A" for missing values
    3. Ensure all values are strings
    4. Format must be exactly as shown above
    5. Do not include any explanations or markdown
    6. Extract ALL transactions from the document
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const content = response.choices?.[0]?.message?.content || '';
  console.log('✅ Response received from OpenAI.');

  try {
    const parsedResult = JSON.parse(content);
    if (!Array.isArray(parsedResult)) {
      throw new Error('OpenAI response is not a JSON array');
    }

    const validated: Transaction[] = [];
    for (const item of parsedResult) {
      const result = TransactionSchema.safeParse(item);
      if (!result.success) {
        console.warn('⚠️ Skipping invalid transaction:', result.error.format());
        continue;
      }
      validated.push(result.data);
    }

    return validated;
  } catch (error) {
    console.error('❌ Failed to parse or validate OpenAI response:', error);
    throw new Error('OpenAI returned invalid JSON or structure');
  }
}
