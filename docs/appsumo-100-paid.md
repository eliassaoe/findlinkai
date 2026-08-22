# The AppSumo gate: 100 active paid users, from 8

Written 22 Aug 2026. Every number below is from our own Postgres and PostHog,
with my three accounts (`hamoureliasse@`, `tetstsgesgzbhbh@`, `eliasseiapro23123@`)
excluded. They are the majority of recent checkout events by volume, so any
figure that includes them is meaningless.

## Where we actually are

"Active paid user" is the only definition AppSumo will accept: on a paid plan
**and** using the product. That is a join of `linkfinderai_users.plan_type > 0`
against `enrichment_history` in the last 30 days.

| month | active paid users | credits they burned |
|---|---:|---:|
| May 2026 | 13 | 9,393 |
| Jun 2026 | 22 | 24,960 |
| Jul 2026 | 11 | 5,913 |
| Aug 2026 (22 days) | 6 | 7,064 |

Eight paid accounts have touched the product in the last 30 days. Seventy-eight
accounts have `plan_type > 0` at all; twenty-eight of those carry a
`subscription_id`. The gap between 78 and 8 is the whole problem: we have sold
to plenty of people, and almost none of them are still here.

## When do we hit 100 at the current pace

**We don't.** The active-paid line has gone 13 → 22 → 11 → 6. It is not growing
slowly, it is shrinking.

Take the most generous read available — count every gross new payer as if they
stayed forever, and subtract only the people who explicitly cancel:

| month | new payers | cancellations |
|---|---:|---:|
| May | 1 | 2 |
| Jun | 11 | 1 |
| Jul | 7 | 2 |
| Aug (22d) | 4 | 2 |

That is roughly +6 gross, −2 explicit cancels, so **+4 net per month at
best**. 90 more users ÷ 4 = **23 months — mid-2028.**

So the honest answer to give AppSumo is: at the current pace, never on the
measured metric, and two years on the flattering one. Neither is a slot they
will hold open. The pace has to change, not be waited out.

## The top of the funnel is not the constraint

| metric | per month |
|---|---:|
| visitors | ~9,000 (4,449 from Google organic) |
| signups | ~500 |
| activated (ran an enrichment) | ~400 |
| clicked upgrade | ~110 |
| selected a plan | ~27 |
| paid | ~6 |

500 signups a month is already enough to build 100 paying users. A normal
free→paid rate for a tool like this is 2–5%; that would be 10–25 new payers a
month. We convert about 1.2%. The SEO engine is doing its job. Everything
downstream of it is not.

## Constraint 1: checkout has been broken, twice, for two months

Real users, 60 days:

| step | people |
|---|---:|
| clicked upgrade | 213 |
| selected a plan | 55 |
| opened a checkout | 50 |
| **saw a payment page** | **12** |
| paid | 14 |

Thirty-eight of fifty people who opened a checkout never saw a page they could
pay on. Six hit `checkout_page_load_timeout`; five closed it before anything
loaded.

And it has failed in two different implementations. The overlay/iframe flow
threw `checkout_page_load_timeout` (10 on `/app`) and stopped firing on 18 Aug.
The redirect flow that replaced it fires `checkout_redirect_stalled` and is the
subject of `docs/checkout-leak.md`, where 35 of 42 plan selections produced no
redirect at all. Note that `app.html` in this repo contains no
`checkout_overlay_opened` or `checkout_page_load_timeout` capture, yet `/app`
emitted both — **production has been running code that is not in this repo**,
which is its own thing to fix before anyone tries to debug this again.

Cost of the leak: ~20 people a month with a card out who cannot give us money.
Closing even half of it roughly triples new payers on its own, before any new
traffic.

## Constraint 2: people buy and then evaporate

22 active paid in June, 6–8 now. Almost nobody explicitly cancels — only about
two a month hit `subscription_cancelled`. They just stop showing up. That is
worse than churn we can see, because it means the product isn't holding people
long enough for a subscription to be worth renewing, and AppSumo counts
*active*, so dormant payers do us no good even while they are billed.

## The asset nobody is using: 1,275 warm free users

| segment | people |
|---|---:|
| registered | 6,578 |
| email verified | 6,571 |
| have actually run an enrichment | 1,347 |
| active in the last 90 days | 1,275 |
| **active, and out of credits (≤5 left)** | **301** |

Three hundred and one people used the product recently, ran out of credits, and
have not bought. That is the single most qualified list we will ever have, and
it is sitting untouched while we wait for 100 users to arrive from Google.
Instantly is already connected.

At a 15% conversion on those 301 — high for cold, reasonable for people who hit
a wall in a tool they were actively using — that is 45 paying users. At 5% on
the full 1,275 it is 64. Either number closes most of the gap on its own.

## What actually gets us to 100

In order. The first two are prerequisites: pushing volume into a broken checkout
just wastes the list.

1. **Fix checkout and prove it with a real card.** Reconcile production `/app`
   with this repo first, then walk `docs/checkout-leak.md`'s diagnosis table
   against the instrumentation shipped on 22 Aug. Nothing else on this list is
   worth doing until someone who is not us can complete a purchase.
2. **Make the money moment survivable.** `credits_exhausted` fires ~28 times a
   month and 301 people are sitting at zero credits — the wall is being hit and
   is not converting. That is the same 60 seconds where checkout fails.
3. **Work the 301, then the 1,275.** Time-boxed offer, founder-signed, through
   Instantly. This is the only lever on the list that can produce dozens of
   paying users inside a month rather than a quarter.
4. **Push annual.** Annual pricing is already live ($29/mo annual vs $49
   monthly). An annual buyer cannot quietly lapse in six weeks, which is exactly
   how we lost June's cohort. It also makes the 100 stick long enough to matter
   when AppSumo counts.
5. **Only then add traffic.** The SEO pages work; they are not the bottleneck.

Realistic arithmetic if 1–4 land: ~15/month from a working funnel on existing
traffic, plus 40–60 one-time from the warm list, from a base of 8. That is 100
in roughly one quarter, not 23 months.

## On AppSumo specifically

Two things worth knowing before we treat 100 as a hard gate:

- **The 100-user bar is a Select bar, not an AppSumo bar.** AppSumo runs a
  self-serve Marketplace listing alongside the curated Select program. Select is
  the one with the vetting, the promotion and the traction requirements;
  Marketplace is list-it-yourself, and performance there (sales and reviews) is
  the normal route into Select. Worth asking our contact directly whether
  Marketplace is open to us now. It converts the problem from "find 90 users
  first" to "prove it on their platform".
- **Be careful with a competing lifetime deal as a shortcut.** We have the
  infrastructure — `redeem-code.html`, the `linkfinder-redeem` worker, a
  `dealify` table from a previous run — so a Dealify or DealMirror launch could
  produce 100 buyers in weeks. But LTD buyers are a poor match for "active paid
  users", they wreck ARPU, and a prior deal on a competing marketplace is a
  known negative in AppSumo Select vetting. If we have already run Dealify, that
  bridge may be crossed and it is worth telling AppSumo up front rather than
  having them find it.

## The unrelated thing that will bite us

Supabase reports RLS disabled on `email_pattern_logs`, `processed_companies`,
`ai_columns_tables`, `linkedin_lead_searches` and `enrichment_history`. Anyone
with the anon key can read or modify every row, including all 81,991 enrichment
records. Enabling RLS without policies will lock the app out, so it needs
policies written alongside — but a partner doing diligence on us will find this,
and it is a bad thing to be found.
