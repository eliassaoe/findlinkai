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


---

# DO THIS FIRST — the 3-minute fix

Everything below the fold is the hardened version. This is the minimum that
makes CRM connections work again. Two dashboard steps, five one-line edits.

## 1. Add the binding (30 seconds)

Cloudflare dashboard → Workers → **nango-connect-session** → Settings →
Bindings → Add binding → **Service binding**

    Variable name : SUBSCRIBER_SERVICE
    Service       : upgrade-intent
    Environment   : production

Save.

## 2. Five edits (2 minutes)

Open the worker's code editor (Edit Code / Quick Edit). Use Ctrl+F to find each
string. There is exactly one of each.

**Edit 1 — let the function see the bindings.** Find:

    async function isSubscriber(token) {

Replace with:

    async function isSubscriber(env, token) {

**Edit 2 — route the call through the binding.** Find:

    const r = await fetch('https://upgrade-intent.hamoureliasse.workers.dev/', {

Replace with:

    const call = env.SUBSCRIBER_SERVICE || { fetch };
    const r = await call.fetch('https://upgrade-intent.hamoureliasse.workers.dev/', {

**Edits 3, 4, 5 — pass `env` at the three call sites.** Find and replace each:

    if (!(await isSubscriber(token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

appears TWICE (handleConnectSession and handlePushContacts). Both become:

    if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

Then find:

    if (!(await isSubscriber(linkfinderToken))) {

Replace with:

    if (!(await isSubscriber(env, linkfinderToken))) {

Deploy.

## 3. Check it worked

    curl -s -w '\n%{http_code}\n' -H 'Content-Type: application/json' \
      -H 'Origin: https://linkfinderai.com' \
      -X POST https://nango-connect-session.hamoureliasse.workers.dev/ \
      -d '{"token":"B2jf6h3KpXjAXxE9"}'

- **200** with a `connectSession` value → fixed. Go press Connect HubSpot.
- **403** → the binding did not save, or an edit was missed.
- **500** "NANGO_SECRET_KEY not set" → different problem, tell me.

## 4. Then reload /crm-sync and click Connect HubSpot

That is the first time the Nango credentials will have been exercised since
17 Aug. If the HubSpot consent screen opens, the whole path is alive.

---

# The hardened version (do this later, not now)

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

---

# Release the Nango connection when someone churns

Nango bills per connection per month, whether or not it runs. Today the weekly
cron notices a lapsed subscriber and *skips* them — the connection stays,
so you keep paying for people who left. It should be handed back.

Add this alongside the tri-state check.

## Why it is delayed, not immediate

Deleting on the first "not a subscriber" is dangerous: that is exactly what the
1042 bug reported for six days straight, and it would have destroyed every real
customer's connection. So a definite `'no'` only starts a clock; `'unknown'`
never does, and a returning subscriber clears it.

```js
const CHURN_GRACE_DAYS = 7;

// Hands the connection back to Nango so it stops being billed. Only ever
// called after CHURN_GRACE_DAYS of confirmed non-subscription - never on a
// check that merely failed.
async function releaseConnection(env, linkfinderToken, record) {
  try {
    const r = await fetch(
      `${NANGO_API_BASE}/connection/${encodeURIComponent(record.connectionId)}` +
      `?provider_config_key=${encodeURIComponent(HUBSPOT_INTEGRATION_ID)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${env.NANGO_SECRET_KEY}` } }
    );
    // 404 means Nango already lost it - the local record should still go.
    if (!r.ok && r.status !== 404) {
      console.error(`[crm-sync] release failed ${r.status} for ${linkfinderToken}`);
      return false;
    }
  } catch (e) {
    console.error('[crm-sync] release threw', e);
    return false;
  }
  await env.CRM_CONNECTIONS.delete(`conn:${linkfinderToken}`);
  console.log(`[crm-sync] released connection for ${linkfinderToken} (churned)`);
  return true;
}
```

In `syncOneConnection`, replace the skip branch:

```js
  const status = await subscriberStatus(env, linkfinderToken);

  if (status === 'yes') {
    // Back on a plan - clear any pending churn clock.
    if (record.notSubscriberSince) {
      record = { ...record, notSubscriberSince: null };
      await env.CRM_CONNECTIONS.put(`conn:${linkfinderToken}`, JSON.stringify(record));
    }
  } else if (status === 'no') {
    const since = record.notSubscriberSince || new Date().toISOString();
    const days  = (Date.now() - new Date(since).getTime()) / 86400000;

    if (days >= CHURN_GRACE_DAYS) {
      await releaseConnection(env, linkfinderToken, record);
      return { processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 },
               filledTotal: 0, released: true };
    }
    if (!record.notSubscriberSince) {
      await env.CRM_CONNECTIONS.put(`conn:${linkfinderToken}`,
        JSON.stringify({ ...record, notSubscriberSince: since }));
    }
    return { processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 },
             filledTotal: 0, notSubscriber: true };
  } else {
    // 'unknown' - our check failed. Change nothing, spend nothing, accuse nobody.
    return { processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 },
             filledTotal: 0, checkFailed: true };
  }
```

## Verify the DELETE endpoint before shipping this

I could not reach the network from the session where this was written, so the
Nango delete call above is from their documented REST API rather than a live
test. Confirm the path and the `provider_config_key` parameter against
https://docs.nango.dev before deploying, and watch the first cron run's logs.

## Also worth doing

`/disconnect` currently only deletes the KV record — the Nango connection
survives and keeps billing. Have it call `releaseConnection` too, so a user who
disconnects by hand actually costs nothing.
