# YouTube bet — decision record and review protocol

**Opened:** 2026-08-26 · **First review due:** 2026-11-26 · **Final review:** 2027-02-26

## The decision being deferred

Whether YouTube becomes a primary acquisition channel for LinkFinder AI, or
stays a secondary experiment behind SEO.

**Decided on 2026-08-26: keep investing, do not decide yet.** The push is three
weeks old. Nothing about compounding, retention, or annuity value is measurable
at that age — an earlier attempt to measure it produced four invalid findings
(see `channel-bet-youtube-vs-seo.md` appendix). The site-side conversion signal
is the only real-time evidence, and it is positive.

## Baseline — frozen as of 2026-08-26

Do not re-derive these at review time. Compare against them.

### Site-side (PostHog 263837, August 2026 through the 26th)

| Metric | Baseline |
| --- | --- |
| YouTube referral people / month | **151** (202 sessions, 630 pageviews) |
| YouTube first-touch visitors | 78 |
| YouTube first-touch signups | 20 (**25.6%**) |
| YouTube any-touch signups | 27 |
| **YouTube-attributed payers** | **0** |
| Google first-touch visitors -> signups | 3,946 -> 289 (7.3%) |
| YouTube rank among referring domains | #4 |

### Business (Supabase `snxhsboboatjywgwdeds`)

| Metric | Baseline |
| --- | --- |
| Total accounts | 6,684 |
| Subscribers (`subscription_id IS NOT NULL`) | 31 |
| Credit-pack only (`is_unlimited`, no sub) | 88 |
| Rows with Stripe `customer_id` | 60 |
| Jul accounts -> subscribers | 512 -> 3 |
| Aug accounts -> subscribers | 440 -> 3 |

### Channel (vidIQ, `UCAq5URh_O2gbg4bFFwBWfdg`)

| Metric | Baseline |
| --- | --- |
| Videos | 163 (was 47 on 2026-07-22) |
| Subscribers | 4,850 (was 4,900 in May) |
| Views, Aug 1-25 | 1,527 · 1,390 watch-minutes |
| YT_SEARCH, Aug 1-25 | 549 views · 22.07% avg view % |
| YT_SEARCH, July | 231 views · 31.33% · 125s avg duration |
| YT_SEARCH, June | 263 views · 28.41% · 137s avg duration |
| Largest search term | `n8n` (19 views, 9.1% retention) — legacy content |

### Context

Google referral traffic peaked at **1,914 people/week** (w/c 2026-07-05) and fell
to **982** (w/c 2026-08-16), roughly -40%. The YouTube bet is being made against
a declining SEO base, which is part of why it is worth making.

## The tracked cohort

**Videos published 2026-08-01 to 2026-08-15.** This is the first cohort produced
under the current format. Every later cohort is compared to it *at the same age*.

Per-video comparison does not work here — a 32-view video quantises its retention
curve in steps of 1/32. **Always pool a cohort** before reading retention.

## Review protocol

At each review, pull these and compare to baseline:

1. **Site-side** — YouTube referral people, first-touch signup rate,
   and **YouTube-attributed payers** (the number that matters most).
2. **Cohort day-60 views** — Aug 1-15 cohort vs each later cohort at day 60.
3. **Cohort pooled `relativeRetentionPerformance`, first 15%** — above 0.5 means
   the opening is at or above median for comparable videos.
4. **YT_SEARCH views/month and avg view duration** — duration falling
   (137s -> 125s -> 66s so far) means the annuity is thinning per video.
5. **Google referral trend** — is the SEO base still declining?

## Decision rules

Written now, before the outcome is known, so the call cannot be rationalised later.

| Observation | Conclusion |
| --- | --- |
| Day-60 cohort views rising cohort-over-cohort **and** YouTube payers > 0 | **Scale up.** The channel works and it monetises. |
| Signups still converting >15% but payers still 0 | **The funnel failed, not the channel.** Fix activation->paid before spending another hour on video. |
| Day-60 views flat or falling across three cohorts **and** search duration still declining | **The format failed.** Either fix retention properly or stop. |
| YouTube referral traffic below ~150/month after six months of publishing | **Not a channel at this effort level.** Redirect the hours. |

## The two things that should NOT wait for this review

1. **The funnel.** 952 accounts across July-August produced 6 subscribers
   (0.63%), and per `GROWTH-STRATEGY-REVIEW.md` only 8 of 31 subscribers were
   active in the last 30 days. This caps every channel simultaneously and is
   independent of the YouTube question.
2. **The Google decline.** ~-40% in six weeks on the channel that still supplies
   ~93% of signups. Diagnose it now.

## Do this before the review

- **Per-video UTM campaigns.** 535 of 561 tagged YouTube pageviews collapse into
  one `utm_campaign=tutorials`, so no individual video can be judged on signups.
  Without this the November review cannot answer "which videos worked".
- **Write the new opening into `claude/youtube/METHOD.md`.** As of 2026-08-26 the
  repo shows no change to the method; the fix lives only in the recording.
