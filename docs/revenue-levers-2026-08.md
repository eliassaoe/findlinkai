# Where the next revenue comes from (not YouTube)

**Date:** 2026-08-26 · **Sources:** PostHog 263837, Supabase `snxhsboboatjywgwdeds`
Companion to `GROWTH-STRATEGY-REVIEW.md` and `FUNNEL-REVIEW.md`.

## First: the VIP offer is not being rejected, it is not being seen

| Page | Pageviews | **Unique people** |
| --- | --- | --- |
| `/done-for-you-outbound` | 12 | **1** |
| `/linkfinder-vip` | 3 | **1** |

Ever. One visitor each, first seen 2026-08-23/24 — and 12 views in under an hour
on one page reads as the author's own session, not a prospect's.

No campaign email links to either page. The only destinations recipients actually
clicked:

| Subject | Destination | Clicks / people |
| --- | --- | --- |
| Does ChatGPT recommend you? | `calendly.com/.../compensated-interview-unlimited-leads-clone` | 5 / 4 |
| did the upgrade break for you? | `linkfinderai.com/app?upgrade=1` | 4 / 2 |
| your LinkFinder account is ready | `linkfinderai.com/app` | 3 / 3 |
| (various) | PostHog unsubscribe / messaging-preferences | 6 / 6 |

**"Does ChatGPT recommend you?" is the biggest send — 153 emails, 46% open rate —
and its only real call to action is a compensated interview for a different
product.** That is a research email, not an offer. It converted nothing because
it never asked for a sale.

The offer has no distribution problem to solve *later*; it has no distribution
at all.

## Attribution trap — do not trust the workflow conversion count

PostHog reports 7 `$workflows_conversion` events of type
`checkout_payment_success`. **Six of those seven people paid before they were
ever emailed** — one on 2026-06-08, eleven weeks before the first send.

| First email | First payment | Ordering |
| --- | --- | --- |
| 2026-08-25 | 2026-06-08 | BEFORE |
| 2026-08-25 | 2026-08-03 | BEFORE |
| 2026-08-25 | 2026-08-12 | BEFORE |
| 2026-08-25 | 2026-08-13 | BEFORE |
| 2026-08-25 | 2026-08-13 | BEFORE |
| 2026-08-25 | 2026-08-24 | BEFORE |
| 2026-08-22 | 2026-08-23 | **after** |

Email has driven **one** payment, not seven. The workflow counts any enrolled
person who has ever fired the conversion event.

## Email campaign scoreboard (2026-08-22 to 08-26, 4 days)

| Campaign | Sent | Opens (people) | Real clicks | Conversion |
| --- | --- | --- | --- | --- |
| Does ChatGPT recommend you? | 153 | 68 (46%) | 4 -> calendly | 0 sales |
| account ready / haven't run anything | 152 | 27 | 4 -> /app | activation |
| **stop doing these one at a time** | **54** | **12** | — | **6 `csv_uploaded`** |
| API and MCP server | 46 | 11 | — | 1 `api_key_copied` |
| 1,000 free credits for 15 minutes | 3 | 2 | — | (interview) |

Also: 20 bounces, 4 unsubscribes across all sends.

## The ranked list

### 1. Save the 22 dormant subscribers — highest value, zero new traffic

| Subscribers | Count |
| --- | --- |
| Total | 31 |
| **Active in last 30d** | **8** |
| Dormant 30d+ | 22 |
| Never ran anything | 1 |

**74% of paying subscribers have not used the product in 30 days.** At $62.50
ARPU that is roughly **$1,438/mo of the ~$1,939 MRR sitting on accounts that are
next quarter's cancellations.** Churn is already ~6.5%/mo (~$125 MRR lost per
month). Nothing else on this list protects revenue that already exists.

### 2. Scale "stop doing these one at a time" — the one proven campaign

It produced **6 `csv_uploaded` from 54 sends (11%)** — and CSV/bulk is the
behaviour that predicts payment (bulk users pay at 8.3% vs ~1% baseline, per
`FUNNEL-REVIEW.md`).

**1,319 users have run an enrichment since 2026-05-01 and never uploaded a CSV.**

    1,319 x 11% ~= 145 CSV uploads x 8.3% ~= 12 payers ~= $750 MRR

The email already exists and already works. It has been sent to 54 of 1,319.

*Caveat: 11% comes from 54 sends — a small sample that will regress. Send the
next 200 before trusting the projection.*

### 3. Fix checkout

Since 2026-07-01: `checkout_error` 11, `checkout_page_load_timeout` 11,
`checkout_redirect_stalled` 10, `checkout_abandoned` 13. One user opened **six**
checkout sessions and never paid.

August had **8 payments total**. Recovering two or three is a ~30% month.

### 4. Give the VIP offer distribution, or retire it

The warmest list on the property is people who have already paid: 22 dormant
subscribers + 88 credit-pack buyers. None of them has been sent to the VIP page.
Either link it from a campaign aimed at those 110 people, or stop maintaining it.

### 5. The 88 credit-pack buyers are the most under-worked asset

| | Count |
| --- | --- |
| Credit-pack buyers (`is_unlimited`, no subscription) | 88 |
| **Active in last 30d** | **5** |

They are **~3x the subscriber count** and have already proven they will pay.
Converting 10% to subscriptions is ~9 subs ~= **$560 MRR**.

(Consistent with `CLAUDE.md`: move pack buyers toward subscriptions, never the
reverse.)

## What this adds up to

Levers 1, 2 and 5 together are worth roughly **$1,300/mo in new MRR plus ~$1,400
in protected MRR** — against a current base of ~$1,939. None of them requires a
single additional visitor.

That is the case for fixing the funnel before buying more traffic, restated with
the specific numbers rather than as a principle.
