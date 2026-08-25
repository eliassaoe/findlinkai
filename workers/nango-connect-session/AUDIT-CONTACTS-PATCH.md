# Add `/audit-contacts` — and fix the subscriber gate that is still refusing everyone

**Verified against the live worker source on 25 Aug** via `workers_get_worker_code`,
not inferred. Strings below are exact.

---

## PART 1 — the live bug, which matters more than the new route

`isSubscriber` is declared with two parameters:

```js
async function isSubscriber(env, token) {
```

`handleConnectSession` calls it correctly:

```js
if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);
```

**Two call sites still pass one argument**, exactly as `SUBSCRIBER-GATE-PATCH.md`
described — that patch never fully landed and the deployed worker still has it:

```js
// handlePushContacts
if (!(await isSubscriber(token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

// syncOneConnection
if (!(await isSubscriber(linkfinderToken))) {
```

In both, `env` receives the token string and `token` is `undefined`. So
`env.SUBSCRIBER_SERVICE` is `undefined`, the fallback `{ fetch }` does a plain
fetch to `upgrade-intent.hamoureliasse.workers.dev`, that is a same-account
Worker-to-Worker call over a public `workers.dev` hostname — **Cloudflare error
1042** — the `catch` fires, and the function returns `false`.

`isSubscriber` fails closed by design, so the effect is:

- **`/push-contacts` returns 403 for every customer, including subscribers.**
- **The weekly cron sync skips every connection, every week, silently** — it just
  logs `not a subscriber, skipping sync`.

The CRM sync has therefore never run for anyone. That is the most likely reason
there is 1 HubSpot connection in 90 days and no usage behind it.

**Fix — two characters each:**

```js
if (!(await isSubscriber(env, token)))            // handlePushContacts
if (!(await isSubscriber(env, linkfinderToken)))  // syncOneConnection
```

`syncOneConnection(env, linkfinderToken, record)` already receives `env`, so
nothing else needs threading. Do this before shipping anything below.

---

## PART 2 — the new route

`crm-sync.html` already calls it; until it exists the worker returns its normal
`{ error: 'Not found' }` 404, the page says so, and the CSV drop still works.

### Why

CRM Health only took a CSV because the audit began as a no-signup lead magnet.
For someone who has already connected HubSpot, asking for an export is pure
friction. The connection is **left in place** afterwards: accounts that take any
integration action are active at 8.1% at 30 days versus 1.4% for app-only
(120-day cohort, n=62 vs 934). Auto-disconnecting would destroy the best
retention signal in the data.

### Contract

`POST /audit-contacts` with `{ token }` → an array of contact objects. Keys
become the header row; `analyse()` in `js/lf-crm-audit.js` already accepts this
shape (its `"Array of objects (HubSpot API path)"` branch), so no client change
is needed.

```json
{ "contacts": [
    { "firstname": "Sarah", "lastname": "Chen", "email": "s@microsoft.com",
      "company": "Microsoft", "jobtitle": "VP Sales",
      "phone": "", "linkedinbio": "" }
  ],
  "sampled": 5000, "total": 42000 }
```

Empty strings rather than `null` — `isBlank()` treats both as missing, but the
key must be present for `detectColumns()` to see the column at all.

### Implementation

It is close to `syncOneConnection`'s search step with the enrichment removed:

```js
async function handleAuditContacts(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);
  if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);
  const { connectionId } = JSON.parse(raw);
  // page /crm/v3/objects/contacts with `after`, limit 100, cap at 5000
  // properties: firstname,lastname,email,company,jobtitle,phone,linkedinbio,website
  // flatten each result's `properties` into a plain object, '' for missing
}
```

Then register it alongside the others:

```js
if (url.pathname === '/audit-contacts') return handleAuditContacts(request, env, origin);
```

- **Read-only.** Never PATCH or POST to HubSpot from this route.
- **No credits.** Scanning is free and the page says so — never call `ENRICH_SERVICE`.
- **Cap at 5,000**, paginating with HubSpot's `after` cursor. The score is a rate,
  so a sample is representative; return `sampled` and `total` so the page can say
  "sampled 5,000 of 42,000".
- Use `/crm/v3/objects/contacts` (plain list), not `/search` — no filter is needed
  and list paging is cheaper against HubSpot's rate limit.

### Verify after deploy

1. Subscriber with a connection → **Check your connected CRM** scores real contacts.
2. Subscriber **without** a connection → card hidden, CSV path unchanged.
3. Non-subscriber → 403, page shows the upgrade message.
4. `crm_audit_started {source:'connection'}` fires, distinct from the CSV path.
5. **Part 1 regression check:** `/sync-now` on a subscriber no longer returns
   "not a subscriber", and the Monday cron logs a non-zero `processed`.
