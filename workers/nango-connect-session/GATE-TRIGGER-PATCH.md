# HubSpot connect has never worked: `crm_sync_gate` is not a valid trigger

**Verified against both live workers on 25 Aug** via the Cloudflare connector,
and matches the console trace from a real click: `POST /` → **403**.

This is the whole reason connecting fails. It is a one-line fix in
`upgrade-intent`, not in `nango-connect-session`.

## The chain

`nango-connect-session` → `isSubscriber(env, token)` asks the billing worker:

```js
const r = await call.fetch('https://upgrade-intent.hamoureliasse.workers.dev/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, trigger: 'crm_sync_gate' }),
});
if (!r.ok) return false;
```

`upgrade-intent` validates the trigger before it looks at anything else:

```js
const VALID_TRIGGERS = [
  'credits_exhausted',
  'three_enrichments',
  'buy_credits_btn',
  'page_load',
  'checkout_prefetch_email',
  'checkout_return',
];

if (!VALID_TRIGGERS.includes(trigger)) {
  return json(request, { error: `Unknown trigger: ${trigger}` }, 400);
}
```

**`crm_sync_gate` is not in that list.** So:

1. `upgrade-intent` answers `400 Unknown trigger: crm_sync_gate` — it never
   reaches the subscription lookup at all.
2. `isSubscriber` sees `!r.ok` and returns `false`.
3. Every gated route answers `403 NOT_SUBSCRIBER_ERROR`.

It fails identically for a paying subscriber and a free user, because the
subscription is never checked. **HubSpot connect has never worked for anyone.**
That is consistent with 1 connection in 90 days.

## What this rules out

- **Not the `SUBSCRIBER_SERVICE` binding.** It exists and points at
  `upgrade-intent` (confirmed in the dashboard).
- **Not the `isSubscriber(env, token)` argument bug.** That one is real, but it
  affects `handlePushContacts` and `syncOneConnection` — *not*
  `handleConnectSession`, which already passes both arguments. Connect fails for
  this reason instead.

Both bugs produce the same 403, which is why the argument bug looked like the
culprit. Fixing only that would not have made connect work.

## The fix

In the **`upgrade-intent`** worker, add the trigger:

```js
const VALID_TRIGGERS = [
  'credits_exhausted',
  'three_enrichments',
  'buy_credits_btn',
  'page_load',
  'checkout_prefetch_email',
  'checkout_return',
  'crm_sync_gate',          // ← add: nango-connect-session's subscriber check
];
```

Also add it to the notify skip, a few lines below. `crm_sync_gate` is an
internal permission check that can fire several times per page load — it is not
a user intent worth posting to n8n:

```js
const skipNotify = trigger === 'page_load'
  || trigger === 'checkout_prefetch_email'
  || trigger === 'crm_sync_gate';
```

Deploy `upgrade-intent`. No change to `nango-connect-session` is needed for
connect to start working.

## Verify

1. As a **subscriber**, click Connect HubSpot → the Nango popup should receive a
   session token instead of the page showing a 403. `POST /` returns 200 with
   `connectSession`.
2. As a **non-subscriber**, the same click should still be refused — but now
   because the subscription was actually checked and came back false, not
   because the trigger name was rejected.
3. Tail the `upgrade-intent` logs: `Unknown trigger: crm_sync_gate` should stop
   appearing.

## Still outstanding after this

The argument bug in `AUDIT-CONTACTS-PATCH.md` / `worker.paste-safe.js` remains,
and still needs fixing separately — otherwise connecting will now succeed but
`/push-contacts` and the Monday cron will keep refusing the same customers.
