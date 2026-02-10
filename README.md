# Bank Email Processor

This repository hosts a Next.js application that ingests bank-statement emails, extracts transactions from PDF attachments, stores the results in Postgres, and forwards them to a configurable webhook. The app is deployed on Vercel (frontend + API routes) and uses Neon Postgres as its persistence layer. PDF->transaction extraction is powered by OpenAI by default, with optional Anthropic support.

## Architecture Overview

| Concern             | Technology / Provider                     |
|---------------------|-------------------------------------------|
| Hosting (prod)      | Vercel (Next.js 15 serverless functions)  |
| Database            | Neon Postgres (`webhook_config`, `emails`, `transactions`) |
| AI provider         | OpenAI `gpt-4o-mini` (default) or Anthropic via `AI_PROVIDER` env |
| Email ingest (prod) | Mailgun webhook (still handled by the Firebase Function until migrated) |
| Webhook forwarding  | Configurable target URL stored in Postgres |

## Key Features

- Receive Mailgun-style webhooks with email metadata and PDF attachments.
- Extract transactions from PDF statements using LLMs (OpenAI by default, Anthropic optional).
- Persist email metadata and extracted transactions in Neon Postgres.
- Forward the structured transactions to an external webhook with retry/backoff and detailed logging.
- Provide a lightweight UI for manual PDF testing, settings, and log inspection.

## Deployment Summary

- **Prod host:** Vercel project (Promote the latest preview → production).
- **Database:** Neon Postgres (connection string provided in `DATABASE_URL`).
- **AI model:** `gpt-4o-mini` via OpenAI. Override with `OPENAI_MODEL`, or set `AI_PROVIDER=anthropic` + `ANTHROPIC_MODEL`.
- **Secret management:** Vercel Environment Variables (Production / Preview / Development).

### Required Vercel Environment Variables

| Variable             | Required? | Notes |
|----------------------|-----------|-------|
| `DATABASE_URL`       | ✅         | Neon Postgres pooled connection string. |
| `OPENAI_API_KEY`     | ✅ (default setup) | Required when `AI_PROVIDER` is `openai` (default). |
| `AI_PROVIDER`        | optional  | `openai` (default) or `anthropic`. |
| `OPENAI_MODEL`       | optional  | Defaults to `gpt-4o-mini`. |
| `ANTHROPIC_API_KEY`  | when needed | Only if `AI_PROVIDER=anthropic`. |
| `ANTHROPIC_MODEL`    | optional  | Defaults to `claude-3-5-sonnet-latest`. |
| `AWS_ACCESS_KEY_ID`  | optional  | Required to send SES failure notifications. |
| `AWS_SECRET_ACCESS_KEY` | optional | Pair with `AWS_ACCESS_KEY_ID`. |
| `AWS_REGION`         | optional  | SES region (e.g., `eu-central-1`). |
| `SES_FROM_EMAIL`     | optional  | Verified SES sender address. |
| `SES_TO_EMAIL`       | optional  | Destination for failure alerts. |

For Mailgun → Vercel migration, configure Mailgun to hit `https://<project>.vercel.app/api/mailgun`.

### Deploying to Production

1. Push changes to the tracked branch (e.g., `develop`).
2. Vercel builds a preview deployment automatically; verify logs/API.
3. In Vercel → Deployments, click **Promote to Production** on the verified preview.
4. Confirm the production deployment shows `/api/mailgun` route, then repoint Mailgun if needed.
5. Validate Postgres data (`emails`, `transactions`, `webhook_config`) and webhook deliveries.

## Local Development

### Prerequisites
- Node.js 18+
- Neon Postgres database (copy/paste the `DATABASE_URL` from Neon dashboard).
- OpenAI API key (or Anthropic key if you prefer their models).

### Install & Run
```bash
npm install
npm run dev   # launches Next.js on http://localhost:9002
```

Set up a local `.env.local` with at least:
```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
# optional overrides
AI_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
```

### Manual Testing
- Use the home page to upload PDFs and verify extraction.
- Configure webhook settings via `/settings`. These settings write directly into Neon (`webhook_config` table).
- Watch the terminal / Vercel logs for lines beginning with `[AI]` (OpenAI/Anthropic calls) and `Webhook call to ...` for outbound delivery status.

## Data Model (Neon Postgres)

- `emails` – stores sanitized metadata about each processed email (subject, from/to, attachments summary, timestamps).
- `transactions` – one row per extracted transaction linked to `emails.id`.
- `webhook_config` – single row (`id='default'`) capturing `url`, `enabled`, and `updated_at`.

To seed/update the webhook config manually:
```sql
INSERT INTO webhook_config (id, url, enabled, updated_at)
VALUES ('default', 'https://your-target-url', TRUE, NOW())
ON CONFLICT (id) DO UPDATE
SET url = EXCLUDED.url,
    enabled = EXCLUDED.enabled,
    updated_at = EXCLUDED.updated_at;
```

## Logging

- AI calls log provider, model, prompt length, and latency (`[AI]` prefix).
- Webhook forwarding logs each attempt, including HTTP status and response body on failure.
- Persistent data writes log IDs and timestamps.
You can view logs via Vercel → Functions → `/api/mailgun`, or in local dev console.

## Google Sheets Integration (Firebase Functions)

When processing PDFs via the Firebase `emailReceive` function, extracted transactions can be appended to a Google Sheet. Transactions are organized **one sheet per year** (e.g. "2025", "2024").

### Setup

1. Create a Google Sheet and copy the **Spreadsheet ID** from the URL:  
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
2. Enable the **Google Sheets API** in [Google Cloud Console](https://console.cloud.google.com/apis/library/sheets.googleapis.com) (same project as your Firebase).
3. Create a **Service Account** (API keys do NOT work for write). Download the JSON key file.
4. Share the spreadsheet with the service account email (e.g. `xyz@project.iam.gserviceaccount.com`).
5. Set in `functions/.env` or Vercel/Firebase environment:
   ```env
   GOOGLE_SHEETS_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"...",...}
   GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
   ```
   Paste the **entire JSON** from the service account key file as the value of `GOOGLE_SHEETS_CREDENTIALS_JSON`.
6. For production: set these in [Vercel](https://vercel.com) → Project → Environment Variables (promote to Production!) or [Firebase Console](https://console.firebase.google.com) → Functions → Environment variables.

Sheets for each year are created automatically on first append. Column headers: Naziv i sedište primaoca, Iznos odobrenja, Poziv na broj odobrenja, Referentna oznaka, Datum knjiženja.

## Troubleshooting Checklist

- **AI failures:** Check `[AI] ... request failed` logs; verify API keys and model names.
- **Webhook delivery issues:** Ensure `webhook_config` has `enabled=true` and the correct URL; inspect the retry logs for HTTP errors.
- **Database connectivity:** Confirm `DATABASE_URL` is present and Neon credentials are valid; check Neon dashboard for connection errors.
- **401/404 from Mailgun:** Verify Mailgun route points to the correct Vercel URL and that the deployment is live.

Questions or deployment notes? Document them here so production parity stays clear.
