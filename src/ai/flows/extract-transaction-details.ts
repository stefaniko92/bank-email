import { z } from 'zod';
import { extractTextFromPdf } from '@/lib/pdf-utils';
import { generateText } from '@/lib/ai/chat';

const TransactionSchema = z.object({
  nazivSedistePrimaoca: z.string(),
  iznosOdobrenja: z.string(),
  pozivNaBrojOdobrenja: z.string(),
  referentnaOznaka: z.string(),
  datumKnjizenja: z.string(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

function cleanJsonResponse(raw: string): string {
  let text = raw.trim();

  if (text.startsWith('```json')) {
    text = text.slice(7);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }

  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }

  return text.trim();
}

export async function extractTransactionDetails(pdfBuffer: Buffer): Promise<Transaction[]> {
  const pdfText = await extractTextFromPdf(pdfBuffer);

  if (!pdfText.trim()) {
    throw new Error('Unable to extract text from PDF');
  }

  const chunks = chunkText(pdfText, CHUNK_SIZE);
  const results: Transaction[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunkTransactions = await extractTransactionsFromChunk(
      chunks[i],
      i,
      chunks.length,
    );

    for (const transaction of chunkTransactions) {
      const sanitized = sanitizeTransaction(transaction);
      const key = JSON.stringify(sanitized);
      if (!seen.has(key)) {
        seen.add(key);
        results.push(sanitized);
      }
    }
  }

  return results;
}

function sanitizeTransaction(transaction: Transaction): Transaction {
  return {
    nazivSedistePrimaoca: transaction.nazivSedistePrimaoca.trim(),
    iznosOdobrenja: formatAmount(transaction.iznosOdobrenja),
    pozivNaBrojOdobrenja: normalizePozivNaBroj(transaction.pozivNaBrojOdobrenja),
    referentnaOznaka: normalizeReferentnaOznaka(transaction.referentnaOznaka),
    datumKnjizenja: normalizeDate(transaction.datumKnjizenja),
  };
}

function formatAmount(raw: string): string {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
  const numeric = Number.parseFloat(cleaned);
  if (!Number.isFinite(numeric)) {
    return 'N/A';
  }
  return numeric.toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizePozivNaBroj(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8, 14)}`;
  }
  if (digits.length === 12) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8, 12)}`;
  }
  return 'N/A';
}

function normalizeReferentnaOznaka(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 12) {
    const normalized = digits.slice(0, 12);
    return `${normalized.slice(0, 2)}-${normalized.slice(2, 5)}-${normalized.slice(5, 8)}-${normalized.slice(8, 12)}`;
  }
  return 'N/A';
}

function normalizeDate(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
  }
  return raw.trim();
}

function isObjectWithTransactions(value: unknown): value is { transactions: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'transactions' in value &&
    Array.isArray((value as any).transactions)
  );
}

function extractJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const candidate = raw.slice(start, end + 1);
  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const CHUNK_SIZE = 3_500;
const MIN_SPLIT_LENGTH = 1_200;
const MAX_SPLIT_DEPTH = 3;

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function extractTransactionsFromChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  depth = 0,
): Promise<Transaction[]> {
  const systemPrompt = `
You are a financial data extraction assistant.
Return ONLY JSON. Each transaction must include:
- "nazivSedistePrimaoca": string
- "iznosOdobrenja": string (amount, keep decimal separator)
- "pozivNaBrojOdobrenja": string
- "referentnaOznaka": string
- "datumKnjizenja": string

Rules:
1. Respond with a JSON object that has a "transactions" array.
2. Include only transactions that appear in the provided text chunk.
3. Use "N/A" for missing values.
4. Do not reference other chunks or infer missing data.
  `.trim();

  const userPrompt = `
Bank statement text (chunk ${chunkIndex + 1} of ${totalChunks}):
<<<
${chunk}
>>>

Return: { "transactions": [...] }
  `.trim();

  const { text: responseText, finishReason } = await generateText({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 1500,
    temperature: 0.1,
  });

  if (
    finishReason === 'length' &&
    chunk.length > MIN_SPLIT_LENGTH &&
    depth < MAX_SPLIT_DEPTH
  ) {
    const midpoint = Math.floor(chunk.length / 2);
    const first = chunk.slice(0, midpoint);
    const second = chunk.slice(midpoint);
    return [
      ...(await extractTransactionsFromChunk(first, chunkIndex, totalChunks, depth + 1)),
      ...(await extractTransactionsFromChunk(second, chunkIndex, totalChunks, depth + 1)),
    ];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    const arraySlice = extractJsonArray(responseText);
    if (!arraySlice) {
      if (chunk.length > MIN_SPLIT_LENGTH && depth < MAX_SPLIT_DEPTH) {
        const midpoint = Math.floor(chunk.length / 2);
        const first = chunk.slice(0, midpoint);
        const second = chunk.slice(midpoint);
        return [
          ...(await extractTransactionsFromChunk(first, chunkIndex, totalChunks, depth + 1)),
          ...(await extractTransactionsFromChunk(second, chunkIndex, totalChunks, depth + 1)),
        ];
      }
      console.error('Failed to parse chunk response as JSON:', error);
      console.error('Raw chunk response:', responseText);
      return [];
    }
    parsed = { transactions: arraySlice };
  }

  if (isObjectWithTransactions(parsed)) {
    return parsed.transactions as Transaction[];
  }

  if (Array.isArray(parsed)) {
    return parsed as Transaction[];
  }

  console.warn('Unexpected chunk response shape:', parsed);
  return [];
}
