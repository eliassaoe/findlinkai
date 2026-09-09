# Next-step routing — CSV, Google Sheets, API, CRM offered inside the result

**Date:** 2026-09-09 · **Sources:** PostHog 263837 (90–120d), `app.html`, `js/lf-gate.js`
**Test:** `tests/next-step-routing.test.mjs`

## Why

Who pays, by what they did first (last 120 days, 24 payers, so direction not precision):

| Behaviour | Users | Paid | Rate |
| --- | --- | --- | --- |
| Enriched, never touched CSV or API | 1,420 | 2 | 0.14% |
| API key only | 178 | 5 | 2.8% |
| CSV only | 252 | 11 | 4.4% |
| CSV + API | 26 | 5 | 19.2% |

22 of 24 payers did CSV or API. Only 17% of people who enriched ever uploaded a
CSV, 12% ever copied an API key, 1.6% did both. Reach is the problem, not the
feature.

Every prompt that tried to fix reach by interrupting people converted at ~1%:

| Prompt | Shown | Clicked |
| --- | --- | --- |
| `first_result_offer` (tool pages) | 3,283 | 31 (0.9%) |
| `activation_nudge` | 280 | 4 (1.4%) |
| `milestone_upgrade_banner` | 308 | 3 (1.0%) |
| `bulk_tutorial_popup` | 170 | 3 (1.8%) |
| `bulk_nudge` | 102 | 4 (3.9%) |
| `onboarding_popup` (credit tasks) | 154 | 145 dismissed |

Every surface that appears **after a result the person earned** converts at
18–34% (`bulk_results_gated` 17.8%, `credits_wall_rescue` 17.9%,
`free_limit_modal` 33.7%). The rule that falls out: **earn, then show. Never
interrupt.**

## What shipped

### 1. The next-step panel (`renderNextStepPanel`, `app.html`)

Rendered inside `#resultsSection` after every successful result, single or
bulk. It is part of the result, not a prompt over it.

**Single lookup.** The row they just got, drawn as line 1 of a spreadsheet
(same columns and cells the bulk CSV export would write — it reuses
`csvEnrichColumns()` / `csvEnrichCells()`), with three empty rows under it and
four ways to fill them:

| Route | What it does | Event |
| --- | --- | --- |
| Upload a CSV (primary) | `jumpToBulkUpload('next_step_single')` | `next_step_clicked` route=csv, plus the existing `activation_nudge_clicked` |
| Do it in Google Sheets | Opens the Marketplace add-on listing | `next_step_clicked` route=sheets, `sheets_addon_clicked` source=next_step_single |
| Run it from code | Toggles a runnable `curl` for **this exact lookup**, with the user's **real** API key (`lfApiKey()`, same derivation as `api-access.html`) and a Copy button | `next_step_clicked` route=api; copy fires `api_key_copied` source=next_step_single **and** `api_snippet_copied` |
| CRM | Connected + contact-shaped result: **Send to HubSpot**. Not connected: **Sync to my CRM** → `/crm-sync` | `next_step_clicked` route=crm_send / crm, plus existing `sent_to_hubspot` / `crm_sync_nudge_clicked` |

Footer: **Download this row as CSV** (`single_result_csv_exported`) and the
2-minute bulk walkthrough video that used to be the second-visit popup.

**Bulk run.** "N of M rows enriched. Next time, skip the upload." with Sheets,
the API call for this run, and CRM (send all / connect). Rendered only when
credits did **not** run out — the gated table and upgrade banner are the
best-converting surface in the product and nothing competes with them.

Shown event: `next_step_panel_shown` {context, input_type, output_type,
hubspot_connected, rows}.

### 2. First-visit route chooser (`maybeShowRouteChooser`, `pickRoute`)

One inline question above the quick-start cards, first visit only: *Where is
the data you want to enrich?* — CSV / Google Sheets / my own code or n8n / my
CRM, or "I just need one lookup for now". Picking lands them on the thing
(bulk mode + selector, the add-on, `/api-access`, `/crm-sync`). It never comes
back once answered (`lf_route_picked`), once a CSV was ever uploaded, or once
anything has been enriched. Events: `onboarding_route_shown`,
`onboarding_route_picked` {route, source: chooser | intent}.

`?intent=csv|sheets|api|crm` on `/app` — or `localStorage.lf_intent`, which
`/sign-up` and `/log-in` set from the same parameter — skips the question and
runs `pickRoute` directly.

### 3. Tool-page first-result offer (`js/lf-gate.js`)

The 0.9% "Want 50 more lookups?" card is replaced by the same spreadsheet
shape: the visitor's input and result as row 1, empty rows under it, **Enrich
my list free →** to `/sign-up?intent=csv`, and text routes to Sheets, API and
HubSpot with their own intent. The five pages that render their own
`.post-result-cta` have it hidden while the offer is on screen — one ask per
answer. Events keep their names, with `variant: 'spreadsheet'` and `route` on
the click.

### 4. Retired

| Surface | Why |
| --- | --- |
| First-enrichment top bar ("Upload a CSV / See plans") | 1% CTR; the panel says it inside the result, every time |
| Third-enrichment "See what a plan gets you" bar | 1.4% |
| `bulk_nudge` top bar on 2nd success | 3.9%; same message now lives in the panel |
| Second-visit bulk tutorial popup | 1.8%; the video is a link in the panel |
| Credit-tasks popup auto-opening on the 2nd enrichment | 94% dismissed; still one click away (the fab) and `?action=tasks` |
| `showAutomationNudge` | had been commented out at its only call site |

Kept untouched: the founder-call corner card, the time-based return-visit
banner, the NPS at 10, the VIP banner at 25, the gated bulk table, the credits
rescue, the free-limit modal.

## What to watch

The activation metric worth tracking weekly is **uploaded a CSV or copied an
API key** (either fires `csv_uploaded` / `api_key_copied`). Those users pay at
4–5%; everyone else at 0.14%.

For this change specifically:

- `next_step_clicked` / `next_step_panel_shown`, by route and context. The
  old bars were ~1%; anything under 5% here means the panel is being ignored
  too and the answer is not another surface.
- `first_result_offer_clicked` / `_shown` with `variant: 'spreadsheet'` against
  the 0.9% baseline.
- `onboarding_route_picked` split by route — this is the first direct read on
  what people arrive wanting.
- `api_key_copied` now has three sources; keep `source` in any funnel that
  reads it. `api_first_call_succeeded` still does not exist (see
  `INTEGRATION-STRATEGY.md`); it is what would tell whether a copied snippet
  ever ran.

## Facts that are easy to get wrong

- The panel's API snippet contains the user's **real key**. It is derived
  client-side from the session token exactly as `api-access.html` does; if
  that derivation ever changes, `lfApiKey()` must change with it (there is a
  test).
- The Sheets route always points at the published Marketplace listing, never
  at `integrations/google-sheets/` (unpublished). See `CLAUDE.md`.
- CRM route copy never mentions PAYG. CRM users go to subscriptions.
- The panel is not rendered on a "Not found" result, and not after a bulk run
  that hit the credit wall.
