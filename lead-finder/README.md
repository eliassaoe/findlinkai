# Lead finder — Claude picks the audience, LinkFinder AI finds the people

An agent that turns "who should I be talking to" into a list of named people with
verified email addresses in an outreach campaign, run from a Claude conversation.

The split matters, and it is the whole design:

| | Does | Cannot do |
| --- | --- | --- |
| **Claude** | Work out the ICPs from your site, choose which intent signals are worth watching, read a rejection tally and fix the ICP, write the first line of every email | Know who reacted to a competitor's post last Tuesday, or what their email address is |
| **LinkFinder AI** | Return exactly those people, and their contact details | Decide which of them are worth contacting |
| **This repo** | Score, dedupe, cap the spend, and push what survives into a campaign | — |

An assistant on its own writes a plausible list of job titles. This turns it into
a list of people who did something last week.

## What a run does

```
sources                  ICP rules + intent score        enrichment            push
──────────────────       ────────────────────────        ──────────           ──────
competitor post   ─┐     hard filters reject             email lookup    ─┐
"CRM is a mess"    ├──►  score = signals + fit    ──►     on the top N     ├──► Instantly
target accounts   ─┘     seen-before is skipped          10 credits each  ─┘    or CSV
   1 credit/record        0 credits                                      
```

Everything cheap runs before anything expensive. Sourcing bills about a credit a
record; an email lookup is ten and is charged even when it comes back empty. So the
scoring, the ICP filters and the seen-list all run *first*, and the enrichment loop
then works down a list already sorted by how much each lead is worth.

## Quick start

```bash
export LINKFINDER_API_KEY=...        # API & MCP tab in the app
cd lead-finder

node bin/lead-finder.mjs plan agents/revops-hubspot.json     # prices the run, spends nothing
node bin/lead-finder.mjs run  agents/revops-hubspot.json     # dry run: sources and scores, no enrichment
node bin/lead-finder.mjs run  agents/revops-hubspot.json --live --max-credits 400
node bin/lead-finder.mjs export agents/revops-hubspot.json --out leads.csv
node bin/lead-finder.mjs report agents/revops-hubspot.json
```

`run` is a dry run unless you pass `--live`. A dry run still makes the sourcing calls
— there is no way to know who is out there without them — and it tells you exactly
who it *would* enrich and what that would cost, before you agree to it.

## The agent file

One JSON file per search. `agents/revops-hubspot.json` is a worked example: the ICP
from `OUTBOUND-CRM-AUDIT.md`, pointed at two competitor posts and one target account.

```jsonc
{
  "id": "revops-hubspot",                 // names the state and run files
  "icp": {
    "titles":  { "include": ["revops", "vp sales"], "exclude": ["intern"] },
    "seniority": ["vp", "director", "head"],
    "departments": ["Sales"],
    "countries": ["United States"],
    "excludeCompanies": ["apollo.io", "instantly.ai"],   // competitors, and yourself
    "companySize": { "min": 11, "max": 500 }
  },
  "sources": [
    { "id": "competitor-post", "kind": "linkedin_post_reactions",
      "input": "https://www.linkedin.com/posts/...", "weight": 3, "maxItems": 150 },
    { "id": "accounts", "kind": "company_employees", "by": "domain",
      "input": "hubspot.com", "seniority": "Director", "weight": 1, "maxItems": 25 }
  ],
  "enrich": { "email": true, "minScore": 4, "maxPerRun": 40 },
  "budget": { "maxCreditsPerRun": 1200 },
  "destination": { "id": "instantly", "target": { "id": "campaign-uuid" } }
}
```

### Sources

| Kind | What it is | Weight it like |
| --- | --- | --- |
| `linkedin_post_reactions` | Everyone who reacted to one post. An **intent** signal — they did this recently, and the reason to contact them is on the record. | 2–3 |
| `company_employees` | Employees at a named account, filtered by department and seniority. No timing signal at all — it fills in accounts you already decided to target. | 1 |

Both bill per record returned, so `maxItems` is a spend cap rather than a preference.
Post URLs go stale: engagement on a six-month-old post is not intent, so a routine
needs its post URLs refreshed, not just re-run.

### Scoring

Score = the weight of every source the person turned up in, plus:

- **+2 per extra source.** Two independent signals beat one loud one.
- **+2** their seniority is one you named, **+1** their department is.
- **+1** for a reaction more deliberate than a like.

`enrich.minScore` is the line where you start spending. `enrich.maxPerRun` caps the
number of *lookups* a run pays for — not the number of leads it ends up with, because a
lookup that finds no address costs the same ten credits as one that works.
`budget.maxCreditsPerRun` is the harder ceiling; whichever binds first stops the run,
and the summary says which.

### What it will not do twice

State lives in `runs/<agent>.state.json`. Anyone already enriched is skipped forever —
that is the difference between a weekly routine and a weekly re-purchase. Someone
*seen* but never enriched is deliberately not skipped: they were below the threshold
last week, and if they show up in a second source this week they cross it.

## Credit costs

From `integrations/catalog/operations.json`, which the rest of the repo generates from:

| Operation | Cost |
| --- | --- |
| Post reactions | 1 credit per person returned |
| Employee list | 1 credit per employee returned |
| Email from a LinkedIn profile | 10 credits per lookup, **charged even when empty** |
| Phone from a LinkedIn profile | 50 credits per lookup |

`plan` prices the worst case before anything runs. The catalog and the app's own
`employee_count` help text disagree about employee-list billing (1 vs 0.5 a record);
this uses 1, because over-estimating a cap fails safe.

## Where the leads go

`destination` is any of the twelve adapters in `integrations/outreach/destinations/`
— Instantly, Smartlead, lemlist, HubSpot-adjacent tools and the rest. Leave it out and
the run just writes `runs/<agent>.leads.json`, which `export` turns into a CSV.

Only leads that actually have an email are pushed. Everything else is reported with
its reason rather than silently dropped.

## Running it on a schedule

`.github/workflows/lead-finder.yml` runs an agent on a cron. It defaults to `plan`,
so the schedule alone never spends a credit — a live run has to be asked for, with a
credit cap, and it commits the updated state back so the next run knows who it has
already paid for.

## Tests

```bash
npm test        # 41 tests, no network
```

Every network call goes through an injected `client`, so a full run — sourcing,
scoring, dedupe, budget exhaustion, a dead source, a push — is exercised offline.
