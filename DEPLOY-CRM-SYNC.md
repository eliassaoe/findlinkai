# Deploying the CRM audit + HubSpot sync

Four pieces. Only two need credentials from you.

| Piece | Where it runs | Credentials it needs |
|---|---|---|
| `crm-sync.html` + `js/lf-crm-audit.js` | your static site | **none** — the audit is pure browser JS |
| `nango-integrations/` (the sync) | Nango cloud | `NANGO_SECRET_KEY_DEV` / `_PROD` (CLI auth only) |
| `workers/nango-connect/` | Cloudflare | `NANGO_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| HubSpot app | Nango dashboard | HubSpot **client ID + client secret** |

None of these go in a committed file. The repo is public — `.env` is gitignored,
and Cloudflare secrets live in Cloudflare.

---

## 1. HubSpot app (do this first — nothing works without it)

Nango needs a HubSpot OAuth app to connect on your customers' behalf.

1. https://developers.hubspot.com → create a developer account → **Create app**
2. Auth tab → scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`
3. Redirect URL: `https://api.nango.dev/oauth/callback`
4. Copy the **Client ID** and **Client Secret**
5. https://app.nango.dev → Integrations → **hubspot** → paste both

## 2. Deploy the sync

```bash
cd nango-integrations
npm install

cat > .env <<'ENV'
NANGO_SECRET_KEY_DEV=<your dev key from app.nango.dev/dev/environment-settings>
NANGO_SECRET_KEY_PROD=<your prod key>
ENV

npm run compile      # validates without any credentials
npm run deploy:dev   # then deploy:prod when you are happy
```

`.env` is gitignored. Note the `_DEV` / `_PROD` suffixes — the CLI ignores a
plain `NANGO_SECRET_KEY`.

## 3. Deploy the connect worker

```bash
cd workers/nango-connect
npx wrangler secret put NANGO_SECRET_KEY       # same key as above, no suffix
npx wrangler secret put SUPABASE_URL           # https://snxhsboboatjywgwdeds.supabase.co
npx wrangler secret put SUPABASE_SERVICE_KEY   # service_role, NOT the anon key
npx wrangler deploy
```

`wrangler secret put` prompts for the value and stores it encrypted at
Cloudflare. It is never written to disk and never enters git.

The page expects `https://nangoconnect.hamoureliasse.workers.dev`. Deploying
under another name means updating `NANGO_WORKER` in `crm-sync.html`.

## 4. Check the account schema

The worker reads the customer's LinkFinder API key from the accounts table and
writes it into the connection metadata — the sync bills enrichment to *their*
account, so without it every run fails on a missing key.

Confirm these match your real schema, in `workers/nango-connect/wrangler.toml`:

```
ACCOUNTS_TABLE = "linkfinderai_users"
TOKEN_COLUMN   = "token"
API_KEY_COLUMN = "api_key"      # <- verify this one
```

## Verifying it end to end

1. Open `/crm-sync` on a **paid** account → "Connect HubSpot"
2. Complete the HubSpot OAuth screen
3. app.nango.dev → Connections → the connection exists, and its **metadata**
   contains `apiKey`. If metadata is empty, `/finalise` failed — check the
   worker logs and `API_KEY_COLUMN`.
4. Nango → Syncs → `enrich-new-contacts` → **Start** (it is `autoStart: false`
   on purpose, so it never spends a customer's credits without a decision)
5. Add a HubSpot contact with a `linkedin_url` and no `linkfinder_ai_data`,
   then trigger a run. Within a run it should come back populated.

An unpaid account should get the plan-locked card and no connection should be
created — that check is server-side, so it holds even if someone calls the
worker directly.
