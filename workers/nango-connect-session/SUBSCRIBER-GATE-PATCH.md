# The subscriber gate is still refusing every paying customer on 2 of 3 routes

**Verified against the live worker source on 24 Aug**, not inferred. Read with
`workers_get_worker_code`, so the strings below are exact.

## What is already fixed

The service-binding rewrite landed. `isSubscriber` takes `env` and routes
through the binding:

```js
async function isSubscriber(env, token) {
  try {
    const call = env.SUBSCRIBER_SERVICE || { fetch };
    const r = await call.fetch('https://upgrade-intent.hamoureliasse.workers.dev/', {
```

and `handleConnectSession` passes it correctly:

```js
if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);
```

So **connecting HubSpot works.**

## What is still broken

Two call sites were never updated and still call the old one-argument shape:

| where | live code |
| --- | --- |
| `handlePushContacts` | `if (!(await isSubscriber(token)))` |
| `syncOneConnection` | `if (!(await isSubscriber(linkfinderToken)))` |

Both pass the **token where `env` is expected**. Inside the function that
means `env` is a string and `token` is `undefined`, so:

1. `env.SUBSCRIBER_SERVICE` on a string is `undefined`
2. the `|| { fetch }` fallback takes over and does a plain fetch
3. a same-account Worker-to-Worker call over `*.workers.dev` is blocked by
   Cloudflare (**error 1042**)
4. the `catch` returns `false` — fail closed

Net effect: **`/sync-now` and `/push-contacts` refuse every subscriber**, for
the same reason as the original bug, in the two routes that actually do the
work. The customer connects HubSpot successfully, presses the button, and is
told to buy a plan they are already paying for.

---

# The fix: two edits

In the Cloudflare dashboard → `nango-connect-session` → Edit Code. Ctrl+F each
string; there is exactly one of each.

**Edit 1 — in `handlePushContacts`.** Find:

    if (!(await isSubscriber(token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

Replace with:

    if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

**Edit 2 — in `syncOneConnection`.** Find:

    if (!(await isSubscriber(linkfinderToken))) {

Replace with:

    if (!(await isSubscriber(env, linkfinderToken))) {

Deploy.

## Also confirm the binding exists

The code now expects `env.SUBSCRIBER_SERVICE`. Settings → Bindings should show
a **Service binding** named `SUBSCRIBER_SERVICE` pointing at `upgrade-intent`.
If it is missing, the two edits above change nothing — the fallback still runs
a plain fetch and still hits 1042.

## Verify

```bash
curl -s -w '\n%{http_code}\n' -H 'Content-Type: application/json' \
  -H 'Origin: https://linkfinderai.com' \
  -X POST https://nango-connect-session.hamoureliasse.workers.dev/sync-now \
  -d '{"token":"<a token that IS subscribed>"}'
```

- **200** with `processed` / `filled` → fixed.
- **200** with `"notSubscriber": true` → the edits did not take, or the binding
  is missing.
- **500** "ENRICH_SERVICE binding not set" → different, separate binding; the
  gate is fine.

Then press **Clean my contacts** on /crm-sync as a subscribed account.

---

# Recommended, same deploy: tell "no" apart from "could not tell"

`crm-sync.html` already ships the UI for this — it renders an `unverified`
state on a **503** from `/`, or on `checkFailed` in a `/sync-now` reply. The
worker never sends either yet, so those branches are currently dead code
waiting for this half.

Why it matters: today a timeout, a cold start, or a missing binding is
indistinguishable from "never paid", and the customer is told to upgrade. That
is precisely how this bug stayed invisible for six days.

Replace `isSubscriber` with:

```js
// Returns 'yes' | 'no' | 'unknown'. 'unknown' exists because returning false
// when the CHECK fails is what told paying customers to buy a plan they
// already had.
async function subscriberStatus(env, token) {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, trigger: 'crm_sync_gate' }),
  };
  try {
    // Service binding, not a plain fetch: a same-account Worker-to-Worker call
    // over the public *.workers.dev hostname is blocked by Cloudflare (1042).
    const call = env.SUBSCRIBER_SERVICE || { fetch };
    const r = await call.fetch('https://upgrade-intent.hamoureliasse.workers.dev/', init);
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

const UNKNOWN_SUBSCRIBER_ERROR = 'We could not verify your plan just now. This is on us, not your account — please try again in a minute.';
```

`handleConnectSession` and `handlePushContacts` each become:

```js
  const status = await subscriberStatus(env, token);
  if (status === 'no')      return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);
  if (status === 'unknown') return json({ error: UNKNOWN_SUBSCRIBER_ERROR }, 503, origin);
```

`syncOneConnection` — a failed check must not be recorded as "not a
subscriber", or the status page accuses a paying customer of lapsing:

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

---

# Not in this patch

Releasing the Nango connection when someone churns (so we stop paying for
people who left) is written up separately in `MONITORING-PATCH.md`'s sibling
section. It deletes connections, and the Nango DELETE call in it has never
been run against the live API — settle that before shipping it. `/disconnect`
has the same gap: it deletes the KV record and leaves the Nango connection
billing.
