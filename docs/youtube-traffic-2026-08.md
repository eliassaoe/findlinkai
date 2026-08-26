# YouTube traffic review — as of 2026-08-26

Channel: **Elias IA** (`UCAq5URh_O2gbg4bFFwBWfdg`) · Site analytics: PostHog project
`Linkfinder AI` (263837).

**Verdict: the traffic is paying off, the channel is not, and the money hasn't
arrived yet.** YouTube is now the highest-intent acquisition channel on the site
by conversion rate, while the channel itself is losing subscribers and watch
time. Zero YouTube-attributed revenue so far.

## The publishing push

116 videos published between 2026-05-26 and 2026-08-26 (47 -> 163 total), with
the volume starting ~2026-07-23.

| Month | Views | Watch time (min) | Subs gained | Subs lost | Net |
| --- | --- | --- | --- | --- | --- |
| 2026-05 | 728 | 1,919 | 10 | 12 | -2 |
| 2026-06 | 540 | 1,571 | 6 | 11 | -5 |
| 2026-07 | 628 | 1,262 | 5 | 24 | -19 |
| 2026-08 | 1,527 | 1,390 | 17 | 44 | **-27** |

Views in August are 2.4x June. **Watch time is below where it was in May.** More
views, less watching. Channel subscribers went 4,900 -> 4,850 over the quarter.

Per-video the output is thin: across the push window the best video took 119
views and the median was ~30. Roughly 16 views per video published.

Traffic sources on the channel, 2026-07-23 to 2026-08-25 (~1,839 views):

| Source | Views | Avg view duration | Avg % viewed |
| --- | --- | --- | --- |
| YT_SEARCH | 626 | 66s | 23.4% |
| SUBSCRIBER | 447 | 41s | 16.8% |
| RELATED_VIDEO | 244 | 46s | 16.0% |
| EXT_URL | 228 | 74s | 19.6% |
| NO_LINK_OTHER | 97 | 48s | 13.4% |
| YT_CHANNEL | 86 | 56s | 14.8% |

YT_SEARCH being the single largest source is the tutorial-keyword strategy from
`claude/youtube/METHOD.md` working as designed. But 15-23% average view
percentage across every source means viewers leave in the first minute — that is
what is driving the subscriber losses and suppressing distribution.

## Site-side: this is the good news

YouTube referral traffic to linkfinderai.com:

| Month | People | Sessions | Pageviews |
| --- | --- | --- | --- |
| 2026-05 | 10 | 12 | 26 |
| 2026-06 | 5 | 5 | 5 |
| 2026-07 | 28 | 29 | 119 |
| 2026-08 | **151** | 202 | 630 |

In August `www.youtube.com` is the **#4 referring domain** on the whole site,
ahead of Bing, Brave and Reddit.

First-touch channel -> signup conversion, August 2026:

| Channel | Visitors | Signups | Rate |
| --- | --- | --- | --- |
| internal (linkfinderai.com) | 204 | 82 | 40.2% |
| **youtube** | **78** | **20** | **25.6%** |
| other | 105 | 12 | 11.4% |
| reddit | 58 | 6 | 10.3% |
| google | 3,946 | 289 | 7.3% |
| direct | 1,553 | 105 | 6.8% |
| other search | 270 | 17 | 6.3% |

**YouTube converts 3.5x better than Google.** Excluding internal navigation it is
the best channel on the site. Any-touch YouTube signups: 13 in July, 27 in
August.

Where YouTube traffic lands (August): `/` 252pv, `/sign-up` 110, `/app` 91,
`/api-access` 52.

## Where it stops: revenue

Zero. Of 13 payers since 2026-07-01, none are YouTube-attributed:

| First-touch referrer | Payers | Payments |
| --- | --- | --- |
| www.google.com | 6 | 7 |
| linkfinderai.com | 4 | 5 |
| googleusercontent.com | 1 | 2 |
| $direct | 1 | 1 |
| www.bing.com | 1 | 1 |

YouTube-attributed users do reach the checkout and stall there:
`plan_selected` 6 people / 35 events, `checkout_overlay_opened` 5 people,
`checkout_session_created` 1 person / **6 attempts**, `checkout_payment_success`
**0**. One person opening six checkout sessions without completing is worth
investigating on its own — the project logs `checkout_page_load_timeout` (11),
`checkout_redirect_stalled` (10) and `checkout_error` (11) site-wide.

## What to do

1. **Fix retention before publishing more.** 15-23% average view percentage is
   the binding constraint; more videos at this retention adds views that don't
   compound and costs subscribers. The 22-35 step slow-demo format in
   `claude/youtube/METHOD.md` is built for watch time — the current output is
   not hitting it.
2. **Per-video UTM tags.** 535 of 561 tagged YouTube pageviews in August sit
   under a single `utm_campaign=tutorials`, so it is impossible to tell which
   videos drive signups. One campaign value per video makes the whole funnel
   measurable.
3. **Follow the YouTube cohort into checkout.** The traffic is the highest-intent
   on the site and converts to signup at 25.6%, then produces no payments. That
   gap is worth more than the next ten videos.

## Caveats

- Attribution is PostHog first-touch by `$referring_domain` within the stated
  window; person merging at signup can reassign earlier anonymous events.
- The channel-side and site-side figures come from different systems and will
  not reconcile exactly.
- August 2026 is incomplete (through the 26th).
