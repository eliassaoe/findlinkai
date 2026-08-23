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
| `hubspot/syncs/enrich-new-contacts.ts` | **Continuous.** Watches the portal and enriches any contact that has a LinkedIn URL but no LinkFinder data yet — including every newly created one. This is the "keep it clean automatically" half; the actions above are the "enrich this one record on demand" half. |

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
  make sure the OAuth scopes below are turned on there.

  **No HubSpot developer app of your own is needed.** Nango ships a shared
  developer app for HubSpot that works in production too. Registering your own
  is a branding decision to make later, not a prerequisite: on the shared app
  the consent screen asks your customer to authorize *Nango* rather than
  LinkFinder AI, the scopes are fixed, and the callback lives on Nango's domain.

  Scopes:
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


## The sync: keep it clean automatically

The three actions each enrich **one** record when something calls them, which
means the customer has to build a HubSpot workflow to drive them. The sync needs
no wiring: it runs hourly, finds contacts missing enrichment, and fills them in.

### How it finds work, and why that matters

The sync does not track which contacts it has already processed. It asks HubSpot
each time for contacts where the LinkedIn URL property **is** set and the target
property **is not**:

```
HAS_PROPERTY      linkedin_url
NOT_HAS_PROPERTY  linkfinder_ai_data
```

An enriched contact therefore drops out of the queue permanently, evaluated
server-side on every request. Three consequences worth knowing:

* A run that dies halfway — timeout, credit exhaustion, a deploy — resumes
  exactly where it stopped, with no state to reconcile.
* Enriching the same contact twice is structurally impossible rather than merely
  unlikely. That matters because the customer pays per enrichment.
* The target property doubles as the "done" marker, so **do not point
  `targetProperty` at a property anything else writes to** — the sync would read
  those records as already enriched and skip them forever.

### Deliberate limits

* **`maxContactsPerRun` (default 100)** bounds both execution time and how many
  credits one run can spend. The remainder is picked up next run.
* **Async jobs are not polled to completion.** `linkedin_profile_to_linkedin_info`
  is always async; blocking per contact would exhaust the execution budget on a
  large portal. The target property stays unset, so the contact is simply still
  in the queue next run — retrying is free.
* **Running out of credits stops the run, once.** It is an account-level fact,
  not a per-record failure: every remaining call would fail identically, so the
  sync logs one warning and stops rather than emitting a hundred identical errors.
* **`autoStart` is false.** Enrichment spends the customer's credits. Starting
  the moment a connection is created would spend them without an explicit
  decision, so the sync is enabled deliberately.

## Deploying

The CLI authenticates from `NANGO_SECRET_KEY_DEV` / `NANGO_SECRET_KEY_PROD` —
note the suffixes, a plain `NANGO_SECRET_KEY` is ignored.

```bash
cd nango-integrations
npm install
cp .env.example .env      # then put the real keys in .env
npm run compile           # typecheck + build, no credentials needed to validate
npm run deploy:dev        # or deploy:prod
```

This is a **zero-YAML** integration. The CLI discovers scripts only through
`index.ts` at the root of this folder — a script that is not imported there is
invisible to `compile`, `dryrun` and `deploy`, however correct it is. Add the
import when you add a script. The `.nango/` folder must also exist; its presence
is what makes this "a Nango folder" as far as the CLI is concerned.
