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

  const truncatedText = pdfText.slice(0, 60_000);

  const systemPrompt = `
You are a financial data extraction assistant.
Return ONLY a valid JSON array. Each transaction must include these fields exactly:
- "nazivSedistePrimaoca": recipient name or description (string)
- "iznosOdobrenja": transaction amount, include sign for debit/credit (string)
- "pozivNaBrojOdobrenja": reference number or identifier (string)
- "referentnaOznaka": reference mark or type (string)
- "datumKnjizenja": posting date (string)

Rules:
1. Respond with JSON array and nothing else.
2. Use "N/A" when information is missing.
3. Combine multi-line rows into single transactions.
4. Capture EVERY transaction present in the statement.
  `.trim();

  const userPrompt = `
Bank statement text:
<<<
${truncatedText}
>>>

Produce the JSON array now.
  `.trim();

  const responseText = await generateText({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 2048,
    temperature: 0.1,
  });

  const cleaned = cleanJsonResponse(responseText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', error);
    console.error('Raw response:', responseText);
    throw new Error('AI response was not valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response is not a JSON array');
  }

const transactions = parsed.map((transaction, index) => {
  const result = TransactionSchema.safeParse(transaction);
  if (!result.success) {
    throw new Error(`Invalid transaction at index ${index}: ${result.error.message}`);
  }
  return sanitizeTransaction(result.data);
});

return transactions;
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
