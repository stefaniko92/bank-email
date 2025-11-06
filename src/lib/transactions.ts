import { createHash } from 'node:crypto';
import type { Transaction } from '@/ai/flows/extract-transaction-details';

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeAmount(value: string): string {
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.');

  const numeric = Number.parseFloat(cleaned);
  if (!Number.isFinite(numeric)) {
    return 'na';
  }

  return numeric.toFixed(2);
}

function normalizeReference(value: string): string {
  const cleaned = collapseWhitespace(value);
  if (!cleaned || cleaned.toLowerCase() === 'n/a') {
    return 'na';
  }

  const dashed = cleaned.replace(/[^0-9-]/g, '');
  if (dashed.includes('-')) {
    return dashed;
  }

  const digits = cleaned.replace(/\D/g, '');
  return digits.length ? digits : cleaned.toLowerCase();
}

function normalizeName(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

function normalizeDate(value: string): string {
  const cleaned = collapseWhitespace(value);
  if (!cleaned) {
    return 'na';
  }

  const match = cleaned.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  }

  return cleaned;
}

export type TransactionDedupMetadata = {
  key: string;
  signature: string;
};

export function buildTransactionDedupMetadata(transaction: Transaction): TransactionDedupMetadata {
  const normalizedPoziv = normalizeReference(transaction.pozivNaBrojOdobrenja);
  const normalizedReference = normalizeReference(transaction.referentnaOznaka);
  const normalizedAmount = normalizeAmount(transaction.iznosOdobrenja);
  const normalizedName = normalizeName(transaction.nazivSedistePrimaoca);
  const normalizedDate = normalizeDate(transaction.datumKnjizenja);

  const signatureParts = [
    `poziv:${normalizedPoziv}`,
    `ref:${normalizedReference}`,
    `amount:${normalizedAmount}`,
    `date:${normalizedDate}`,
    `name:${normalizedName}`,
  ];

  const signature = signatureParts.join('|');
  const key = createHash('sha256').update(signature).digest('hex');

  return { key, signature };
}
