# nango-connect

Mints Nango Connect session tokens so a paid user can authorise HubSpot from the
CRM Sync tab, and reports whether they already have.

## Why the paid check lives here

Every Nango connection costs money per connection. That is the whole reason
HubSpot sync is a paid feature, and the reason the CRM audit was deliberately
built to need no connection at all.

So the check runs server-side. Anyone can POST any token at a worker, and a
client-side `if (isPaid)` is a suggestion rather than a gate. The worker resolves
the token against Supabase, then asks the Railway endpoint whether that account
is subscribed — subscription state is not in Supabase, the dodo webhook only
emits PostHog events, so Railway is the source of truth.

If `SUBSCRIPTION_CHECK_URL` is unset the worker **fails closed** and mints
nothing. An unconfigured gate must never be an open one.

The Nango secret key never reaches the browser. The browser gets only a
short-lived connect session token scoped to a single end user.

## Endpoints

All POST, all take `{token}`:

| Route | Returns |
|---|---|
| `/status` | `{connected, connectionId, provider, paid}` |
| `/session` | `{sessionToken, expiresAt}` — or 402 `plan_required` |
| `/disconnect` | `{disconnected}` — deletes the connection, freeing the seat |

`/session` returns `{alreadyConnected: true}` rather than minting a second
session when the user already has a HubSpot connection: duplicates would
silently double the per-connection cost.

402 is deliberate on the plan check — it means "not on this plan", not "never",
and the page turns it into an upgrade prompt rather than an error.

## Deploy

```bash
cd workers/nango-connect
npx wrangler secret put NANGO_SECRET_KEY       # rotate the leaked one first
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler deploy
```

The page calls `https://nangoconnect.hamoureliasse.workers.dev`. If you deploy
under a different name, update `NANGO_WORKER` in `crm-sync.html`.

## Depends on

The `hubspot` integration must exist in Nango, and
`nango-integrations/hubspot/syncs/enrich-new-contacts.ts` must be deployed —
otherwise a user can authorise HubSpot successfully and nothing will ever enrich
anything.
