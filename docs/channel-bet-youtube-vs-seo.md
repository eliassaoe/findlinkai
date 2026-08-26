# Should YouTube be the primary acquisition bet?

**Date:** 2026-08-26 · **Sources:** PostHog 263837, Supabase `snxhsboboatjywgwdeds`,
vidIQ (channel `UCAq5URh_O2gbg4bFFwBWfdg`)

Extends `GROWTH-STRATEGY-REVIEW.md` (2026-08-25) and
`docs/youtube-traffic-2026-08.md`. Written because the session is ephemeral.

## The question

Should YouTube become the main source of traffic, ahead of LinkedIn and SEO?

## Verdict

**Half yes.** YouTube deserves a real, sustained bet and LinkedIn deserves none.
But "YouTube instead of SEO" is not supported by the numbers, and neither channel
is the current constraint — the funnel is.

## 1 — LinkedIn: correct, drop it

LinkedIn referrals to the site, unique people per month:

| Dec | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 3 | 1 | 3 | 4 | 1 | 1 | 4 | 2 |

Nine months, never above 4. It is not a channel. No further argument needed.

## 2 — YouTube quality: correct, and the best on the site

August first-touch conversion: YouTube **25.6%** (20 signups / 78 visitors) vs
Google 7.3%, direct 6.8%, Reddit 10.3%. Excluding internal navigation, YouTube is
the best-converting source the site has. That is a genuine finding, not noise —
it held across July (13 signups) and August (27 any-touch).

Video pre-qualifies. Someone who watches a tool demo and then clicks through
already knows what the product does.

## 3 — But SEO still wins on volume by ~50x

Unique people per week:

| Week | Google | YouTube |
| --- | --- | --- |
| 2026-07-05 | 1,914 | 4 |
| 2026-07-26 | 1,201 | 19 |
| 2026-08-09 | 984 | 34 |
| 2026-08-16 | 982 | 20 |

August signups: Google 289, YouTube 20. Even at 3.5x the conversion rate, SEO
delivers ~14x the signups.

## 4 — Per-asset efficiency: SEO leads today, but the gap is not yet measurable

| | Assets | Signups/mo | Per asset |
| --- | --- | --- | --- |
| SEO pages | 215 (sitemap) | 289 | **1.34** |
| YouTube videos | 116 published in 3mo | 20 | **0.17** |

**Read this table with care.** The SEO pages are mature and ranked; the videos
are days to weeks old and mostly have not ranked yet. The comparison is real for
*today's* output but it is not a fair read of the videos' eventual value, and it
should not be used to conclude the video library underperforms structurally.
See the appendix for why the per-video figures were originally over-read.

What is fair to say: pages are script-generated (`generate_pseo_pages.py`) while
videos are hand-made in Guidde, so per hour of founder time SEO is currently far
cheaper per signup. Whether that holds once the videos age is an open question,
answerable by the cohort test in the appendix.

## 5 — The real argument for diversifying: SEO is falling

Google traffic peaked the week of 2026-07-05 at 1,914 people/week and has run
982-1,201 since — roughly **-40% over six weeks**, while total site traffic fell
from 2,507 to ~1,300-1,500 per week.

This updates `GROWTH-STRATEGY-REVIEW.md`, which recorded "~7,500 visitors/mo,
signups rising" on 2026-08-25.

215 near-duplicate "best X" / "X alternative" pages is precisely the content most
exposed to AI Overviews and helpful-content updates. So the case for YouTube is
**not** that it out-performs SEO today — it doesn't — but that the SEO base is
concentrated, declining, and structurally exposed. That is a real reason to build
a second channel now.

## 6 — Neither is the constraint

| | Value |
| --- | --- |
| Total accounts | 6,684 |
| Subscribers (`subscription_id IS NOT NULL`) | **31** (0.46%) |
| Credit-pack only (`is_unlimited`, no sub) | 88 |
| Rows with a Stripe `customer_id` | 60 |

New accounts to subscribers, by signup month:

| Month | New accounts | Became subscriber |
| --- | --- | --- |
| 2026-05 | 310 | 2 |
| 2026-06 | 417 | 14 |
| 2026-07 | 512 | 3 |
| 2026-08 | 440 | 3 |

**952 accounts over July-August produced 6 subscribers (0.63%).** YouTube
specifically: 27 signups, 6 reached `plan_selected`, 1 opened six checkout
sessions, **zero paid**.

