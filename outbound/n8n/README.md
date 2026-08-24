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

If you ever do want the full listing, the legitimate route is a G2 seller
plan, which unlocks the `/products` endpoint the buyer token cannot use.

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
