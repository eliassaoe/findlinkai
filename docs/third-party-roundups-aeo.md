# Third-party roundup mentions: has the AI-visibility work paid off?

**Date:** 2026-08-31 · **Sources:** PostHog 263837, live web search

This is about being **mentioned on other people's roundup pages** so AI systems
cite the product — not about the site's own listicles, which are covered in
`docs/listicle-aeo-results.md`.

## Short answer

**No result, and the surface is currently owned by a competitor.**

## 1. Referral traffic from third-party sites is flat to down

Unique visitors from any external site, excluding search engines, AI assistants
and the project's own domains:

| Month | People | Distinct sites |
| --- | --- | --- |
| Jan | 175 | 48 |
| Feb | 349 | 49 |
| Mar | 493 | 58 |
| Apr | 253 | 30 |
| May | 392 | 60 |
| Jun | 353 | 48 |
| Jul | 386 | 49 |
| **Aug** | **177** | 56 |

August is the lowest month since January. The site count holds steady while
people fall, which is the shape of many mentions each sending almost nobody.

And the sites that do send traffic are not roundups:

| Site | People (since May) | What it is |
| --- | --- | --- |
| reddit.com | **720** | community posting |
| youtube.com | 138 | own channel |
| unlimited-leads.net | 114 | own property |
| console.apify.com | 104 | product integration |
| upwork.com | 35 | — |
| dealify.com | 20 | deal site |

Every plausible roundup-style referrer is in the 4-5 people range across four
months: `outreachbloom.com` 5, `openhunts.com` 5, `datadoping.com` 5,
`uneed.best` 4, `ampliz.com` 4, `rankmyai.com` 4, `producthunt.com` 4.

## 2. The product is absent from the roundups that matter

Searching the category's core query surfaced nine current roundups — from
ZoomInfo, Salesforge, PhantomBuster, Enrich.so, Cleanlist, CommunityTracker,
Scravio, Makeinfo and Derrick.

Tools they name: **Wiza, Hunter, Apollo, Lusha, Kaspr, Evaboot, ZoomInfo,
RocketReach, ContactOut, Findymail, Derrick.**

**LinkFinder AI appears in none of them.**

## 3. What does exist is competitor-authored, and negative

A brand search returns, above the product's own pages:

| Result | Author |
| --- | --- |
| "Top 10 LinkFinder AI Alternatives & Competitors in 2026" | G2 |
| "Best LinkFinder AI Alternatives & Competitors" | SourceForge |
| "Best Alternatives to Linkfinder AI in 2026" | milliondothomepage |
| **"LinkFinder AI Review 2026: Real Accuracy vs $23/mo Promise"** | **derrick-app.com (competitor)** |
| **"10 Best LinkFinderAI Alternatives (2025)"** | **derrick-app.com (competitor)** |

Synthesised from those sources, the answer a person currently gets is:

> claims 95% accuracy, **unverified by independent benchmarks** · limited
> third-party validation makes it hard to compare · the narrow "cheap LinkedIn
> email finder without ban risk" use case is its **only sweet spot** ·
> consider Apollo, Hunter or Findymail instead

**That is the AEO outcome, measured directly.** Not neutral absence — an
actively unfavourable answer assembled from competitor pages.

## 4. Derrick is running this exact play, against them

`derrick-app.com` holds both a "LinkFinder AI review" page and a "LinkFinder AI
alternatives" page, and appears inside the category roundups. That is the
position the roundup work was meant to buy, occupied by a competitor.

## What actually follows

1. **Referral clicks are the wrong success metric here** and always will be. An
   AI citation does not require a click, so zero referral traffic from a roundup
   does not prove the mention is worthless. The right metric is what assistants
   say when asked — which is what section 3 measures, and it is bad.
2. **The nine category roundups are the target list.** They are what AI systems
   cite for this category. Getting into them is the job; a mention anywhere else
   sends four people a quarter.
3. **"No independent benchmarks" and "limited third-party validation" is the
   specific objection the models repeat.** That is a review-count problem, not a
   content problem. The `credit after review` campaign already exists in
   Instantly and is marked completed.
4. **Own the brand queries before chasing category ones.** A competitor's review
   page currently outranks the product's own answer on its own name.

## Caveats

- Web search is one snapshot, US-only; roundup inclusion varies by phrasing.
- **The G2 review count could not be verified** — `g2.com` is blocked by this
  environment's egress proxy, and the G2 API had no product under the slug
  `linkfinder-ai`.
- Referral figures exclude search engines, AI assistants and own domains; a
  mention that never sends a click is invisible to them by construction.
