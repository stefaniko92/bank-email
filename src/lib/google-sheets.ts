/**
 * Google Sheets service for appending bank transactions.
 * Organizes data by year: one sheet per year (e.g. "2025", "2026").
 * Auth: Workload Identity Federation (OIDC) – GCP_* env vars + Vercel OIDC.
 */

import { google } from 'googleapis';
import { IdentityPoolClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';
import type { Transaction } from '@/ai/flows/extract-transaction-details';

const COLUMN_HEADERS = [
  'Naziv i sedište primaoca',
  'Iznos odobrenja',
  'Poziv na broj odobrenja',
  'Referentna oznaka',
  'Datum knjiženja'
];

function getYearFromDate(dateStr: string): string {
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) return match[3];
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[1];
  return new Date().getFullYear().toString();
}

function groupByYear(transactions: Transaction[]): Map<string, Transaction[]> {
  const byYear = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const year = getYearFromDate(tx.datumKnjizenja);
    const list = byYear.get(year) ?? [];
    list.push(tx);
    byYear.set(year, list);
  }
  return byYear;
}

function transactionToRow(tx: Transaction): string[] {
  return [
    tx.nazivSedistePrimaoca,
    tx.iznosOdobrenja,
    tx.pozivNaBrojOdobrenja,
    tx.referentnaOznaka,
    tx.datumKnjizenja
  ];
}

async function ensureSheetExists(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: sheetName,
            gridProperties: { rowCount: 1000, columnCount: 10 }
          }
        }
      }]
    }
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1:E1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [COLUMN_HEADERS] }
  });
}

function createAuthFromOidc(): { auth: IdentityPoolClient } | { error: string } | null {
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  if (!projectNumber || !serviceAccountEmail || !poolId || !providerId) {
    return null;
  }
  try {
    const auth = new IdentityPoolClient({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      subject_token_supplier: {
        getSubjectToken: async () => await getVercelOidcToken(),
      },
    });
    return { auth };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

/**
 * Append transactions to Google Sheet.
 * Auth: Workload Identity Federation (OIDC) – GCP_* env vars. Vidi https://vercel.com/docs/oidc/gcp
 */
export async function appendTransactionsToSheet(
  spreadsheetId: string,
  transactions: Transaction[]
): Promise<{ appended: number; errors: string[] }> {
  const errors: string[] = [];
  let appended = 0;

  console.log('[Sheets] appendTransactionsToSheet:', {
    spreadsheetIdLen: spreadsheetId?.length ?? 0,
    txCount: transactions.length,
  });

  if (!spreadsheetId || transactions.length === 0) {
    console.log('[Sheets] appendTransactionsToSheet: preskakanje – prazan spreadsheetId ili nema transakcija');
    return { appended: 0, errors: [] };
  }

  const oidcResult = createAuthFromOidc();
  if (!oidcResult) {
    console.log('[Sheets] Preskakanje – nema GCP OIDC env vars (GCP_PROJECT_NUMBER, GCP_SERVICE_ACCOUNT_EMAIL, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID)');
    return { appended: 0, errors: [] };
  }
  if ('error' in oidcResult) {
    console.error('[Sheets] OIDC auth greška:', oidcResult.error);
    return { appended: 0, errors: [`OIDC: ${oidcResult.error}`] };
  }

  const sheets = google.sheets({ version: 'v4', auth: oidcResult.auth });
  const byYear = groupByYear(transactions);
  console.log('[Sheets] Grupisano po godinama:', [...byYear.keys()]);

  for (const [year, txs] of byYear) {
    try {
      await ensureSheetExists(sheets, spreadsheetId, year);
      const values = txs.map(transactionToRow);
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${year}'!A1:E`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values }
      });
      const updated = response.data.updates?.updatedRows ?? values.length;
      appended += updated;
      console.log(`[Sheets] Appended ${updated} transaction(s) to sheet "${year}"`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const resp = err && typeof err === 'object' && 'response' in err ? (err as { response?: { status?: number; statusText?: string; data?: unknown } }).response : null;
      console.error(`[Sheets] append greška za sheet "${year}":`, msg);
      if (resp?.data) {
        try {
          const body = typeof resp.data === 'object' ? JSON.stringify(resp.data) : String(resp.data);
          console.error('[Sheets] API odgovor:', body);
        } catch (_) { /* ignore */ }
      }
      errors.push(`Sheet "${year}": ${msg}`);
    }
  }

  return { appended, errors };
}
