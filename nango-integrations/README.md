[README (3).md](https://github.com/user-attachments/files/31026325/README.3.md)
# LinkFinder AI ↔ HubSpot (Nango integration)

Nango actions that let a HubSpot workflow (or your own backend) enrich HubSpot
**companies** and **contacts** using the [LinkFinder AI API](https://linkfinderai.com),
and write the results back onto the record.

This is a code-first Nango integration (no `nango.yaml` needed — each action is
self-describing via `createAction`). Deploy it with the [Nango CLI](https://www.npmjs.com/package/nango).

## What's included

| Action | Does |
|---|---|
| `hubspot/actions/enrich-company.ts` | Reads a HubSpot company's domain/name, calls LinkFinder AI (`company_domain_to_employees` or `company_name_to_website`), writes the result back onto the company. |
| `hubspot/actions/enrich-contact.ts` | Reads a HubSpot contact's LinkedIn URL, calls LinkFinder AI (`linkedin_profile_to_linkedin_info` by default), writes the result back onto the contact. |
| `hubspot/actions/check-linkfinder-job.ts` | Polls a LinkFinder AI job started by the two actions above and writes the result once it's ready. |

`hubspot/linkfinder-client.ts` is a shared (non-action) helper — request/retry/poll
logic for LinkFinder AI's single-endpoint API, plus the HubSpot property-mapping helper.

### Why a `check-linkfinder-job` action exists

LinkFinder AI's `linkedin_profile_to_linkedin_info` endpoint is **always async**
(returns `job_id` + `poll_url` immediately), and any other endpoint can fall back
to the same shape if it takes longer than ~27s. `enrich-company` / `enrich-contact`
poll internally for a short bounded window (`maxWaitSeconds`, default 20–25s) for
convenience, but if the job is still running they return `processing: true` with
`jobId`/`pollUrl` instead of blocking indefinitely.

For the still-processing case, add a **Delay** step in your HubSpot workflow and
call `check-linkfinder-job` again, looping until `processing: false` — the same
pattern LinkFinder AI's own docs recommend for Zapier/Make.

## Setup

### 1. Prerequisites

- A [Nango](https://app.nango.dev) account with a HubSpot integration enabled at
  [app.nango.dev/dev/integrations/hubspot/settings](https://app.nango.dev/dev/integrations/hubspot/settings) —
  make sure the OAuth scopes below are turned on there:
  - `crm.objects.companies.read`, `crm.objects.companies.write`
  - `crm.objects.contacts.read`, `crm.objects.contacts.write`
- At least one HubSpot connection created through that integration (via Nango Connect / the frontend SDK).
- A LinkFinder AI API key (dashboard → Settings → API Key).
- In the target HubSpot portal, create the custom properties these actions write to
  (Settings → Properties → Company/Contact properties):
  - `linkfinder_ai_data` — Multi-line text, on **both** Companies and Contacts
    (stores the raw LinkFinder AI JSON result).
  - `linkedin_url` on Contacts, if the portal doesn't already have a LinkedIn URL
    property — or pass your existing property's name via the `linkedinUrlProperty` input.
  - Any additional properties you reference in a `propertyMap` input (e.g. `numberofemployees`).

### 2. Install the CLI and deploy

```bash
cd nango-integrations
npm install
cp .env.example .env   # fill in NANGO_SECRET_KEY

npx nango deploy dev   # or: npm run deploy:dev
```

### 3. Test locally before deploying

```bash
npx nango dryrun enrich-company <connection-id> '{
  "companyId": "123456789",
  "apiKey": "YOUR_LINKFINDER_API_KEY"
}'

npx nango dryrun enrich-contact <connection-id> '{
  "contactId": "987654321",
  "apiKey": "YOUR_LINKFINDER_API_KEY"
}'
```

### 4. Trigger the actions

From your own backend, using the [Nango Node SDK](https://www.npmjs.com/package/@nangohq/node):

```ts
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

const result = await nango.triggerAction('hubspot', '<connection-id>', 'enrich-company', {
    companyId: '123456789',
    apiKey: process.env.LINKFINDER_API_KEY
});

if (result.processing) {
    // poll result.jobId / result.pollUrl later via check-linkfinder-job
}
```

Or from a HubSpot workflow, via a **Custom Code** action (or webhook) that calls
your backend, which in turn calls the Nango action above — HubSpot workflows can't
call Nango directly.

## Notes / open items

- LinkFinder AI's docs excerpt used to build this only confirmed a handful of
  `type` values (`company_name_to_website`, `company_domain_to_employees`,
  `linkedin_profile_to_linkedin_info`, `leads_finder_ai`). `enrich-contact`
  accepts an arbitrary `type` string (with `linkedin_profile_to_linkedin_info`
  as the inferred default) so you can pass any other documented type — check
  your LinkFinder AI dashboard/API docs for the full catalog.
- The exact shape of a LinkFinder AI `result` payload (e.g. company enrichment
  fields) isn't fully documented in what was available, so results are stored
  as raw JSON on `linkfinder_ai_data` by default. Use the `propertyMap` input
  to map specific known result keys onto native HubSpot properties once you've
  confirmed their names against a live API response.
- The `leads_finder_ai` endpoint (natural-language lead search → many profiles)
  isn't wired up here since it creates *new* records rather than enriching an
  existing one — a good candidate for a follow-up `sync` if you want it to
  populate HubSpot contacts automatically.
