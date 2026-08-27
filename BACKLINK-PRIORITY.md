# Which page deserves the backlink

Analysis date: 2026-08-27. Sources: Google Search Console (90d, 25 May – 24 Aug 2026)
and PostHog project 263837 (180d, first-touch attribution on organic-search sessions).

## Answer

**`/linkedin-email-finder`** — then `/linkedin-search-by-email` for the second link.

## Why not simply "the page with the most traffic"

The top GSC page is `/instagram-profile-url-finder` (4,947 clicks). In PostHog it is the
worst-converting page with meaningful volume: **1.59% signup rate, 0 payers** out of 5,295
first-touch people. Instagram traffic is not our buyer. Ranking it higher buys sessions,
not accounts. Do not spend link equity there.

## The model

A backlink is worth `extra clicks × signup rate of that page`.

* **Extra clicks** comes from ranking headroom: impressions we already earn but do not
  convert into clicks. CTR implies a rough average position; the model assumes a strong
  link closes half the gap to position 3.
* **Signup rate** comes from PostHog first-touch attribution — of everyone whose first
  session landed on that page from organic search, how many ever fired `signup_success`.

Payment events are NOT used as a ranking signal. Across 180 days, all channels combined,
only 26 payers carry session attribution (19 organic). Per-page payer counts are noise.
Signup→paid runs ~1.5% and is roughly flat across channels, so signup rate is the
best available proxy for commercial value.

## Ranking (top 8)

| Page | Clicks | Impressions | CTR | ~Pos | Signup % | Est. +clicks/90d | Est. +signups/90d |
|---|---|---|---|---|---|---|---|
| `/linkedin-email-finder` | 3,037 | 75,363 | 4.0% | ~7 | **6.57%** | +1,334 | **+88** |
| `/linkedin-search-by-email` | 2,556 | 62,176 | 4.1% | ~7 | **5.93%** | +1,050 | **+62** |
| `/linkedin-profile-scraper` | 1,758 | 62,596 | 2.8% | ~9 | 2.70% | +1,059 | +29 |
| `/instagram-profile-url-finder` | 4,947 | 79,957 | 6.2% | ~5 | 1.59% | +1,290 | +20 |
| `/linkedin-url-finder` | 1,407 | 33,333 | 4.2% | ~7 | 3.71% | +526 | +20 |
| `/company-employee-finder` | 319 | 73,492 | **0.4%** | ~22 | 4.38% | +342 | +15 |
| `/company-url-finder` | 433 | 16,052 | 2.7% | ~9 | 4.87% | +289 | +14 |
| `/best-lead-generation-api` | 35 | 37,642 | 0.1% | ~35 | 4.63% | +97 | +4 |

## The case for `/linkedin-email-finder`

1. Highest signup rate of any high-volume page: **6.57%** (235 signups from 3,575 people).
2. 75,363 impressions at 4.0% CTR — it sits around position 7. The demand already exists;
   authority is the missing input, not content.
3. It sells the 10-credit `linkedin_profile_to_email` enrichment, the core paid action.
4. It is the highest-intent tutorial keyword we rank for, so anchor text is natural for
   an editorial link.

## Runner-up: `/linkedin-search-by-email`

Nearly identical profile (5.93% signup, 62,176 impressions, ~position 7) and it carries
**5 of the 19 attributed organic payers** — more than any other content page. If two links
are available, this takes the second one.

## Sleeper: `/company-employee-finder`

73,492 impressions and a **0.43% CTR** — it ranks around position 20 on a keyword set as
large as our best pages, and still converts at 4.38%. Highest ceiling on the list, lowest
confidence (only 502 first-touch people). Worth a link once the two above are done, or
sooner if a cheap link presents itself.

## Do not link

`/linkedin-post-date-extractor` (44,785 impressions, **0.42% signup**),
`/find-company-employee-count` (72,991 impressions, 1.74%), `/best-proxy-providers`,
`/best-free-lead-generation-tools`, `/best-instagram-scrapers` (all 0 signups).
These are impression farms. Ranking them higher moves no revenue.

## Caveats

* Estimated position is inferred from CTR, not read from GSC. Pull real average position
  per page to sharpen the headroom numbers.
* The GSC window is 90 days and the PostHog window is 180 days; signup rates are stable
  enough that this does not change the ordering, but the click deltas are 90-day figures.
* PostHog paths and GSC URLs were matched on pathname; `.html` duplicates of the same page
  were not merged.
