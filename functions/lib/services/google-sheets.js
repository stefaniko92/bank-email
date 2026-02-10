"use strict";
/**
 * Google Sheets service for appending bank transactions.
 * Organizes data by year: one sheet per year (e.g. "2025", "2024").
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendTransactionsToSheet = appendTransactionsToSheet;
const googleapis_1 = require("googleapis");
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
function getYearFromDate(dateStr) {
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
function groupByYear(transactions) {
    const byYear = new Map();
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
function transactionToRow(tx) {
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
async function appendTransactionsToSheet(spreadsheetId, apiKey, transactions) {
    const errors = [];
    let appended = 0;
    if (!spreadsheetId || !apiKey) {
        return { appended: 0, errors: ['GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_API_KEY must be set'] };
    }
    const auth = new googleapis_1.google.auth.GoogleAuth({ apiKey });
    const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
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
        }
        catch (err) {
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
                }
                catch (retryErr) {
                    errors.push(`Sheet "${year}": ${retryErr.message}`);
                }
            }
            else {
                errors.push(`Sheet "${year}": ${msg}`);
            }
        }
    }
    return { appended, errors };
}
/**
 * Ensure a sheet with the given name exists; create if not.
 */
async function ensureSheetExists(sheets, spreadsheetId, sheetName) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
    if (exists)
        return;
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
//# sourceMappingURL=google-sheets.js.map