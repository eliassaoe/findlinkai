# n8n: G2 → LinkFinder → Instantly

Import `g2-to-instantly.json`. Create three **Header Auth** credentials named
exactly as the nodes expect:

| credential name | header | value |
| --- | --- | --- |
| `G2 API token` | `Authorization` | `Bearer <G2_API_TOKEN>` |
| `LinkFinder API key` | `Authorization` | `Bearer <LINKFINDER_API_KEY>` |
| `Instantly API key` | `Authorization` | `Bearer <INSTANTLY_API_KEY>` |

Then open **Config** and set the campaign id and the category list.

## What n8n actually fixes, and what it does not

Three things failed while building this, and only one of them was transport:

| failure | cause | does n8n fix it |
| --- | --- | --- |
| G2 connector dropping mid-run | the chat session's MCP link | **yes** — this calls the REST API directly, on a schedule, with no session to lose |
| LinkFinder "We are on maintenance" | the Apify actor behind their API | **no** — identical response over REST. Handled, not fixed |
| Instantly 7,089 / 1,000 lead cap | the plan | no |

Worth being blunt about: moving to n8n buys scheduling, retries and
independence from a live session. It does not make an upstream provider
more truthful. The workflow is built to survive that provider, not to
pretend it is reliable.

## On scraping G2 with an Apify actor

Tempting, because the official API on a buyer-scoped token only returns a
category's **top few** products, and a scraper would see the whole listing.

Not recommended as the primary path:

- G2 sits behind Cloudflare and actively blocks scrapers, so it breaks
  exactly when you stop watching it — which is the opposite of why you are
  moving to n8n.
- It breaks G2's terms, and this pitch depends on being credible to the
  companies being scraped.
- The API token is already yours, already paid for, and does not get blocked.

The top-few limit is real but it is not the binding constraint: **narrow
categories** make it irrelevant, because a narrow category's top few *are*
the category. Measured: ~1.6 usable prospects per narrow category, and 0
from broad ones like Sales Engagement, whose top five were Salesforce,
HubSpot, Apollo, ActiveCampaign and Salesloft.

**Do not buy a G2 seller plan to fix this.** An earlier version of this file
suggested it; that was an inference from how the connector classifies the
account, not something verified, and the economics kill it anyway. Claiming a
profile is free, but paid vendor tiers run **$21,300–$28,300 a year**, with
multi-product deals reaching $50k–$95k. That is a five-figure annual spend to
widen a listing endpoint that narrow categories already work around for
nothing. There is also no confirmation that any tier exposes `/products` to
an API token — the paid tiers are sold on branding, analytics and lead gen.

**Claim the free profile anyway, for a different reason entirely.** A G2
profile is one of the pages that assistants synthesise when someone asks for
the best tool in a category, and it ranks. This service sells listicle
placement; G2 is the largest listicle in B2B software, and LinkFinder AI
should be in its own categories on it. That is the same work we would charge
a client for, done on ourselves, at no cost. Search for the product on G2,
click the Unclaimed box, and follow the prompts — 1–3 business days to
approve, 3–5 more for the research team to categorise it.

## The two design decisions worth keeping

**Capacity is checked before anything metered.** Node order is capacity →
source → enrich → push, by what each step costs. The obvious order (source,
enrich, upload) is wrong: with the workspace over its cap, every upload
403s, but only after LinkFinder has been paid for each lookup. The run now
refuses to start instead.

**Real data wins over status rows.** The classifier looks for a usable
person *first*, and only asks why it failed when it actually failed. The
actor injects a chatty banner row alongside genuine results, so checking
for sentinels first would throw away a good lead and pay to look it up
again. Only when there is no person does it separate "No Leads found"
(a real empty answer — accept it) from "We are on maintenance" (the
provider — retry it).

Both are tested by executing the node code directly:

    node outbound/n8n/test-classifier.js

---

# Multi-source workflow (`multi-source-to-instantly.json`)

Three sources → one shape → dedupe → enrich → Instantly. Import it, add a
fourth credential alongside the three above:

| credential name | header | value |
| --- | --- | --- |
| `Product Hunt token` | `Authorization` | `Bearer <PH developer token>` |

Get that token from your app's page on `api.producthunt.com` — v1 was
deprecated in 2023, v2 GraphQL is the live one. Hacker News needs no
credential at all.

## Why three sources rather than a better scraper

Reliability here does not come from any single source being good. It comes
from no single source being able to stop the run. Every branch has
`neverError` set, so a source that is down, rate-limited or has quietly
changed its schema contributes zero rows instead of failing the workflow. A
day with two sources is a smaller day, not a failed one.

