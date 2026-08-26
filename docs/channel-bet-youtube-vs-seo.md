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

## 4 — And SEO is more efficient per unit of work

| | Assets | Signups/mo | Per asset |
| --- | --- | --- | --- |
| SEO pages | 215 (sitemap) | 289 | **1.34** |
| YouTube videos | 116 published in 3mo | 20 | **0.17** |

A page is ~8x more productive per asset — and pages are script-generated
(`generate_pseo_pages.py`) while videos are hand-made in Guidde. Per hour of
founder time the gap is far wider than 8x.

**116 videos averaging 16 views each is not a YouTube bet, it is a volume spray.**
At 15-23% average view percentage YouTube will not distribute them, so they cannot
compound. The compounding argument for video is only available at the retention
`claude/youtube/METHOD.md` was written to produce.

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

## Appendix — the evidence that the library is not compounding

Added 2026-08-26 to support the claim in section 4.

### Views per video per month is flat while the library tripled

| | Videos | Views/mo | Per video |
| --- | --- | --- | --- |
| 2026-06 | 47 | 528 | **11.2** |
| 2026-08 (prorated) | ~140 | ~2,060 | **14.7** |

The library grew ~3x and per-asset output did not move. That is linear
accumulation, not compounding — each new video adds a small fixed trickle
rather than lifting the videos around it.

### Individual videos flatline in ~9 days

`aszAiVOzYTs` ("Claude Code MCP: Scrape LinkedIn Profiles Without Coding"), the
highest breakout score on the channel (3.62), daily cumulative views:

    2 → 9 → 13 → 15 → 17 → 18 → 18 → 25 → 31 → 31 → 32 → 32

Climbs for nine days, then stops dead. Velocity goes to zero rather than
compounding.

### YouTube's own verdict on retention

`relativeRetentionPerformance` for the channel's best video (`2-bM_ITMbrw`,
119 views) sits at **0.40-0.45 through the first 15%** of the video — below the
median for comparable videos. Its shape after that is actually fine (flattens at
0.45-0.55, 27% reach the end). **The loss is in the opening, not the body.**

### The two kinds of compounding

| Mechanism | Status |
| --- | --- |
| Recommendation flywheel (watch time → suggested/browse → more views) | **Closed.** RELATED_VIDEO is 204 views at 15.1% avg view percentage — the worst-retaining source. YouTube will not push videos that retain below median. |
| Search annuity (rank for an evergreen query, earn a trickle indefinitely) | **Open and working.** YT_SEARCH is the largest source, 549 views at 22.1% — the *best*-retaining source on the channel. |

So the videos behave like SEO pages: small durable annuities. What they are not
getting is the distribution multiplier that makes video worth more per hour than
a page — and that multiplier is gated entirely on retention.

**Caveat:** the push is only five weeks old. A search tail can take 6-12 months
to develop, so the annuity value is genuinely not measurable yet. The
recommendation-flywheel conclusion does not depend on that wait — it is
observable now from `relativeRetentionPerformance`.

### The fix is the first 15 seconds

`claude/youtube/METHOD.md` already prescribes it — the fixed opening line and
**Step 01 showing the payoff** (the found email, the exported CSV) *before*
showing how. That rule exists to hold the opening 15% where these videos are
losing below-median. It is the highest-leverage unmet rule in the method.
