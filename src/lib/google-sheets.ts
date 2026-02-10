/**
 * Google Sheets service for appending bank transactions.
 * Organizes data by year: one sheet per year (e.g. "2025", "2026").
 */

import { google } from 'googleapis';
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

/**
 * credentialsJson: Service Account JSON key (full contents of .json file from Google Cloud Console).
 * API keys are NOT supported for Sheets write – use Service Account.
 * Share the spreadsheet with the service account email (e.g. xyz@project.iam.gserviceaccount.com).
 */
export async function appendTransactionsToSheet(
  spreadsheetId: string,
  credentialsJson: string,
  transactions: Transaction[]
): Promise<{ appended: number; errors: string[] }> {
  const errors: string[] = [];
  let appended = 0;

  console.log('[Sheets] appendTransactionsToSheet:', {
    spreadsheetIdLen: spreadsheetId?.length ?? 0,
    hasCredentials: !!credentialsJson,
    txCount: transactions.length,
  });

  if (!spreadsheetId || !credentialsJson) {
    console.log('[Sheets] appendTransactionsToSheet: preskakanje – prazan spreadsheetId ili GOOGLE_SHEETS_CREDENTIALS_JSON');
    return { appended: 0, errors: [] };
  }

  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(credentialsJson);
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('JSON mora sadržati client_email i private_key (Service Account)');
    }
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error('[Sheets] Neispravan GOOGLE_SHEETS_CREDENTIALS_JSON:', msg);
    return { appended: 0, errors: [`Credentials parse: ${msg}`] };
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const byYear = groupByYear(transactions);
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
