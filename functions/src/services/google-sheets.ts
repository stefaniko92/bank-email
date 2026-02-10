/**
 * Google Sheets service for appending bank transactions.
 * Organizes data by year: one sheet per year (e.g. "2025", "2024").
 */

import { google } from 'googleapis';

export type TransactionRow = {
  nazivSedistePrimaoca: string;
  iznosOdobrenja: string;
  pozivNaBrojOdobrenja: string;
  referentnaOznaka: string;
  datumKnjizenja: string;
};

const COLUMN_HEADERS = [
  'Naziv i sedište primaoca',
  'Iznos odobrenja',
  'Poziv na broj odobrenja',
  'Referentna oznaka',
  'Datum knjiženja'
];

/**
 * Parse DD.MM.YYYY to extract year.
 */
function getYearFromDate(dateStr: string): string {
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    return match[3]; // YYYY
  }
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }
  return new Date().getFullYear().toString();
}

/**
 * Group transactions by year.
 */
function groupByYear(transactions: TransactionRow[]): Map<string, TransactionRow[]> {
  const byYear = new Map<string, TransactionRow[]>();
  for (const tx of transactions) {
    const year = getYearFromDate(tx.datumKnjizenja);
    const list = byYear.get(year) ?? [];
    list.push(tx);
    byYear.set(year, list);
  }
  return byYear;
}

/**
 * Convert transaction to sheet row (matches Excel column order).
 */
function transactionToRow(tx: TransactionRow): string[] {
  return [
    tx.nazivSedistePrimaoca,
    tx.iznosOdobrenja,
    tx.pozivNaBrojOdobrenja,
    tx.referentnaOznaka,
    tx.datumKnjizenja
  ];
}

/**
 * Append transactions to Google Sheet, one sheet per year.
 * Creates a sheet for the year if it doesn't exist.
 */
export async function appendTransactionsToSheet(
  spreadsheetId: string,
  apiKey: string,
  transactions: TransactionRow[]
): Promise<{ appended: number; errors: string[] }> {
  const errors: string[] = [];
  let appended = 0;

  if (!spreadsheetId || !apiKey) {
    return { appended: 0, errors: ['GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_API_KEY must be set'] };
  }

  const auth = new google.auth.GoogleAuth({ apiKey });

  const sheets = google.sheets({ version: 'v4', auth });
  const byYear = groupByYear(transactions);

  for (const [year, txs] of byYear) {
    try {
      const sheetName = year;
      const values = txs.map(transactionToRow);

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:E`, // Quote sheet name for numeric names like "2025"
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values }
      });

      const updated = response.data.updates?.updatedRows ?? values.length;
      appended += updated;
      console.log(`📊 Appended ${updated} transaction(s) to sheet "${year}"`);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes('Unable to parse range') || msg.includes('range')) {
        // Sheet may not exist; try to create it
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
        } catch (retryErr: any) {
          errors.push(`Sheet "${year}": ${retryErr.message}`);
        }
      } else {
        errors.push(`Sheet "${year}": ${msg}`);
      }
    }
  }

  return { appended, errors };
}

/**
 * Ensure a sheet with the given name exists; create if not.
 */
async function ensureSheetExists(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === sheetName
  );
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

  // Add header row (quote sheet name for numeric names like "2025")
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1:E1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [COLUMN_HEADERS] }
  });
}
