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

## Is Derrick the cause? Mostly no — and the play is symmetric

It is tempting to read Derrick's two pages as the problem. Three things argue
against that.

**The same play is already being run in the other direction.** This repo holds
**33 competitor-alternative pages**, including `derrick-app-alternative.html` —
"Best Derrick App Alternatives in 2026: Top 5 Compared" — live since
2025-12-13, plus pages targeting Hunter, Clay, ZoomInfo, Apollo, Wiza and
Findymail. This is standard category SEO, not sabotage.

**But it is being lost badly.** Traffic to those pages, lifetime:

| Page | Live since | People | from Google |
| --- | --- | --- | --- |
| `/clay-alternative` | 2025-12-15 | 52 | 21 |
| `/derrick-app-alternative` | 2025-12-13 | **27** | 12 |
| `/apollo-api-alternative` | 2026-06-15 | 6 | 7 |
| `/hunter-io-alternative` | 2026-08-16 | 3 | 1 |
| `/zoominfo-alternative` | 2026-07-12 | 2 | 0 |

Eight months of the Derrick page produced **27 visitors**. Derrick's LinkFinder
pages sit on the first page of a brand search.

**The vacuum is the real cause.** The objections the models repeat are
"unverified by independent benchmarks" and "limited third-party validation" —
neither of which Derrick wrote. Their page is loud because nothing else is
there. Against a few hundred G2 reviews it would be one voice among many.

And Derrick's own visibility comes from **being inside the nine category
roundups**, not from writing about LinkFinder. Presence is what earns citation;
the competitor page is a footnote to it.

So: answering with more alternative pages is the move that has already been
tried for eight months and returns 27 visitors.

## The reviews exist — but not where the models look

Checked 2026-08-31, after the point was raised that ~50 reviews already exist.

| Surface | What is visible | Cited in the category comparison? |
| --- | --- | --- |
| **Trustpilot** | 4 stars, **38 reviewers** (US page); 4.5/5 from 18 on the CA page | **No** |
| **G2** | **1 review** ("LinkFinder AI Products \| Read 1 Reviews on G2") | Yes — as an alternatives page |

Two things follow.

**Trustpilot is real social proof but the wrong currency for this category.** In
the roundup comparison run earlier, the model counted **G2** reviews explicitly —
Hunter "540+ G2 reviews", Apollo "9433+ reviewers" — and never once mentioned
Trustpilot. For B2B software, G2 and Capterra are what gets cited; Trustpilot
skews consumer and e-commerce. 38 Trustpilot reviews are worth having on the
site's own pages, and are near-invisible to a model comparing enrichment tools.

**So "limited third-party validation" was accurate, not unfair.** It was
comparing 1 to 540 and to 9,433.

*Note: the visible Trustpilot count is 38, not 50. And the G2 count of 1 comes
from a search result title — it could not be confirmed through the G2 API,
because the G2 account connected to this session owns no products (it is a buyer
account, not the LinkFinder seller account), and g2.com itself is blocked by the
egress proxy.*

## A brand collision nobody has accounted for

Two of the top results for a "LinkFinder review" query are about a **different
product entirely** — an SEO link-building tool also called LinkFinder:

- `linkfinder-review.com` — "Linkfinder Review: The Best AI Tool for Netlinking in 2026"
- `affmaven.com` — "LinkFinder Review 2026: The Link Building Tool Every SEO Needs?"

Anyone — or any model — researching "LinkFinder review" lands partly on a
netlinking tool. That dilutes every brand query and is a plausible contributor to
how thin and confused the picture is. Worth deciding whether the product is
consistently "LinkFinder AI" everywhere, and whether the disambiguation is worth
pursuing.

## What actually follows

1. **Referral clicks are the wrong success metric here** and always will be. An
   AI citation does not require a click, so zero referral traffic from a roundup
   does not prove the mention is worthless. The right metric is what assistants
   say when asked — which is what section 3 measures, and it is bad.
2. **The nine category roundups are the target list.** They are what AI systems
   cite for this category. Getting into them is the job; a mention anywhere else
   sends four people a quarter.
3. **The review gap is specifically a G2 gap, not a review gap.** 38 Trustpilot
   reviews already exist and buy nothing in this category; G2 shows 1. Moving
   review generation to G2 is the single highest-leverage AEO action available —
   1 to 30 changes what a model can say about third-party validation. The
   `credit after review` campaign already exists in Instantly, marked completed;
   restarting it pointed at G2 specifically is the move.
4. **Own the brand queries before chasing category ones.** A competitor's review
   page currently outranks the product's own answer on its own name.

## Caveats

- Web search is one snapshot, US-only; roundup inclusion varies by phrasing.
- **The G2 review count could not be verified** — `g2.com` is blocked by this
  environment's egress proxy, and the G2 API had no product under the slug
  `linkfinder-ai`.
- Referral figures exclude search engines, AI assistants and own domains; a
  mention that never sends a click is invisible to them by construction.
