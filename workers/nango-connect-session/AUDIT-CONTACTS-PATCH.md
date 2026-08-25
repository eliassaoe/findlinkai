# Add an `audit-contacts` route so connected customers skip the CSV export

**Status:** front-end is live and calls this route already. Until the route
exists the worker returns 404, and the page says so and falls back to the CSV
drop — nothing is broken in the meantime.

## Why

CRM Health only accepted a CSV export because the audit began life as a
no-signup lead magnet (`crm-audit.html`), where a file drop is the whole point:
*"your file never leaves this browser."* That is still right for cold traffic.

For a customer who has **already connected HubSpot**, asking them to export a
CSV is pure friction — we can read the contacts we already have access to.

The connection is **left in place** after the check. Users who have taken any
integration action retain at 8.1% vs 1.4% for app-only (30-day active, 120-day
cohort, n=62 vs 934). Auto-disconnecting after an audit would deliberately
destroy the thing that predicts retention best.

## What the front-end already does

`crm-sync.html` → `runLiveAudit()`:

```js
const res = await nangoCall('audit-contacts');   // POST {token}
const rows = res.data.contacts || res.data.rows || [];
LFCrmAudit.analyse(rows, { fields: activeFields, alwaysPlan: true });
```

`analyse()` already accepts an array of plain objects — see its
`"Array of objects (HubSpot API path)"` branch. No client change is needed once
this route ships.

## Contract

`POST /audit-contacts` with `{ token }`.

**200** — an array of contact objects. Keys become the header row, so use the
same HubSpot property names the sync already maps (`HUBSPOT_PROPERTY` in
`crm-sync.html`: `email`, `linkedinbio`, `phone`), plus name and company:

```json
{ "contacts": [
    { "firstname": "Sarah", "lastname": "Chen", "email": "s@microsoft.com",
      "company": "Microsoft", "jobtitle": "VP Sales",
      "phone": "", "linkedinbio": "" }
] }
```

Empty strings, not `null` — `isBlank()` treats both as missing, but empty string
keeps the column present so `detectColumns()` can see it.

**Errors:** reuse the existing shapes — `401` bad token, `402` not entitled,
`404` route absent (handled), `5xx` upstream. Include `{ "error": "..." }`;
the page surfaces it verbatim.

## Implementation notes

- **Read-only.** This route must never write. Reuse the connection
  `handlePushContacts` already resolves, but call only HubSpot's read endpoints.
- **No credits.** Scanning is free; the page states this. Do not decrement.
- **Cap the read.** Take the first ~5,000 contacts. The score is a rate, so a
  large sample is representative, and it bounds worker CPU and HubSpot rate
  limit burn. Return the count you actually read so the page can say
  "sampled 5,000 of 42,000".
- **Paginate** with HubSpot's `after` cursor until the cap.
- **Gate it the same way as the other routes.** Check `isSubscriber(env, token)`
  exactly as `handleConnectSession` does — see `SUBSCRIBER-GATE-PATCH.md` for
  the two call sites that previously got this wrong.

## Verify after deploy

1. Connected account → CRM Health shows **Check your connected CRM**; the button
   scores real contacts and the CSV drop stays available underneath.
2. Disconnected account → the card stays hidden, CSV path unchanged.
3. Route removed → page shows the "not switched on yet" notice, no console error.
4. `crm_audit_started {source:'connection'}` and `crm_audit_completed` fire in
   PostHog, distinguishable from the CSV path.
