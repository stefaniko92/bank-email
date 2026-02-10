#!/usr/bin/env node
/**
 * Resets Postgres so you can retest webhook/Sheets storage.
 *
 * Usage:
 *   node scripts/clear-todays-data.js           # Remove today's emails + transactions
 *   node scripts/clear-todays-data.js --reset    # Clear ALL delivery state (transactions will re-forward)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../functions/.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const { neon } = require('@neondatabase/serverless');

const connString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connString) {
  console.error('No DATABASE_URL or POSTGRES_URL found in env');
  process.exit(1);
}

const sql = neon(connString);
const resetAll = process.argv.includes('--reset');

async function resetDeliveryState() {
  const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM transaction_delivery_state`;
  await sql`DELETE FROM transaction_delivery_state`;
  console.log(`Cleared ${count} delivery state row(s). Next forward will treat all transactions as new.`);
}

async function clearTodaysData() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`Removing data created on or after ${today}...`);

  const [{ count: emailCount }] = await sql`
    SELECT COUNT(*)::int as count FROM emails
    WHERE created_at >= ${today}::date
  `;

  if (emailCount === 0) {
    console.log('No emails from today found. Nothing to delete.');
    return;
  }

  await sql`
    DELETE FROM transaction_delivery_state
    WHERE transaction_key IN (
      SELECT transaction_key FROM transactions
      WHERE email_id IN (SELECT id FROM emails WHERE created_at >= ${today}::date)
      AND transaction_key IS NOT NULL
    )
  `;
  await sql`DELETE FROM transactions WHERE email_id IN (SELECT id FROM emails WHERE created_at >= ${today}::date)`;
  await sql`DELETE FROM emails WHERE created_at >= ${today}::date`;

  console.log(`Deleted ${emailCount} email(s) and related data from today.`);
}

async function main() {
  if (resetAll) {
    await resetDeliveryState();
  } else {
    await clearTodaysData();
  }
  console.log('Done. You can retest webhook/Sheets storage.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
