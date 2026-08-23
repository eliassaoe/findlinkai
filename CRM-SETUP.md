# CRM cleanup — how it actually runs

There is nothing to deploy. The whole HubSpot path runs on **one Cloudflare
Worker, `nango-connect-session`, live since 17 Aug**. This file exists because
that was not obvious from the repo, and a previous attempt rebuilt a second,
parallel stack on top of it. That stack has been removed.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| Audit | `js/lf-crm-audit.js`, in the browser | Parses the CSV, counts gaps, prices them. No upload, no connection, no plan needed. |
| Cleanup + schedule | Worker `nango-connect-session` | OAuth via Nango, HubSpot REST via Nango's `/proxy`, enrichment via a service binding, weekly cron. |
| UI | `crm-sync.html` (in-app), `crm-audit.html` (public, audit only) | |

`account.html`'s HubSpot card reads the same worker's `/status`.

## Why not Nango's own Syncs runtime

Nango's hosted Functions/Syncs runtime **pauses every two weeks on the free
tier**. The worker deliberately uses Nango only for OAuth token storage and as
a HubSpot proxy, and runs everything else on its own cron. Anything built as a
`nango-integrations/**/syncs/*.ts` sync inherits that pause. Don't reintroduce
one.

`nango-integrations/` still holds the three HubSpot *actions* from 13 Aug.
Those are unrelated to this path and are left as they were.

## Route contract (what `crm-sync.html` calls)

All `POST`, all take `{ token }`, all require an `Origin` of
`linkfinderai.com` or `www.linkfinderai.com`.

| Route | Returns | Notes |
|---|---|---|
| `/` or `/connect-session` | `{ connectSession, expiresAt }` | **403** if not on a paid plan |
| `/finalize-connection` | `{ ok }` | needs `connectionId` from the Connect UI's `connect` event — without this call nothing is stored and the connection is invisible to the worker |
| `/status` | `{ connected, connectedAt, lastSyncedAt, lastSyncResult, settings }` | no plan check, no `paid` field — see below |
| `/save-settings` | `{ ok, settings }` | `404` if not connected |
| `/list-properties` | `{ ok, properties }` | real HubSpot contact properties, for a property picker |
| `/sync-now` (alias `/test-sync`) | the whole pass, **synchronously** | there is no job to poll |
| `/push-contacts` | `{ ok, created, updated, skipped, failed }` | for pushing enrichment results in |
| `/disconnect` | `{ ok }` | |

`/status` does not report plan status. The page gets that from
`upgrade-intent.hamoureliasse.workers.dev` — the same source the worker checks
server-side — so both stages can show the right screen before the user clicks
anything.

## What a pass costs

The worker starts from a contact's **name**, because HubSpot contacts rarely
carry a LinkedIn URL. That is a different price list from the audit, which
prices the cheaper profile-driven path:

| Field | Operation | Credits |
|---|---|---|
| Business email | `lead_full_name_to_email` | 7 |
| LinkedIn URL | `lead_full_name_to_linkedin_url` | 1 |
| Phone | `linkedin_profile_to_phone` | 50 (+1 if the profile URL has to be found first) |

Phone is off by default. Job title is not offered here at all — it needs a
profile URL as input, which this path does not start from; it stays available
through the CSV route.

`maxPerRun` is 25 per pass and the worker stores a cursor, so "clean the next
25" continues where the last pass stopped. Only empty fields are ever written
("no override").

## Verify before trusting it

On the `nango-connect-session` Worker in the Cloudflare dashboard:

1. **KV binding** `CRM_CONNECTIONS`.
2. **Secret** `NANGO_SECRET_KEY` (never in a tracked file — `wrangler secret put NANGO_SECRET_KEY`).
3. **Service binding** `ENRICH_SERVICE` → the `linkfinderapp` Worker.
   Without it *every* lookup fails with Cloudflare error 1042 (same-account
   Worker-to-Worker calls over a public `*.workers.dev` host are blocked).
4. **Cron trigger** `0 10 * * 1`.

In Nango (https://app.nango.dev/dev/integrations/hubspot/settings): the
integration enabled with `crm.objects.contacts.read` / `.write` and
`crm.objects.companies.read` / `.write`. No HubSpot developer app of your own
is required — Nango ships a shared one. Registering your own later only changes
branding on the consent screen.

The integration ID is hardcoded as `hubspot-9mj3`. Recreating the integration
in Nango changes it, and the worker must be updated to match.
