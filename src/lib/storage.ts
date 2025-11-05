import { randomUUID } from 'node:crypto';
import type { Transaction } from '@/ai/flows/extract-transaction-details';
import { ensureSchema, getSqlClient } from './db';

type EmailMetadata = {
  subject: string;
  from: string;
  to: string;
  body?: string;
  timestamp?: string;
  messageId?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
};

export async function saveEmailWithTransactions(
  metadata: EmailMetadata,
  transactions: Transaction[],
) {
  await ensureSchema();
  const sql = getSqlClient();

  const emailId = metadata.messageId?.trim() !== '' ? metadata.messageId! : randomUUID();

  await sql`
    INSERT INTO emails (id, message_id, subject, sender, recipient, body, timestamp, attachments)
    VALUES (
      ${emailId},
      ${metadata.messageId ?? null},
      ${metadata.subject ?? null},
      ${metadata.from ?? null},
      ${metadata.to ?? null},
      ${metadata.body ?? null},
      ${metadata.timestamp ? new Date(metadata.timestamp) : null},
      ${JSON.stringify(metadata.attachments ?? [])}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      subject = EXCLUDED.subject,
      sender = EXCLUDED.sender,
      recipient = EXCLUDED.recipient,
      body = EXCLUDED.body,
      timestamp = EXCLUDED.timestamp,
      attachments = EXCLUDED.attachments,
      created_at = NOW()
  `;

  await sql`
    DELETE FROM transactions WHERE email_id = ${emailId}
  `;

  for (const tx of transactions) {
    await sql`
      INSERT INTO transactions (
        id,
        email_id,
        naziv_sediste_primaoca,
        iznos_odobrenja,
        poziv_na_broj_odobrenja,
        referentna_oznaka,
        datum_knjizenja
      )
      VALUES (
        ${randomUUID()},
        ${emailId},
        ${tx.nazivSedistePrimaoca},
        ${tx.iznosOdobrenja},
        ${tx.pozivNaBrojOdobrenja},
        ${tx.referentnaOznaka},
        ${tx.datumKnjizenja}
      )
    `;
  }
}

export async function getWebhookConfig() {
  await ensureSchema();
  const sql = getSqlClient();
  const rows = await sql`
    SELECT id, url, enabled, updated_at
    FROM webhook_config
    WHERE id = 'default'
    LIMIT 1
  ` as Array<{ id: string; url: string | null; enabled: boolean | null; updated_at: Date | null }>;

  return rows[0] ?? null;
}

export async function upsertWebhookConfig(config: { url?: string; enabled?: boolean }) {
  await ensureSchema();
  const sql = getSqlClient();
  const updatedAt = new Date();

  await sql`
    INSERT INTO webhook_config (id, url, enabled, updated_at)
    VALUES ('default', ${config.url ?? null}, ${config.enabled ?? false}, ${updatedAt})
    ON CONFLICT (id)
    DO UPDATE SET
      url = EXCLUDED.url,
      enabled = EXCLUDED.enabled,
      updated_at = EXCLUDED.updated_at
  `;

  return {
    id: 'default',
    url: config.url ?? null,
    enabled: config.enabled ?? false,
    updated_at: updatedAt,
  };
}
