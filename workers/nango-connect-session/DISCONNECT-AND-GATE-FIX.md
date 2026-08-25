# Two live regressions in `nango-connect-session`

Found 2026-08-25 while answering a design question about whether the CRM audit
could use a short-lived OAuth connection instead of a CSV drop. Both were in the
deployed Worker; neither was in any file in this repo, because the Worker only
existed in the Cloudflare dashboard. `worker.js` here is now the source of
truth — paste it into the `linkedfinderapiaccess`-style dashboard editor for
the `nango-connect-session` Worker to deploy.

`worker.test.mjs` reproduces both against the old shapes and shows them fixed.

---

## 1. The paid gate rejected everyone — CRM sync was entirely dead

`isSubscriber` is declared `isSubscriber(env, token)`. Two of its three call
sites passed only the token:

```js
if (!(await isSubscriber(token)))            // handlePushContacts
if (!(await isSubscriber(linkfinderToken)))  // syncOneConnection
```

JavaScript does not complain. `env` silently became the token string, `token`
became `undefined`. Then:

- `env.SUBSCRIBER_SERVICE` on a string is `undefined`, so the helper fell back
  to a plain global `fetch` — which is the error-1042 path, but it never got
  that far;
- `JSON.stringify({ token: undefined, trigger })` drops the key entirely, so the
  POST to `upgrade-intent` carried **no token at all**;
- that returns not-ok, and the helper's deliberate fail-closed `catch` turned
  that into `false`.

Consequences, for every user including paying ones:

| Call site | Effect |
| --- | --- |
| `/push-contacts` | **403 for everybody.** "Upgrade to connect your CRM" shown to people who already had. |
| `syncOneConnection` | Every connection skipped as "not a subscriber" — so the **weekly cron did nothing, for anyone, ever**, and `/sync-now` returned a clean `processed: 0` rather than an error. |

`handleConnectSession` was the one correct call site, which is why connecting
appeared to work and everything after it silently did not.

Measured:

    isSubscriber for a genuinely subscribed user:
      isSubscriber(token)      -> false
      isSubscriber(env, token) -> true

This is the item tracked as task #25 (the "CRM paywall 403").

## 2. `/disconnect` never told Nango

The whole handler was:

```js
async function handleDisconnect(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);
  await env.CRM_CONNECTIONS.delete(`conn:${token}`);
  return json({ ok: true }, 200, origin);
}
```

It deleted our KV row and nothing else. Two problems:

- **Money.** Nango bills per connection, prorated for as long as the connection
  exists. Every user who has ever pressed Disconnect is still a live, billable
  connection — and now invisible to this Worker, so nothing will ever clean it
  up. Audit the Nango dashboard's connection list against the `conn:` keys in
  `CRM_CONNECTIONS`; anything in the former and not the latter is an orphan to
  delete by hand, once.
- **Trust.** The OAuth grant stayed active on the customer's HubSpot portal
  after they told us to let go of it. That is the more serious of the two.

Now `handleDisconnect` reads the `connectionId` out of KV first, calls Nango's
delete, then drops the KV row regardless, and reports `{ ok, released }` so the
UI can tell the difference between "forgotten" and "actually released".

### On the endpoint path

Nango moved this: `/connections/:id` is current, `/connection/:id` is the older
documented spelling and still functions. `docs.nango.dev` is blocked by the
egress proxy here, so `nangoDeleteConnection` tries the current path first and
falls back to the old one, logging both outcomes. **The first real disconnect
will print which one answered — once you know, delete the loser.**

---

## The question this came out of: could the audit use a timed connection?

Yes, and Nango's proration is what makes it viable — a connection that lives 30
seconds costs essentially nothing. But it is blocked on fix #2 above: without a
real delete, every free audit would leave behind a permanent billable connection
and a live OAuth grant. That is the thing to fix first, and it is fixed here.

Note that the CSV drop on `crm-audit.html` is a deliberate choice, not an
oversight — see the header comment in `js/lf-crm-audit.js`. It runs entirely in
the browser, so "none of your CRM export is uploaded" is literally true, and
that claim is most of why a stranger runs it. An OAuth consent screen on a cold
public page costs that claim and asks a HubSpot **admin** scope from someone who
often is not the admin. The timed connection belongs alongside the CSV drop as a
second option for warm and in-app users, not as a replacement for it.
