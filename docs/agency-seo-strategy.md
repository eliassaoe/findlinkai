# The agency side: an SEO strategy for done-for-you outbound

**Date:** 2026-09-05 · **Sources:** PostHog 263837, Supabase `snxhsboboatjywgwdeds`, live SERP research.

The business is now two things — a self-serve SaaS and a done-for-you outbound
service — and the site reflects only the first. This is the plan to make the
second rank.

## Where it stands, measured

| Page | Visitors (lifetime) | From Google | Live since |
| --- | --- | --- | --- |
| `/done-for-you-outbound` | **2** | **0** | 24 Aug 2026 |
| `/prospection-b2b` | **1** | **0** | 4 Sep 2026 |

Against ~7,500 visitors/month site-wide, 85% from search, across 210 pages.

Three causes, in order of how much they matter:

1. **Zero internal links.** Exactly one file in the repo references
   `done-for-you-outbound` — the page itself. The domain authority the rest of
   the site has accumulated does not reach it. This is the whole mechanism and
   it is not connected.
2. **The page targets no keyword.** Title is *"Done-For-You Outbound |
   LinkFinder AI"*; H1 is *"The outbound engine that never sleeps."* A category
   name and a slogan. The tool pages rank because they are named after what
   people type — `/linkedin-email-finder`, `/linkedin-phone-number-finder`.
3. **It is one orphan page.** A service that is half the business needs a
   cluster, not a leaf.

## Architecture: a second pillar on the same domain

**Same domain, not a subdomain.** The entire advantage here is authority the
domain already has; a subdomain forfeits it and starts from zero. Build
`/outbound/` as a hub with its own children, parallel to the tool pages.

    /outbound/                            <- hub, the money page
      /outbound/appointment-setting       <- head term
      /outbound/pay-per-meeting           <- the wedge (see below)
      /outbound/pricing                   <- commercial intent
      /outbound/vs/<competitor>           <- alternatives cluster
      /outbound/for/<vertical>            <- use-case cluster

Keep the two pillars visually and structurally distinct. A visitor who came for
a free LinkedIn lookup and a visitor shopping for an agency are different
people; the failure mode is a page that tries to be both.

## The four keyword clusters

### 1. Service head terms — the volume
`b2b appointment setting services` · `lead generation agency` ·
`outsourced sdr` · `cold email agency` · `outbound agency` ·
`sdr as a service` · `b2b lead generation services`

Competitive: Belkins, SalesRoads, EBQ, UnboundB2B, CIENCE all rank here with
real domain authority and years of content. Do not lead with these. Build them
as the hub's supporting pages and expect them to take months.

### 2. Pricing and commercial intent — **the wedge, start here**
`pay per meeting lead generation` · `pay per appointment lead generation` ·
`b2b appointment setting cost` · `lead generation agency pricing` ·
`cost per qualified meeting` · `appointment setting pricing 2026`

This is the opening. Measured market rates in 2026:

| Segment | Market rate per meeting |
| --- | --- |
| SMB | $150–500 |
| Mid-market | $300–900 |
| Enterprise | $800–2,500+ |
| Hybrid retainer models | ~$2,500/mo base + $150–300/meeting |

**LinkFinder's price is $150 per meeting held, no retainer.** That is at or
below the bottom of the SMB band with none of the base fee. On a page about
what appointment setting costs, that number is the argument — it does not need
selling, only publishing. Pricing keywords are lower volume than head terms and
far higher intent: nobody searches "appointment setting cost" idly.

### 3. Competitor alternatives — reuse the machine, change the audience
`belkins alternative` · `salesroads alternative` · `cience alternative` ·
`martal alternative` · `ebq alternative` · `lead generation agencies compared`

`generate_pseo_pages.py` and `add_related_pages.py` already produce exactly this
page shape — 69 of them exist for software competitors.

**Why this will not repeat the listicle failure.** Per
`docs/listicle-aeo-results.md`, tool listicles convert at 1.3% because someone
searching "best linkedin scraper" wants a tool they run themselves. Someone
searching "Belkins alternative" wants **an agency to do it for them** — which is
the offer. Same page format, opposite intent. That distinction is the whole
reason this cluster is worth building and the tool listicles were not.

### 4. Vertical use-cases — the long tail
`appointment setting for saas` · `lead generation for agencies` ·
`outbound for recruiters` · `appointment setting for consultants`

Cheapest pages to produce, lowest competition, and they qualify the lead before
the call.

## The bridge: how the authority actually moves

This is the part that is missing today and it is one change.

The tool pages carry **15,423 visitors** and convert at 3.8% to signup — the
biggest traffic block on the site. Add a single contextual block, low in the
page body (not the primary CTA), on the top ~20 tool pages:

> **Doing this by hand every week?** We build the list, run the outbound and
> book the meetings. You pay per meeting held. → *See how done-for-you works*

Two effects, and the second is the important one:

- A small number of tool visitors click through. Per
  `docs/traffic-capture-verdict.md` this will be a *small* number — that
  audience is defined by wanting to do it themselves, and that finding stands.
- **Every one of those pages passes internal link equity to `/outbound/`.**
  That is the mechanism for "use our domain authority", and it works whether or
  not anyone clicks.

Do not make this the page's primary CTA. `sales_call_intercept` pitched a call
to broad traffic and was dismissed by 92% of the people who saw it.

## Two link magnets worth building

Per the format that already works on this site (tool pages at 3.8% vs listicles
at 1.3%), the two assets most likely to earn links and citations:

1. **"What B2B appointment setting actually costs in 2026"** — a sourced,
   dated, primary-referenced pricing breakdown. Journalists, bloggers and AI
   answer engines need a citable number for this and there is no neutral source.
   It also frames the $150 without arguing for it.
2. **A cost-per-meeting calculator** — free tool, no signup. Input target
   meetings/month, compare retainer vs pay-per-meeting. Free tools are the
   format this site already ranks with.

## Sequence

| Phase | Work | Why first |
| --- | --- | --- |
| **1** | Rewrite `/done-for-you-outbound` title + H1 around `b2b appointment setting`; move to `/outbound/`; add internal links from top 20 tool pages | Zero-cost, unblocks everything, fixes the actual defect |
| **2** | Build `/outbound/pay-per-meeting` and `/outbound/pricing` | Highest intent, lowest competition, the price is the argument |
| **3** | Alternatives cluster via the existing pSEO scripts | Machine already exists |
| **4** | Pricing-cost link magnet + calculator | Earns the links the head terms need |
| **5** | Head terms | Only viable once 1–4 have built topical depth |

## Measurement

Do not judge this on pageviews — `docs/listicle-aeo-results.md` is the
cautionary case, where traffic 5x'd and produced two payers. Judge on:

    dfy_call_booked (see /call-booked) segmented by first-touch landing page

That event now exists and carries attribution. Booked calls per landing page is
the only number that matters here.

## What not to do

- **No subdomain.** Forfeits the authority this entire plan is built on.
- **No "best appointment setting companies" listicle with yourself at #1.**
  That is the 1.3% pattern, and it ranks your competitors on your own domain.
- **Do not aim the offer at existing tool traffic as the primary play.**
  `docs/traffic-capture-verdict.md` measured that and it does not work. The
  internal links are for authority; the leads come from new service-intent
  search.
