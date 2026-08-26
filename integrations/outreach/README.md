# LinkFinder AI → cold outreach

Enrich a lead, then push it into a sequence. Ten destinations behind one call.

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

The test suite (`npm test`, 15 tests) stubs `fetch` and asserts the exact request each
adapter builds, so the payload shapes are pinned. What it **cannot** check is whether
each vendor accepts them, because this build environment has no network access.

- **Instantly** — field names (`email`, `first_name`, `last_name`, `company_name`,
  `phone`, `website`) confirmed against Instantly's own endpoint spec. One thing to
  confirm on a first live run: the campaign field is sent as `campaign`, per the v2
  request body, while Instantly's own tooling exposes it as `campaign_id`.
- **Everything else** — written from each vendor's published API documentation, not
  from a live call. Run one lead through each destination before pointing a real
  campaign at it.

Two vendors deserve particular care: **Salesforge** and **EmailBison** have the least
stable public documentation of the ten, and EmailBison is self-hosted, so its path
layout can differ per deployment.
