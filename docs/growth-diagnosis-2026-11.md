# Why LinkFinder AI is stuck under $10k ARR, and what moves it (12 Nov 2026)

Sources: Supabase `auth.users`, `linkfinderai_users`, `public.users`, `enrichment_history`;
PostHog 263837 (`signup_google_result`, `checkout_payment_success`); Search Console
(90 days to 11 Nov vs the 90 days before). Builds on `revenue-baseline-2026-11.md`,
`paste-a-list.md`, `find-rate.md`, `organic-to-paid-2026-10.md`.

## The numbers today

| Step | Per month now | Note |
| --- | --- | --- |
| Organic clicks (all countries) | ~4,850 | **−25% vs the previous 90 days** (14,552 vs 19,426) |
| … from countries that pay (US, GB, DE, FR, CA, AE, AU) | **~1,240** | US alone ~590 |
| … from countries refused at signup (IN, PK, BD, PH, EG, TR, ID…) | ~73% of all clicks | India alone 58% |
| Google sign-ins (`auth.users`) | ~750 | |
| … that become a LinkFinder account | **~170–200** | the rest are refused, see below |
| … that run a lookup | ~50–60% | |
| New paying customers (`checkout_payment_success`) | **11 Jun → 7 → 7 → 4 → 3 → 1 (Nov to 12th)** | falling |
| Subscription churn | ~22% a month | most leavers ran one list in 1–3 days |
| MRR | ≈ $394 Dodo (+ ≈ $474 legacy Gumroad, counted $0 by owner's rule) | ARR ≈ $4.7k |

## Correction: the "signup under-count since 20 Sep" is a country block, not tracking

`docs/smart-start.md` read the drop of `signup_success` from ~170 to ~40 a week
(from the week of 20 Sep) as PostHog under-counting. It is real:

- From that week, ~140 of the ~180 weekly Google sign-ins land only in
  `public.users` (Unlimited Leads) and never get a `linkfinderai_users` row.
  Before, it was ~15 a week.
- `signup_google_result` (last 10 days): 80 refusals with
  `403 country_not_supported` ("We are not taking new signups in your country
  right now"), 59 people — IN 38, PK 14, ID 4, PH 4, NG 3, VN 3, EG 3… — and
  20 successes (US 11, GB 3, FR 2, SG 2…).
- The block lives in the live signup worker (Cloudflare), not in this repo.
- It is coherent with who pays: of payers in 8 months, 34 are US and 1 is
  India. Keep it, but know that **~73% of organic clicks now land on a wall**.

## What blocks growth, in order of weight

1. **The traffic that can pay is small and shrinking.** ~1,240 clicks a month
   from paying countries, organic total −25% quarter on quarter. No other
   channel is running: no ads, cold outbound paused (Explee balance negative,
   14 interested leads → 0 booked in the baseline), partnerships one by one.
   Every paying source today is SEO on single-lookup tool pages.
2. **That traffic wants one lookup, not a list.** List users pay 5.4%,
   single-lookup users 0.17% (`paste-a-list.md`). The money pages bring the
   single-lookup crowd.
3. **The first try fails.** A free account's first email lookup finds
   something 40% of the time, the first phone lookup 24% (`find-rate.md`), and
   the phone step returned 5 numbers in 44 lookups since mid-October.
4. **Customers leave after one list.** ~22% monthly churn. At 3 new customers a
   month and $56 ARPU, MRR settles at **3 ÷ 0.22 × $56 ≈ $760**: that is the
   ceiling of the current machine, wherever we start from.
5. **Effort is spread thin.** Link swaps, LTD partners, videos, SEO pages,
   integrations — each worth tens of dollars a month; none is a channel that
   brings 20+ customers a month.

## Forecast (steady-state MRR = new customers a month ÷ churn × ARPU)

| Scenario | New / month | Churn | ARPU | MRR | ARR |
| --- | --- | --- | --- | --- | --- |
| Nothing changes | 3 | 22% | $56 | ~$760 | ~$9k |
| Churn halved (annual + LTD + pause) | 3 | 11% | $56 | ~$1.5k | ~$18k |
| + an outbound channel that works (15/month) | 15 | 11% | $56 | ~$7.6k | ~$92k |
| + agencies on bigger plans | 15 | 11% | $90 | ~$12.3k | ~$147k |
| $1M ARR | — | — | $56 | $83k | needs ~1,490 subscribers |

Black Friday LTD is one-off cash, not MRR.

## What to do, in order

1. **Fix the first result** (phone step, then email coverage on non-US
   profiles). Cheapest lever: it converts traffic we already have.
2. **Build one channel that brings list buyers**: cold outbound to agencies,
   recruiters and SDR teams, offering the free 50-lead list (`/free-list`)
   instead of a meeting. Prove it on a ~$500 budget: target ≥ 3 paying
   customers from it, then scale spend.
3. **Cut churn**: sell annual and lifetime by default to list buyers; keep the
   pause flow.
4. **SEO family A** (`seo/seo-pages-plan-2026-11.md`): list-intent pages for
   US buyers, the only SEO work aimed at payers.
5. Keep link swaps and partner LTDs as background tasks, not the main work.

Re-check monthly: paying-country clicks, accepted signups, first-lookup find
rate, new payers, churn.
