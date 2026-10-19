# Support agent — the chat widget's backend

The chat bubble on `/app`, `/account`, `/history` and the API pages
(`js/support-widget.js`) talks to this Supabase edge function. It replaced
`support-worker/` (a Cloudflare Worker that could only answer from a prompt and
a few public pages). This one works on the visitor's own account.

**Live:** `https://snxhsboboatjywgwdeds.supabase.co/functions/v1/support-agent`
(deployed 2026-10-19, `verify_jwt = false` — it does its own auth, below).

## What it can do

| Ask | What happens |
| --- | --- |
| "How many credits do I have? Am I subscribed?" | `get_account`: credits, plan (Starter / Professional / Scale, monthly or annual, pack buyer, LTD, free), 30-day usage by type |
| "Did you find Jane Doe's email last week?" | `search_history` over `enrichment_history` |
| "Where's the list I enriched on Tuesday?" | `list_csv_files` + `preview_csv_results` over `csv_enrichment_batches` |
| "Send me that file" / "export my lookups as CSV" | `offer_csv_download` → a Download button → `/download` |
| Drops a CSV with 📎 | `/upload` stores it; `analyze_uploaded_file` says which enrichments it can feed, which columns, how many rows, the max credit cost |
| "Find their emails" | `propose_enrichment` → a **Start** card → the user's click calls `/start`, which queues a batch for `csv-batch-runner` |
| Big volume, Enterprise, DFY, a demo | `share_booking_link` → Calendly card |
| Refund, bug, dispute | `escalate_to_human` → PostHog `support_chat_escalated` + email/Calendly card |
| Prices, API, guides | `fetch_page` on the live site — prices are never hardcoded, they changed in Sep 2026 |

## The rules that make it safe

- **The account is the token on the request, never something the model picks.**
  The widget sends the same `?token=` / `localStorage.linkFinderToken` value
  every app page uses. Every query is filtered by it server-side, and the
  account tools are not offered at all without a valid one.
- **The model cannot spend credits.** It can only *propose* an enrichment. The
  run starts when the user presses Start on the card, which calls `/start`
  directly — not through the model. `/start` re-validates the file, the
  mapping and the credit balance, and is idempotent per upload (a double click
  returns the same batch).
- **Same paywall as the app.** Full downloads and 10-row previews for
  subscribers (`subscription_id IS NOT NULL`); everyone else gets the 5-row
  preview `EXPORT_PREVIEW_ROW_LIMIT` gives them in the app.
- **`linkfinderai_users` is read with explicit columns.** The table also holds
  `mdp`; never change that select to `*`.
- Tool output (file cells, history results) is the user's data; the prompt
  tells the model never to follow instructions found in it.

## How a chat CSV becomes a real run

1. `/upload` parses the file with `parseCsv()` — a port of `parseCSV()` in
   `app.html` — and stores the grid in `support_chat_uploads` (RLS on, no
   policies: service key only; rows older than 2 days are deleted nightly by
   the `support-chat-uploads-cleanup` cron job).
2. `planEnrichment()` builds the column mapping the app would build
   (`LF_HEADER_SYNONYMS`), plus one improvement: for URL/email inputs the
   *values* must agree with the header, and a column is found by its values
   when no header names it — so a "LinkedIn URL" column of `/company/` pages is
   not read as profiles.
3. `/start` inserts exactly the `csv_enrichment_batches` row `csvBatchCreate` +
   `csvBatchStoreInput` write, already `queued`. `csv-batch-runner` picks it up
   within 30 s and runs it through the same `buildCsvData()`, so the file comes
   out identical to one uploaded in `/app`, and appears in History.

`tests/support-agent.test.mjs` pins the copied tables (`creditCosts`,
`dataConfigurations`, `LF_HEADER_SYNONYMS`) against `app.html` and covers
the mapping, planning and CSV helpers:

    node --test tests/support-agent.test.mjs

## Configuration

| Secret / setting | Default |
| --- | --- |
| `SUPPORT_OPENROUTER_KEY` | falls back to the vault's `openrouter_api_key` (the one the AI keyword outreach uses — set this to bill support separately) |
| `SUPPORT_MODEL` | `anthropic/claude-haiku-4.5` — any OpenRouter slug; a stronger model follows the CSV flow more reliably |
| `SUPPORT_TO_EMAIL` | `support@linkfinderai.com` |

## Deploying

It imports `../csv-batch-runner/shared-export.js`, so deploy with the
functions folder as the root: entrypoint `support-agent/index.ts`, files
`support-agent/index.ts`, `support-agent/agent-core.js`,
`csv-batch-runner/shared-export.js` (or `supabase functions deploy
support-agent --no-verify-jwt` from the repo).

PostHog events: `support_agent_reply` (tools used), `support_agent_file_uploaded`,
`support_agent_enrichment_started`, `support_agent_download`,
`support_chat_escalated`; in the browser `chat_enrichment_proposed`,
`chat_enrichment_started`, `chat_csv_downloaded`, `chat_booking_link_shown`.
