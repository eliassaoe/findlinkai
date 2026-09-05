# What LinkFinder AI would sell for in two years

**Date:** 2026-09-05 · **Sources:** Supabase `snxhsboboatjywgwdeds` (measured live),
`GROWTH-STRATEGY-REVIEW.md`, `CHURN-PLAYBOOK.md`, `docs/revenue-levers-2026-08.md`,
`docs/dfy-activation-campaign.md`.

Written to answer: "run it fast for another 2 years, then sell at current growth —
what is it worth by then?"

## The correction that changes the answer

**Usage is growing. Revenue is not.** These are being read as one number and they
are not.

| Month | Active enrichers | Enrichment rows |
| --- | --- | --- |
| May 2026 | 186 | 13,009 |
| Jun 2026 | 402 | 35,505 |
| Jul 2026 | 443 | 17,808 |
| Aug 2026 | 589 | 24,162 |
| Sep 2026 (5d) | 125 | 2,632 |

Active users roughly **3x'd in four months**. Over the same period:

| | Jun | Jul | Aug |
| --- | --- | --- | --- |
| New paying customers | 11 | 7 | ~7 |

Gross adds went **down**. Subscribers measured today: **31** — the same 31, with the
identical plan mix (21 Starter / 8 Professional / 1 Enterprise / 1 legacy), that
`GROWTH-STRATEGY-REVIEW.md` recorded on 2026-08-25. MRR **~$1,939**, ARR **~$23,270**.

The `GROWTH-STRATEGY-REVIEW.md` status-quo projection expected 36 subscribers by now.

So "current growth" is not a compounding revenue rate. It is a **constant ~7 gross
adds/month against ~6.5%/month churn**, and that structure does not compound — it
asymptotes.

## Why two years does not multiply the way it feels like it should

With constant gross adds `a` and monthly churn `c`, subscribers converge to `a / c`
regardless of how long you run. At 7 and 6.5%:

    ceiling = 7 / 0.065 = 108 subscribers = ~$6,750 MRR

That ceiling is set today, by the funnel as it stands. Running "fast" for 24 months
does not raise it; it only closes the remaining distance to it.

`S(n+1) = S(n) x (1 - c) + a`, from 31 subscribers, ARPU $62.50:

| Scenario | Adds/mo | Churn | Subs at 24mo | MRR | ARR |
| --- | --- | --- | --- | --- | --- |
| **A — status quo** | 7 | 6.5% | 93 | $5,790 | **~$70k** |
| **B — churn halved** | 7 | 3.0% | 136 | $8,490 | **~$102k** |
| **C — churn halved + funnel repaired** | 10.5 | 3.0% | 196 | $12,280 | **~$147k** |

Scenario C assumes signup→paid moves 1.2% → ~2%, which is what closing the checkout
leak in `docs/checkout-leak.md` is worth on its own (35 of 42 people who pick a plan
never get a redirect).

## What those ARRs sell for

Bootstrapped B2B SaaS under ~$250k ARR trades on roughly **1.5–3x ARR**, or 2.5–4x
owner profit (SDE), on Acquire.com / Flippa / FE International-class channels. Where
this business sits in that band is decided by five things a buyer will diligence:

**Discounts**
- **~6.5%/mo churn ≈ 55%/yr logo churn.** This is the single biggest price
  suppressor. Above ~3%/mo on SMB SaaS, buyers discount rather than pay a premium.
- **85% of traffic from one channel** (Google organic), and search *plateaued in
  July* — weekly visitors peaked at 2,465 (w/c Jul 6) and have run 1,570–1,790 since.
  Single-channel concentration on a channel that has stopped growing.
- **31 customers.** One bad month is −10% of revenue. Buyers price small bases as
  fragile, not as upside.
- **LinkedIn scraping.** ToS/platform/legal exposure is a deal-killer for some
  acquirers and a discount for the rest.
- **Data supplier dependency.** Per `docs/credit-grant.md`, phone is 27% of credit
  consumption and margin-sensitive to one supplier's per-lookup price.

**Premiums**
- ~7,300 user rows and a real SEO estate (hundreds of ranking pages).
- 90% activation — signups genuinely use the product. The first five minutes work.
- Distribution surface: published Google Sheets Marketplace add-on, n8n node, MCP
  server, public API. An acquirer buying a channel may pay above the financial multiple.

| Scenario | ARR at 24mo | Multiple | **Sale price** |
| --- | --- | --- | --- |
| **A — status quo** | ~$70k | 1.5–3x | **$105k – $210k** (mid ~$150k) |
| **B — churn halved** | ~$102k | 2–3.5x | **$200k – $350k** |
| **C — churn + funnel** | ~$147k | 2.5–4x | **$370k – $590k** |

Today, unchanged, the business is roughly a **$35k–$70k** asset.

## The number that decides it

Scenario A turns ~$50k into ~$150k over 24 months of full-time work — about
**$4k/month of implied compensation** for running it. That is not obviously better
than the alternative use of the same two years.

Scenario B costs the same two years and roughly **doubles the exit**, and the work
that gets there is already specified in `CHURN-PLAYBOOK.md` and
`docs/checkout-leak.md`. Neither requires a single additional visitor.

**The two years are not the lever. Churn is.** Selling at current growth prices in
55%/yr churn and a plateaued single channel; every month spent on traffic instead of
retention raises a ceiling the business is nowhere near.

## Caveats

- **These are revenue multiples. There is no P&L in this repo.** If net margin is
  below ~60% after data-supplier costs, shave the ranges. Get the supplier invoices
  into a file before quoting any of this to a buyer.
- Non-recurring pack revenue (89 lifetime pack buyers) is excluded — it carries a
  much lower multiple than subscription ARR and buyers will strip it out.
- ARPU held flat at $62.50 across all scenarios.
- Sep 2026 is a 5-day partial month.

## Re-run the measurements

```sql
-- MRR base
select plan_type, count(*) from linkfinderai_users
where subscription_id is not null group by plan_type order by plan_type;

-- usage trend (the number that is growing)
select date_trunc('month', timestamp)::date as m,
       count(distinct user_id) as active_users, count(*) as rows
from enrichment_history where timestamp >= '2026-01-01' group by 1 order by 1;
```
