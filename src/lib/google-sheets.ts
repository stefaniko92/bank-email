/**
 * Google Sheets service for appending bank transactions.
 * Organizes data by year: one sheet per year (e.g. "2025", "2026").
 *
 * Auth modes (bez Service Account ključeva ako je org policy blokira):
 * 1. GOOGLE_SHEETS_CREDENTIALS_JSON – Service Account JSON key
 * 2. Workload Identity Federation (OIDC) – GCP_* env vars + Vercel OIDC, bez ključeva
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

function createAuthFromCredentials(credentialsJson: string): { auth: InstanceType<typeof google.auth.GoogleAuth> } | { error: string } {
  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(credentialsJson);
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('JSON mora sadržati client_email i private_key (Service Account)');
    }
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    return { error: msg };
  }
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });
  return { auth };
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
 * Auth: GOOGLE_SHEETS_CREDENTIALS_JSON (Service Account key) ili Workload Identity Federation (GCP_* env vars).
 * Ako org policy blokira ključeve, koristi OIDC – vidi https://vercel.com/docs/oidc/gcp
 */
export async function appendTransactionsToSheet(
  spreadsheetId: string,
  credentialsJsonOrTransactions: string | Transaction[],
  transactions?: Transaction[]
): Promise<{ appended: number; errors: string[] }> {
  const errors: string[] = [];
  let appended = 0;

  // Overload: (spreadsheetId, transactions) – auth iz env
  let txs: Transaction[];
  let credentialsJson: string | undefined;
  if (Array.isArray(credentialsJsonOrTransactions)) {
    txs = credentialsJsonOrTransactions;
    credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  } else {
    txs = transactions ?? [];
    credentialsJson = credentialsJsonOrTransactions;
  }

  console.log('[Sheets] appendTransactionsToSheet:', {
    spreadsheetIdLen: spreadsheetId?.length ?? 0,
    authMode: credentialsJson ? 'credentials' : process.env.GCP_PROJECT_NUMBER ? 'oidc' : 'none',
    txCount: txs.length,
  });

  if (!spreadsheetId || txs.length === 0) {
    console.log('[Sheets] appendTransactionsToSheet: preskakanje – prazan spreadsheetId ili nema transakcija');
    return { appended: 0, errors: [] };
  }

  let auth: InstanceType<typeof google.auth.GoogleAuth> | IdentityPoolClient;
  if (credentialsJson) {
    const result = createAuthFromCredentials(credentialsJson);
    if ('error' in result) {
      console.error('[Sheets] Neispravan GOOGLE_SHEETS_CREDENTIALS_JSON:', result.error);
      return { appended: 0, errors: [`Credentials parse: ${result.error}`] };
    }
    auth = result.auth;
  } else {
    const oidcResult = createAuthFromOidc();
    if (!oidcResult) {
      console.log('[Sheets] Preskakanje – nema GOOGLE_SHEETS_CREDENTIALS_JSON niti GCP OIDC env vars');
      return { appended: 0, errors: [] };
    }
    if ('error' in oidcResult) {
      console.error('[Sheets] OIDC auth greška:', oidcResult.error);
      return { appended: 0, errors: [`OIDC: ${oidcResult.error}`] };
    }
    auth = oidcResult.auth;
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const byYear = groupByYear(txs);
  console.log('[Sheets] Grupisano po godinama:', [...byYear.keys()]);

  for (const [year, txs] of byYear) {
    try {
      const values = txs.map(transactionToRow);
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${year}'!A:E`,
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
      if (resp) console.error('[Sheets] HTTP', resp.status, resp.statusText, resp.data ? '(body ima podatke)' : '');
      if (msg.includes('Unable to parse range') || msg.includes('range')) {
        try {
          await ensureSheetExists(sheets, spreadsheetId, year);
          const retryResponse = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `'${year}'!A:E`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: txs.map(transactionToRow) }
          });
          appended += retryResponse.data.updates?.updatedRows ?? txs.length;
        } catch (retryErr: unknown) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          errors.push(`Sheet "${year}": ${retryMsg}`);
        }
      } else {
        errors.push(`Sheet "${year}": ${msg}`);
      }
    }
  }

  return { appended, errors };
}
