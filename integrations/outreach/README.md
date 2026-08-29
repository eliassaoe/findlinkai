# LinkFinder AI → cold outreach

Enrich a lead, then push it into a sequence. Twelve destinations behind one call.

```js
import { enrichAndPush } from './push.mjs';

const result = await enrichAndPush({
  apiKey: process.env.LINKFINDER_API_KEY,
  type: 'lead_full_name_to_email',      // 7 credits per lookup
  input: ['Ada Lovelace Tesla', 'Alan Turing Tesla'],
  destination: 'instantly',
  credentials: { apiKey: process.env.INSTANTLY_API_KEY },
  target: { id: 'campaign-uuid' },
});

// → { pushed: [...], skipped: [...], failed: [...], pending: [...] }
```

Dependency-free ESM — it runs in a Cloudflare Worker, a script, or any runtime with
`fetch`.

## Why enrichment comes first

A lead with no email address cannot be emailed. That is the whole reason this exists:
the lookup has to happen *before* the push, not after, and everything here is built
around not wasting it. Credits are spent the moment a lookup runs — so:

- A lead with **no email** is skipped, not pushed, and reported with the reason.
- A lookup that **found nothing** is reported as skipped *and charged*, so a bulk run
  never looks like it silently did nothing.
- A **still-running job** is returned with its `jobId`/`pollUrl` rather than dropped,
  so it can be polled instead of re-run and paid for twice.
- One **rejected lead** does not abandon the batch — every lead after it has already
  been paid for.

## Destinations

| Destination | Auth | Target | Extra credentials |
| --- | --- | --- | --- |
| Instantly | API key | Campaign or list ID | — |
| Smartlead | API key (query param) | Campaign ID | — |
| lemlist | API key (HTTP Basic) | Campaign ID | — |
| Reply.io | API key | Campaign ID | — |
| Woodpecker | API key (HTTP Basic) | Campaign ID | — |
| ActiveCampaign | API key | List ID | `baseUrl` |
| Outreach | OAuth | Sequence ID | `mailboxId` |
| Salesloft | OAuth | Cadence ID | — |
| Salesforge | API key | Sequence ID | `workspaceId` |
| EmailBison | API key | Campaign ID | `baseUrl` (self-hosted) |
| Clay | Webhook URL | Clay table webhook | — |
| JustCall | API key | Campaign ID | — (needs a phone, not an email) |

Each adapter is one file that states two things: how to authenticate, and what body
that tool wants. Anything else — error handling, retries, the lead shape — is shared.

## Normalising the lead

The API answers in three shapes depending on the operation (a bare scalar, an object,
a list) and its object keys are not uniform either: employee lists come back camelCase
(`linkedinUrl`, `companyWebsite`), profile lookups snake_case (`job_title`). `lead.mjs`
flattens all of that into one shape so no adapter has to know about it.

Names are split on the last space to get `firstName`/`lastName`, which every tool in
this category wants. That is wrong for compound surnames like "van der Berg" — the
unsplit `fullName` is always passed through so a caller can correct it.

## Verification status — read before going live

`test/destinations.test.mjs` stubs `fetch` and asserts the exact URL, auth header and
body every adapter builds, so the payload shapes are pinned. Its last test runs all
twelve and fails on any whose `addLead` never reaches `fetch` — that is the check that
matters, because this file used to make this claim while eight of the twelve were never
executed by anything.

What the tests **cannot** check is whether each vendor accepts the shape, because this
build environment has no network access to `linkfinderai.com` or to the vendors
themselves. Updated 2026-08-29 by reconciling each adapter against the vendor's current
published API reference (not a live call — see the per-vendor notes below).

- **Instantly** — confirmed. `email`, `first_name`, `last_name`, `company_name`,
  `phone`, `website`, `custom_variables` match Instantly's v2 spec, and the campaign
  field is `campaign` (not `campaign_id`, which is only what Instantly's own tooling
  calls it) — confirmed directly against a documented request body.
- **lemlist** — **fixed.** The adapter was posting to
  `/api/campaigns/{id}/leads/{email}` (a v1 path, email in the URL) with no `email` in
  the body. lemlist's current API (`developer.lemlist.com`) is
  `POST /api/campaigns/{id}/leads` with `email` in the body. Updated and re-pinned in
  the test suite.
- **JustCall** — **fixed.** The adapter posted to `/v2.1/contacts`, which doesn't
  exist; JustCall's Sales Dialer contact-create endpoint is
  `/v2.1/sales_dialer/contacts`. Updated and re-pinned.
- **EmailBison** — **fixed.** There is no single "create and attach" call: a lead is
  created on its own (`POST /api/leads`), then attached to a campaign by id
  (`POST /api/campaigns/{id}/leads/attach-leads`, body `{lead_ids: [...]}`). The
  adapter previously sent raw lead objects straight to the attach endpoint, which only
  accepts ids. Rewritten as two calls and re-pinned. Still the one to watch on a first
  live run — it is self-hosted, so paths can vary per deployment.
- **Smartlead, lemlist, Reply.io, Woodpecker, Salesloft, Outreach, ActiveCampaign** —
  request shape cross-checked against each vendor's current published reference;
  nothing else to correct.
- **Salesforge** — unchanged, and still the least-documented of the twelve. Its public
  reference does not show the workspace-contacts body in enough detail to confirm past
  what was already here. Run one lead through it before pointing a real campaign at it.
- **Clay** — no request shape to get wrong (it forwards the flattened lead as-is to a
  webhook URL Clay generates), so there is nothing to verify beyond "the webhook
  receives a POST."

Whatever the docs say, a vendor's live behavior is the final word. **Run one lead
through each destination before pointing a real campaign at it** — Salesforge and
EmailBison need the most care.