Doubling traffic takes 6 subscribers to 12. Moving signup→paid from 0.6% to 3%
takes the *existing* traffic to ~30/month. And per
`GROWTH-STRATEGY-REVIEW.md`, only 8 of 31 current subscribers were active in the
last 30 days — so even won customers are not retained.

## Recommendation

1. **Fix signup→paid and subscriber activation first.** It is the binding
   constraint on every channel simultaneously and needs no new traffic.
2. **Keep SEO as the volume engine**, but treat the -40% as a live incident and
   diagnose it (rankings, AI Overviews, an update, or tracking).
3. **Make YouTube the second channel deliberately, not additively.** Fewer videos
   at the METHOD.md standard beats 116 at 16 views. Target average view
   percentage above 50% before scaling volume; retention is the gate on
   everything YouTube will give.
4. **Drop LinkedIn.**
5. **Per-video UTM campaigns** — 535 of 561 tagged pageviews collapse into one
   `utm_campaign=tutorials`, so no video can be judged on signups today.

## Caveats

- First-touch attribution by `$referring_domain`; person merging at signup can
  reassign anonymous events.
- August is partial (through the 26th); weekly figures for w/c 2026-08-23 cover
  4 days.
- `is_unlimited` overcounts payers (redeem codes, VIP grants); only 60 rows carry
  a Stripe `customer_id` against 119 flagged paying.

---

## Appendix — RETRACTED, and what is actually measurable at 3 weeks

Added 2026-08-26, **corrected the same day.** The original appendix argued the
library was not compounding. **That analysis was invalid.** It is kept out of the
repo deliberately rather than left standing — the errors are recorded below so
they are not repeated.

### Error 1 — the retention analysis used the wrong video

`2-bM_ITMbrw` was treated as "the channel's best video" and its retention curve
used to conclude the openings were below median. It has **16,806 lifetime
views and predates the LinkFinder push** — legacy n8n-era content. The "119
views" figure was views *within the query window*, misread as the video's total.

The conclusion drawn from it — `relativeRetentionPerformance` 0.40-0.45 through
the opening — describes old content, not the new tutorial format.

### Error 2 — per-video math penalised new videos

"Views per video per month is flat (11.2 -> 14.7)" and "search views per video
flat (5.6 -> 5.8)" both divided a month's views by a library in which most
videos were days old. June's 47 videos were mature and ranked; August's ~117
included ~70 published inside the month. New videos have not had time to rank,
so per-video yield is mechanically depressed. **Not a valid comparison.**

### Error 3 — "videos flatline in nine days"

Read from three days of flat data on a ten-day-old video. Search tails take
months; three days is noise.

### Error 4 — subscriber losses read as a quality signal

August was -27 net subscribers. But the channel's ~4,900 subscribers came for
n8n/AI content, and **`n8n` is still the single largest search term bringing
views** (19 views in August). Publishing LinkedIn-scraping tutorials to that
base sheds subscribers regardless of video quality. That is the cost of a
deliberate pivot, not evidence against it.

### What genuinely holds at three weeks

| Claim | Status |
| --- | --- |
| 151 YouTube visitors -> 20 first-touch signups (**25.6%**) | **Holds** — measured site-side, independent of video age |
| YouTube is the #4 referring domain | Holds |
| Google traffic down ~40% since early July | Holds — unrelated to YouTube |
| 952 accounts (Jul-Aug) -> 6 subscribers | Holds — site-wide, independent of channel |
| "Zero YouTube revenue" | **Overstated** — free credits delay the paywall by weeks |
| "Will not compound" / annuity sizing | **Withdrawn** — not measurable yet |

### The valid test: cohorts at equal age

Per-video comparison fails here — view counts are too small (a 32-view video
quantises its retention curve in steps of 1/32) and ages are mixed.

Instead: take everything published **Aug 1-15** and everything published
**Sep 1-15**, and at **day 60 for each cohort** compare total views and
*aggregate* retention. Same age, same window length, different format — that
isolates the variable. Pooling a cohort also gives a few hundred views, enough
for the retention curve to carry meaning.

Expect a retention verdict in ~6 weeks and a search-annuity verdict in 3-6
months. Until then the site-side conversion rate is the only real-time signal,
and it is the strongest one on the site.
