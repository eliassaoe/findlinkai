# Sourcing B2B SaaS leads from G2 — the options, ranked

Written down because the session that researched it does not survive.
Caveat up front: `apify.com` is blocked by the sandbox egress proxy, so the
actor entries below come from search results, **not** from reading their
input schemas or run statistics. Test any of them on one category before
building on it.

## The bottleneck is not the source

Worth settling first, because it changes what is worth optimising.

Three things have to work to turn a G2 category into a sendable lead:

| step | state today |
| --- | --- |
| find the company | **works** — G2 API, reliably |
| find a person and a verified email | **flaky** — ~50% maintenance sentinel |
| upload it | **blocked** — 7,089 leads against a 1,000 cap |

A perfect G2 source changes nothing while step 2 returns a status message
half the time and step 3 refuses every write. Sourcing is already the most
reliable link in the chain. Fix the other two first, or a better scraper
just produces a longer list of domains nobody can be reached at.

## Option 1 — the official G2 API (currently used)

- **Reliability: high.** A token, no Cloudflare, no blocking, no ToS risk.
- **Limit:** a buyer-scoped token returns only a category's *top* products.
  `/products` returns 0 rows for every filter.
- **Cost:** already paid for.

The top-N limit sounds fatal and is not: in a *narrow* category the top few
**are** the category. Measured yield across this project — **~1.6 usable
prospects per narrow category, 0 per broad one**. Sales Engagement returned
Salesforce, HubSpot, Apollo, ActiveCampaign and Salesloft; Website Privacy
Auditing returned four usable prospects from five products. Same single call.

With ~2,287 categories, this ceilings out in the high hundreds. That is more
than the offer needs before it has a single customer.

## Option 2 — an Apify G2 actor

Several exist. The ones whose descriptions match *sourcing* rather than
review-mining:

| actor | what it claims |
| --- | --- |
| `maximedupre/g2-products-scraper` | products by category name, search term, slug or URL; names, ratings, review counts, categories, pricing, alternatives |
| `scrapeai/g2-search-products-scraper` | product search results |
| `jupri/g2-explorer` | category and product exploration |
| `zen-studio/g2-product-profile-scraper` | pricing, features, vendor data per profile |

Most G2 actors are built for **review intelligence** — pulling review text,
sentiment, reviewer firmographics — which is a different job from listing a
category. Pricing where quoted is per review (~$1.50/1,000), so a
review-oriented actor bills for volume we do not want.

- **Upside:** the full category listing, not the top few. This is the one
  thing the official API cannot give us.
- **Downside:** G2 sits behind Cloudflare. Scrapers against it break without
  warning, which is precisely the failure mode we moved to n8n to escape. It
  also breaks G2's terms, and this offer is sold *to the companies being
  scraped* — that is a bad thing to be caught doing.
- **Verdict:** worth one paid test run against a category we already know the
  answer for (Website Privacy Auditing → Osano 172, Ketch 170, ObservePoint
  81, Reflectiz 32). If it returns those plus a deeper tail, it earns a
  place as a *supplement*. It should not become the primary path.

## Option 3 — directories that are not G2

If the goal is "B2B SaaS companies, small, real", G2 is one of several. These
are worth a look before paying to scrape one that fights back:

- **Capterra / GetApp / Software Advice** (all Gartner Digital Markets) —
  same shape of data, three sites, one owner.
- **SaaSHub, AlternativeTo, Slant** — smaller, far less defended, and their
  long tail is *younger* companies, which is the band we want.
- **Product Hunt** — has a real API, and launch date is a better recency
  signal than review count.
- **Crunchbase / TheirStack / BuiltWith** — firmographic and technographic
  rather than review-based; BuiltWith answers "who runs HubSpot", which is a
  sharper filter for this offer than "who has 50 reviews".

The review-count band is a proxy for *small but real*. Any directory with a
popularity metric supports the same filter.

## Recommendation

1. Keep the official API as the primary source. It is free, reliable, and
   already produces more than the pipeline can currently act on.
2. Spend the money on **fixing enrichment**, not on sourcing. That is the
   step that actually fails.
3. If a deeper tail is genuinely wanted later, test one Apify actor against a
   known category and treat it as a supplement.
4. Add a second directory before adding a scraper — SaaSHub and Product Hunt
   are undefended and skew younger.
