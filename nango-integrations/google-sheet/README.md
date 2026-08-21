# LinkFinder AI ↔ Google Sheets (Nango integration)

A single Nango action that keeps a Google Sheet enriching itself: point it at a
sheet + an input column, and it scans for rows that haven't been processed yet,
enriches each one via the [LinkFinder AI API](https://linkfinderai.com), and
writes the result (plus a status marker) back onto the row. Run it on a
schedule and new rows get picked up automatically — no manual re-triggering.

This is a code-first Nango integration (no `nango.yaml` needed — the action is
self-describing via `createAction`), matching the convention already used by
`../hubspot`. Deploy it with the [Nango CLI](https://www.npmjs.com/package/nango).

## What's included

| Action | Does |
|---|---|
| `google-sheet/actions/enrich-new-rows.ts` | Scans a sheet for rows with a value in `inputColumn` and no value yet in `statusColumn`, enriches up to `maxRowsPerRun` of them via LinkFinder AI, writes the result + status back. |

`google-sheet/linkfinder-client.ts` is a shared (non-action) helper — request/retry/poll
logic for LinkFinder AI's single-endpoint API. It's a per-provider copy of
`../hubspot/linkfinder-client.ts`, matching that file's existing convention
rather than introducing a new shared location this repo doesn't have yet.

## ⚠️ Before deploying — things I could not verify from this environment

- **Nango's proxy path for the `google-sheet` provider.** This action calls
  `nango.get`/`nango.post` with Google Sheets API v4 paths
  (`/v4/spreadsheets/{id}/values/{range}`, `.../values:batchUpdate`) assuming
  Nango passes them through verbatim against `https://sheets.googleapis.com`
  — the same pattern the HubSpot actions in this repo rely on for HubSpot's
  API. Run `npx nango dryrun enrich-new-rows <connection-id> {...}` against a
  real connection before trusting this in production.
- **Required OAuth scope.** Listed as `https://www.googleapis.com/auth/spreadsheets`
  (Sheets read/write) — confirm against Nango's `google-sheet` integration
  settings page and adjust if it differs.
- **Execution time.** `maxRowsPerRun` defaults to 15 and each lookup is capped
  at 12s, keeping a worst-case run under ~3 minutes, but Nango actions run
  under a bounded execution window whose exact limit wasn't confirmed here —
  check Nango's docs for your plan and tune `maxRowsPerRun` down if runs are
  timing out.

## Setup

### 1. Prerequisites

- A [Nango](https://app.nango.dev) account with a **Google Sheets**
  (`google-sheet`) integration enabled at
  app.nango.dev/dev/integrations/google-sheet/settings, with the Sheets
  read/write scope turned on.
- At least one Google Sheets connection created through that integration (via
  Nango Connect / the frontend SDK) — the connecting user needs edit access
  to the target spreadsheet.
- A LinkFinder AI API key (dashboard → Settings → API Key).
- The target sheet's row 1 must already have a header for whatever column you
  point `inputColumn` at (e.g. "LinkedIn URL"). `outputColumn` and
  `statusColumn` are created automatically if they don't exist yet.

### 2. Install the CLI and deploy

```bash
cd nango-integrations
npm install
cp .env.example .env   # fill in a freshly-rotated NANGO_SECRET_KEY — see the
                        # root-level note about the previously committed key

npx nango deploy dev   # or: npm run deploy:dev
```

### 3. Test locally before deploying

```bash
npx nango dryrun enrich-new-rows <connection-id> '{
  "spreadsheetId": "1AbC...xyz",
  "sheetName": "Sheet1",
  "inputColumn": "LinkedIn URL",
  "inputType": "linkedin_profile",
  "outputType": "email",
  "apiKey": "YOUR_LINKFINDER_API_KEY"
}'
```

### 4. Trigger the action

From your own backend, using the [Nango Node SDK](https://www.npmjs.com/package/@nangohq/node)
— this is what the scheduler worker (see the root-level deploy notes handed
off alongside this) calls on a timer per connected user:

```ts
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

const result = await nango.triggerAction('google-sheet', '<connection-id>', 'enrich-new-rows', {
    spreadsheetId: '1AbC...xyz',
    sheetName: 'Sheet1',
    inputColumn: 'LinkedIn URL',
    inputType: 'linkedin_profile',
    outputType: 'email',
    apiKey: process.env.LINKFINDER_API_KEY
});
```

## Notes / open items

- Only scalar-output combinations are supported (`linkedin_url`, `email`,
  `phone`, `website`, `linkedin_info`, `employee_count`) — this action writes
  one result into one cell per row, so array-shaped outputs
  (`company_domain` → `employees`, `linkedin_post` → `reactions`) aren't
  wired up here. A follow-up action that expands each source row into
  multiple output rows would be the natural way to add those later.
- Rows already marked in `statusColumn` are never reprocessed, even on
  error — clear that cell manually to retry a specific row.