That is worth more than a scraper with a deeper tail, because the scraper's
failure mode is *silent and total* and arrives on a morning you are not
watching.

| source | auth | cost | finds |
| --- | --- | --- | --- |
| G2 | your token | free | listed, reviewed, established — a real category name |
| Product Hunt | free dev token | free | launched recently, still small |
| Hacker News | **none** | free | shipped this week, developer tools |

They also disagree usefully. G2 lists a company once it has reviews, which
is late. Product Hunt catches it at launch. Show HN catches it before that.
Same band, three different moments.

## The normalised record

Every source emits the same shape, which is what lets one enrichment path
and one campaign serve all three:

```
{ source, domain, company, category, signal, signalValue, campaignId }
```

`signal` and `signalValue` are deliberately generic — reviews, upvotes and
HN points are the same idea wearing different clothes: *small but real*. The
campaign renders `signalValue` into `{{reviewCount}}`, and `source` rides
along so a reply can be attributed to whichever source found it. After a
month, that tells you which source to keep paying attention to.

## Deduplication is not optional

Three sources will surface the same company twice — a product on G2 that
also launched on Product Hunt is the normal case. Mailing it from two
branches is the fastest way to look like a bot.

When a domain arrives twice the deduper keeps the row with the most specific
category, ranking G2 (a real category name) over Product Hunt (a topic) over
HN (just "software"). The category is rendered into the opener's first line,
so specificity there is worth something.

## Host exclusions matter more than you would think

Product Hunt's `website` field is frequently a `producthunt.com/r/...`
redirect, and HN stories link to GitHub, Notion, Vercel and YouTube as often
as to a company. None of those are a company. Without `excludeHosts` the
pipeline cheerfully pays to look up a decision maker at github.com.

## Tests

    node outbound/n8n/test-multisource.js

Runs each normaliser and the deduper against real response shapes: tracking
params stripped, redirect hosts dropped, bands enforced, a giants-only
category skipped, and one row per domain with the best category winning.

---

# `reliable-outbound.json` — the one to actually run

One workflow, hourly, with a queue. Import it and add the same credentials
(G2, LinkFinder, Instantly — Hacker News needs none).

## Reliability here means repetition, not a better provider

Nothing upstream got more dependable. What changed is that a bad hour costs
nothing: sourcing fills a queue that lives in n8n's own workflow storage, and
every run takes a small batch off it. A domain that does not resolve this
hour is simply still there next hour.

That is why the trigger is hourly rather than daily. Same number of attempts,
five hours instead of five days.

## Not finding a person is a normal outcome

If LinkFinder has no decision maker for a domain, that is an answer, not an
error. The domain is marked done, the loop continues to the next one, and it
is never sourced or paid for again. Nothing halts, nothing retries, nothing
gets logged as a failure.

The only thing that comes back for another go is the provider's own
maintenance sentinel — because that says nothing about the company, so
writing it off would throw away a lead for someone else's outage. Three
attempts, then it moves on too.

| what came back | what happens |
| --- | --- |
| a person with an email | pushed to the campaign, marked done |
| no person | marked done, continue |
| maintenance sentinel | back on the queue, up to 3 tries, then done |
| upload failed | back on the queue — we already paid to enrich it |

## It refuses to waste money

The run reads the Instantly lead cap first. Over the cap, it stops before a
single enrichment call: the uploads would 403 anyway, and the queue loses
nothing by waiting. Under it, the batch is capped to the room available.

## Watching it

The last node emits a summary — queue remaining, finished, pushed, written
off, retries, runs. Read it in the executions list to see whether the
pipeline is healthy without opening anything.

    node outbound/n8n/test-reliable.js

15 cases run the queue logic against real payload shapes.

## Do you need a G2 API key?

Only if you want the G2 source. Set `useG2: false` in **Config** and the run
sources from Hacker News alone, which needs no credential of any kind.

Worth checking before you leave it on: a G2 *account*, and even a working G2
MCP/OAuth connection, is **not** the same thing as an API token for
`data.g2.com`. If you do not have that token, leaving `useG2: true` fails
the entire run — a missing credential is a node-level error in n8n, and
`neverError` does not catch it because that option only suppresses HTTP
error *responses*.

With `useG2: false` the G2 fan-out emits zero items, so the request node
never executes and never asks for the credential. Belt and braces, the node
also carries `onError: continueRegularOutput`, so a present-but-broken
credential, a timeout or a DNS failure tops the queue up with nothing
instead of killing the run.

| credential | needed when |
| --- | --- |
| `Instantly API key` | always — the capacity check and the push both use it |
| `LinkFinder API key` | always — it is the enrichment step |
| `G2 API token` | only with `useG2: true` |
| *(Hacker News)* | never — no auth |
