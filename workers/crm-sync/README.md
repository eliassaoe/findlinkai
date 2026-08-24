# CRM Sync worker

Deployed Cloudflare Worker name: **`nango-connect-session`**. Connects a
HubSpot account through Nango, then on a weekly cron fills in contacts that
are missing an email, LinkedIn URL, or phone — writing only into empty
fields, never over something a human typed.

## This file was recovered from production, not written from scratch

The worker was running in Cloudflare and existed in no repository. It was
pulled back out of the deployed script on 24 Aug 2026 and committed here so
it can be reviewed and changed like everything else.

That is the second time this project has run production code that is not in
this repo — `/app` was emitting `checkout_overlay_opened` and
`checkout_page_load_timeout` that appear in no source file either. Treat
"deployed but unversioned" as the default suspicion when a feature behaves
in a way the repo cannot explain.

**Still missing: the frontend half.** The live `/crm-sync` page emits
`crm_audit_started`, `crm_audit_completed`, `crm_audit_cta_shown`,
`crm_audit_cta_clicked`, `crm_audit_sync_connect_started`,
`crm_audit_sync_connect_blocked`, `crm_audit_sync_gate_mismatch`,
`crm_audit_clean_started` and `crm_audit_crm_clean_triggered`. None of those
strings exist anywhere in this repository — `crm-sync.html` here is an older
VIP pitch page that only fires `crm_sync_page_viewed`. Deploying the repo
copy over the live one would delete the audit flow. Recover the deployed
page before touching it.

## The bug that made the feature do nothing

`isSubscriber(env, token)` takes two arguments. Two of its three call sites
passed one:

```js
await isSubscriber(linkfinderToken)   // syncOneConnection
await isSubscriber(token)             // handlePushContacts
```

That degrades silently instead of throwing. `env` becomes the token string,
so `env.SUBSCRIBER_SERVICE` is undefined and it falls back to global fetch —
no error. But `token` is then `undefined`, and `JSON.stringify` drops
undefined values, so the request body posted to upgrade-intent was:

```json
{"trigger":"crm_sync_gate"}
```

No token at all. upgrade-intent answers "not a subscriber", the gate fails
closed, and:

- **every weekly sync returned `notSubscriber: true` and processed zero contacts**
- **every "Sync now" did the same**
- **every `/push-contacts` returned 403**

for every user, always, with nothing logged as an error. `handleConnectSession`
called it correctly, which is why connecting a HubSpot account worked while
everything after it quietly did nothing.

This is the likely source of the 11 `crm_audit_sync_gate_mismatch` events on
23 Aug: the frontend believed the account was subscribed, the worker's gate
disagreed. Fixed in this commit — all three call sites now pass `env`.

## Deploy

```bash
cd workers/crm-sync
npx wrangler secret put NANGO_SECRET_KEY
npx wrangler deploy
```

Before the first deploy, put the real KV namespace id into `wrangler.toml`.
The `ENRICH_SERVICE` service binding is not optional — without it every
lookup fails with Cloudflare error 1042.

## Endpoints

| path | does |
|---|---|
| `/` or `/connect-session` | starts a Nango Connect session (gated on paid plan) |
| `/finalize-connection` | stores the connectionId the Connect UI returns |
| `/status` | connection state, last sync result, settings |
| `/save-settings` | which fields to fill and into which HubSpot properties |
| `/list-properties` | the account's real contact properties, for the settings dropdown |
| `/push-contacts` | push enrichment results straight into HubSpot (max 500) |
| `/sync-now`, `/test-sync` | run one connection's sync immediately |
| `/disconnect` | forget the connection |
| `/nango-webhook` | defensive fallback for connection creation |

## Worth a second look

- `HARD_MAX_PER_RUN` is **1000**, but the header comment claims contacts per
  run are "clamped 1-100 server-side". The code is the truth. A user who sets
  1000 gets a weekly run that can spend 1000-2000 credits. Decide which number
  is intended and make the two agree.
- The weekly cron walks every KV key on one invocation with no concurrency
  limit and no time budget. Fine at today's connection count, not fine at a
  few hundred.
