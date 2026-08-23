# Patch: the subscriber gate has been refusing everyone since 17 Aug 23:31

## Symptom

`POST /` (connect-session) returns 403 for every user, including active
subscribers. `/sync-now` reports `notSubscriber` and fills nothing. The page
shows "Automatic sync is included on any paid plan" to people who are on one.

## Cause

`isSubscriber()` calls another Worker in the same Cloudflare account over its
public `workers.dev` hostname:

```js
const r = await fetch('https://upgrade-intent.hamoureliasse.workers.dev/', ...)
```

Cloudflare blocks same-account Worker-to-Worker calls over `*.workers.dev`
(**error 1042**) — the identical restriction this file's header already
documents for the enrichment worker, and already solved there with a service
binding. Here the throw is swallowed:

```js
} catch (e) {
    return false; // fail closed
}
```

so an infrastructure failure is indistinguishable from "this person never paid".

Worker last modified **2026-08-17T23:31:29Z**. `hubspot_disconnected` fired at
23:32:00 and `crm_sync_upgrade_clicked` at 23:32:01. The gate has never once
worked.

## Step 1 — add the service binding

`nango-connect-session` → Settings → Bindings → Add → **Service binding**

| field | value |
|---|---|
| Variable name | `SUBSCRIBER_SERVICE` |
| Service | `upgrade-intent` |
| Environment | production |

## Step 2 — replace `isSubscriber` with this

Three things change: it goes through the binding, it distinguishes "no" from
"could not tell", and callers stop treating the second as the first.

```js
// Subscription-only by design. upgrade-intent reports issub from
// `subscription_id` on linkfinderai_users — a real recurring Dodo
// subscription. Credit-pack buyers have is_unlimited = true and NO
// subscription_id, and are correctly refused: a pack is a one-off, while a
// Nango connection costs us every month whether it is used or not.
//
// Returns 'yes' | 'no' | 'unknown'. 'unknown' exists because this used to
// return false when the CHECK failed, which told paying customers to buy a
// plan they already had.
async function subscriberStatus(env, token) {
  const body = JSON.stringify({ token, trigger: 'crm_sync_gate' });
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };

  try {
    // Service binding, not a plain fetch. A same-account Worker-to-Worker call
    // over the public *.workers.dev hostname is blocked by Cloudflare (error
    // 1042) — the same restriction ENRICH_SERVICE exists to sidestep.
    const r = env.SUBSCRIBER_SERVICE
      ? await env.SUBSCRIBER_SERVICE.fetch('https://upgrade-intent.hamoureliasse.workers.dev/', init)
      : await fetch('https://upgrade-intent.hamoureliasse.workers.dev/', init);

    if (!r.ok) {
      console.log(`[crm-sync] subscriber check returned ${r.status}`);
      return 'unknown';
    }
    const d = await r.json().catch(() => null);
    if (!d) return 'unknown';
    return d.issub === true ? 'yes' : 'no';
  } catch (e) {
    console.error('[crm-sync] subscriber check threw', e);
    return 'unknown';
  }
}

const NOT_SUBSCRIBER_ERROR = 'HubSpot CRM Sync is available on paid plans. Upgrade to connect your CRM.';
const UNKNOWN_SUBSCRIBER_ERROR = 'We could not verify your plan just now. This is on us, not your account — please try again in a minute.';
```

## Step 3 — update the three call sites

**`handleConnectSession`**

```js
  const status = await subscriberStatus(env, token);
  if (status === 'no')      return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);
  if (status === 'unknown') return json({ error: UNKNOWN_SUBSCRIBER_ERROR }, 503, origin);
```

**`handlePushContacts`** — same three lines, in place of the old
`if (!(await isSubscriber(token)))`.

**`syncOneConnection`** — a failed check must not be recorded as "not a
subscriber", or a paying customer's status page accuses them of lapsing:

```js
  const status = await subscriberStatus(env, linkfinderToken);
  if (status !== 'yes') {
    console.log(`[crm-sync] ${linkfinderToken}: subscriber check = ${status}, skipping`);
    return {
      processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 }, filledTotal: 0,
      ...(status === 'no' ? { notSubscriber: true } : { checkFailed: true }),
    };
  }
```

## Verify

```bash
curl -s -w '\n%{http_code}\n' -H 'Content-Type: application/json' \
  -H 'Origin: https://linkfinderai.com' \
  -X POST https://nango-connect-session.hamoureliasse.workers.dev/ \
  -d '{"token":"B2jf6h3KpXjAXxE9"}'
```

200 with a `connectSession` = fixed. Still 403 = the binding did not take.
503 = the binding is there but `upgrade-intent` itself is erroring.
