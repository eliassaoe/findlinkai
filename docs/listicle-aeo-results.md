# Did the listicle / AEO work produce anything?

**Date:** 2026-08-31 · **Source:** PostHog 263837

## Short answer

**Yes on traffic, no on customers.** The listicles grew from 175 visitors a month
to a peak of 881, then fell back to 374. But they convert at **1.3%** — the worst
landing type on the site, ten times worse than the homepage.

So "no visible result" is wrong about traffic and right about outcome.

## Do not date these pages from git

The repository history was force-rewritten and **every commit begins 2026-08-23**.
`git log --diff-filter=A` reports all 69 listicle and alternative pages as created
that day. That is the rewrite date, not the publication date.

First recorded pageview is the reliable signal, and it says most of these pages
have existed since **December 2025**:

| Page | First pageview | People (lifetime) |
| --- | --- | --- |
| `/best-social-media-finder` | 2025-12-22 | **1,558** |
| `/best-proxy-providers` | 2025-12-11 | 279 |
| `/best-lead-generation-api` | 2025-12-26 | 244 |
| `/best-instagram-scrapers` | 2025-12-21 | 131 |
| `/best-linkedin-scraping-api` | 2026-06-13 | 58 |

## They worked as traffic

Monthly traffic to all listicle / alternative / competitor pages:

| Month | People | of which from Google |
| --- | --- | --- |
| Jan | 175 | 24 |
| Feb | 249 | 76 |
| Mar | 330 | 172 |
| Apr | 685 | 533 |
| **May** | **881** | **715** |
| Jun | 467 | 288 |
| Jul | 618 | 515 |
| Aug | 374 | 274 |

That is a genuine 5x climb from January to May, driven almost entirely by Google.
The work ranked. Since May it has fallen about **57%**, in step with the
site-wide Google decline recorded in `docs/channel-bet-youtube-vs-seo.md`.

## But they are the worst-converting pages on the site

First-touch landing page to signup, since 2026-06-01:

| Landing type | Visitors | Signups | Rate | Payers |
| --- | --- | --- | --- | --- |
| other | 4,467 | 609 | **13.6%** | 10 |
| homepage | 3,408 | 454 | **13.3%** | 7 |
| tool pages | 15,423 | 589 | 3.8% | 4 |
| **listicle / alternative** | **1,313** | **17** | **1.3%** | **2** |

**1,313 visitors over three months produced 17 signups and 2 payers.**

A visitor landing on a roundup is ten times less likely to sign up than one
landing on the homepage. That is the shape of research-intent traffic: people
comparing tools, not people with a job to do.

## What this means, honestly

1. **The listicle bet is not unproven — it is measured.** It produced traffic and
   almost no customers. That is a result, not an absence of one.
2. **The decline is the same Google decline** hitting everything else, not a
   listicle-specific failure.
3. **Tool pages convert 3x better and AI systems actually read them** (see
   `docs/ai-traffic-2026-08.md` — `/linkedin-search-by-email` and
   `/company-employee-finder` take 92% of all AI agent fetches, while the
   roundups are fetched in single digits).
4. **AEO proper has not been tested at all.** The two campaigns that would test
   it are drafts on 38 mailboxes that cannot send.

If the goal is customers rather than sessions, the evidence points at the
do-one-job tool pages, not more roundups.

## Caveats

- First-touch attribution within the stated window; person merging at signup can
  reassign earlier anonymous events.
- "First pageview" is a floor for publication date — a page could have existed
  earlier with no traffic.
- The `other` bucket is heterogeneous (docs, blog, integrations, campaign
  landings) and is shown for scale, not as a clean comparison.
