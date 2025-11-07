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

type RawTransactionLike = Partial<Record<keyof Transaction, unknown>>;

function toSafeString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return JSON.stringify(value);
}

function coerceModelTransaction(item: RawTransactionLike): Transaction {
  return {
    nazivSedistePrimaoca: toSafeString(item.nazivSedistePrimaoca),
    iznosOdobrenja: toSafeString(item.iznosOdobrenja),
    pozivNaBrojOdobrenja: toSafeString(item.pozivNaBrojOdobrenja),
    referentnaOznaka: toSafeString(item.referentnaOznaka),
    datumKnjizenja: toSafeString(item.datumKnjizenja),
  };
}

function sanitizeTransaction(transaction: Transaction): Transaction {
  const normalizedDate = normalizeDate(transaction.datumKnjizenja);
  return {
    nazivSedistePrimaoca: transaction.nazivSedistePrimaoca.trim(),
    iznosOdobrenja: formatAmount(transaction.iznosOdobrenja),
    pozivNaBrojOdobrenja: normalizePozivNaBroj(transaction.pozivNaBrojOdobrenja, normalizedDate),
    referentnaOznaka: normalizeReferentnaOznaka(transaction.referentnaOznaka),
    datumKnjizenja: normalizedDate,
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

export function normalizePozivNaBroj(raw: string, bookingDate?: string): string {
  let cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'N/A';
  }

  cleaned = cleaned.replace(/\(\d+\)/g, ' ').replace(/\s+/g, ' ').trim();

  const dashedMatch = cleaned.match(/(\d{2})-(\d{3})-(\d{3})-(\d{2,6})/);
  if (dashedMatch) {
    const [, part1, part2, part3, suffixRaw] = dashedMatch;
    const trailingDigits = cleaned
      .slice((dashedMatch.index ?? 0) + dashedMatch[0].length)
      .replace(/\D/g, '');
    const completedSuffix = completeYearMonthSuffix(suffixRaw, trailingDigits, bookingDate);
    return completedSuffix ? `${part1}-${part2}-${part3}-${completedSuffix}` : 'N/A';
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 10) {
    return 'N/A';
  }

  const first = digits.slice(0, 2);
  const second = digits.slice(2, 5);
  const third = digits.slice(5, 8);
  let remainder = digits.slice(8);

  if (!first || !second || !third || !remainder) {
    return 'N/A';
  }

  const formattedSuffix = completeYearMonthSuffix(remainder, '', bookingDate);
  if (!formattedSuffix) {
    return 'N/A';
  }

  return [first, second, third, formattedSuffix].join('-');
}

function normalizeReferentnaOznaka(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned || 'N/A';
}

function normalizeDate(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'N/A';
  }

  const match = cleaned.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (match) {
    return match[1];
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 8) {
    const sliced = digits.slice(0, 8);
    return `${sliced.slice(0, 2)}.${sliced.slice(2, 4)}.${sliced.slice(4, 8)}`;
  }

  return 'N/A';
}

export function completeYearMonthSuffix(value: string, trailingDigits: string, bookingDate?: string): string | null {
  if (!value) {
    return null;
  }

  let suffix = value;
  if (suffix.length > 6) {
    suffix = suffix.slice(0, 6);
  }

  if (suffix.length < 6 && trailingDigits) {
    const needed = 6 - suffix.length;
    suffix += trailingDigits.slice(0, needed);
  }

  if (suffix.length === 5) {
    const year = suffix.slice(0, 4);
    const monthCandidate = suffix.slice(4);
    const inferredMonth =
      monthCandidate.length === 2
        ? monthCandidate
        : extractMonthFromDate(bookingDate) ?? getCurrentMonth();
    suffix = `${year}${inferredMonth.padStart(2, '0')}`;
  }

  if (suffix.length === 4) {
    const month = extractMonthFromDate(bookingDate) ?? getCurrentMonth();
    suffix = `${suffix}${month}`;
  }

  if (suffix.length < 6) {
    suffix = suffix.padEnd(6, '0');
  }

  return suffix.length === 6 ? suffix : null;
}

function extractMonthFromDate(date?: string): string | null {
  if (!date) {
    return null;
  }
  const match = date.match(/\d{2}\.(\d{2})\.\d{4}/);
  return match ? match[1] : null;
}

function getCurrentMonth(): string {
  const now = new Date();
  return String(now.getMonth() + 1).padStart(2, '0');
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

const CHUNK_SIZE = 1_800;
const MIN_SPLIT_LENGTH = 800;
const MAX_SPLIT_DEPTH = 5;

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(cursor + size, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end);
      if (newline > cursor + size * 0.5) {
        end = newline;
      }
    }
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }

  return chunks;
}

async function extractTransactionsFromChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  depth = 0,
  label?: string,
): Promise<Transaction[]> {
  const chunkLabel =
    label ??
    `chunk ${chunkIndex + 1}/${totalChunks}${depth ? ` split-${depth}` : ''}`;
  console.log(`[AI] Processing ${chunkLabel}, length=${chunk.length}`);
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
      ...(await extractTransactionsFromChunk(
        first,
        chunkIndex,
        totalChunks,
        depth + 1,
        `${chunkLabel}-a`,
      )),
      ...(await extractTransactionsFromChunk(
        second,
        chunkIndex,
        totalChunks,
        depth + 1,
        `${chunkLabel}-b`,
      )),
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
          ...(await extractTransactionsFromChunk(
            first,
            chunkIndex,
            totalChunks,
            depth + 1,
            `${chunkLabel}-a`,
          )),
          ...(await extractTransactionsFromChunk(
            second,
            chunkIndex,
            totalChunks,
            depth + 1,
            `${chunkLabel}-b`,
          )),
        ];
      }
      console.error('Failed to parse chunk response as JSON:', error);
      console.error('Raw chunk response:', responseText);
      return [];
    }
    parsed = { transactions: arraySlice };
  }

  if (isObjectWithTransactions(parsed)) {
    const coerced = (parsed.transactions as RawTransactionLike[]).map(coerceModelTransaction);
    console.log(`[AI] Extracted ${coerced.length} transactions from ${chunkLabel}`);
    return coerced;
  }

  if (Array.isArray(parsed)) {
    const coerced = (parsed as RawTransactionLike[]).map(coerceModelTransaction);
    console.log(`[AI] Extracted ${coerced.length} transactions from ${chunkLabel}`);
    return coerced;
  }

  console.warn('Unexpected chunk response shape:', parsed);
  return [];
}
