import { randomUUID } from 'node:crypto';
import type { Transaction } from '@/ai/flows/extract-transaction-details';
import { buildTransactionDedupMetadata } from './transactions';
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

export type PendingTransaction = {
  transaction: Transaction;
  key: string;
};

export async function saveEmailWithTransactions(
  metadata: EmailMetadata,
  transactions: Transaction[],
) {
  await ensureSchema();
  const sql = getSqlClient();

  const emailId = metadata.messageId?.trim() !== '' ? metadata.messageId! : randomUUID();
  const pending: PendingTransaction[] = [];

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
    const dedup = buildTransactionDedupMetadata(tx);
    const deliveryState = await sql`
      INSERT INTO transaction_delivery_state (
        transaction_key,
        signature,
        first_email_id,
        last_email_id
      )
      VALUES (
        ${dedup.key},
        ${dedup.signature},
        ${emailId},
        ${emailId}
      )
      ON CONFLICT (transaction_key)
      DO UPDATE SET
        last_email_id = EXCLUDED.last_email_id,
        updated_at = NOW()
      RETURNING delivered_at IS NULL AS needs_delivery
    ` as Array<{ needs_delivery: boolean }>;

    if (deliveryState[0]?.needs_delivery ?? true) {
      pending.push({ transaction: tx, key: dedup.key });
    }

    await sql`
      INSERT INTO transactions (
        id,
        email_id,
        naziv_sediste_primaoca,
        iznos_odobrenja,
        poziv_na_broj_odobrenja,
        referentna_oznaka,
        datum_knjizenja,
        transaction_key,
        transaction_signature
      )
      VALUES (
        ${randomUUID()},
        ${emailId},
        ${tx.nazivSedistePrimaoca},
        ${tx.iznosOdobrenja},
        ${tx.pozivNaBrojOdobrenja},
        ${tx.referentnaOznaka},
        ${tx.datumKnjizenja},
        ${dedup.key},
        ${dedup.signature}
      )
    `;
  }

  return {
    emailId,
    pendingTransactions: pending,
    totalTransactions: transactions.length,
  };
}

export async function markTransactionsDelivered(transactionKeys: string[], emailId: string) {
  if (!transactionKeys.length) {
    return;
  }
  await ensureSchema();
  const sql = getSqlClient();

  await sql`
    UPDATE transaction_delivery_state
    SET
      delivered_at = NOW(),
      last_email_id = ${emailId},
      updated_at = NOW()
    WHERE transaction_key = ANY(${transactionKeys})
  `;
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
