import { neon } from '@neondatabase/serverless';

type SqlClient = ReturnType<typeof neon>;

let client: SqlClient | null = null;
let schemaInitialization: Promise<void> | null = null;

function getClient(): SqlClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  if (!client) {
    client = neon(connectionString);
  }

  return client;
}

async function runSchemaMigrations() {
  const sql = getClient();

  await sql`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      subject TEXT,
      sender TEXT,
      recipient TEXT,
      body TEXT,
      timestamp TIMESTAMPTZ,
      attachments JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails (message_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
      naziv_sediste_primaoca TEXT,
      iznos_odobrenja TEXT,
      poziv_na_broj_odobrenja TEXT,
      referentna_oznaka TEXT,
      datum_knjizenja TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_transactions_email_id ON transactions (email_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS webhook_config (
      id TEXT PRIMARY KEY,
      url TEXT,
      enabled BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export function ensureSchema() {
  if (!schemaInitialization) {
    schemaInitialization = runSchemaMigrations();
  }

  return schemaInitialization;
}
export function getSqlClient() {
  return getClient();
}
