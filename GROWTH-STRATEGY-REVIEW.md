# Growth strategy review — the "YouTube + backlinks → $4k MRR in 6 months" bet

**Date:** 2026-08-25 · **Sources:** PostHog project 263837, Supabase `snxhsboboatjywgwdeds`

Written because this session is ephemeral. Re-run the queries at the bottom to refresh.

---

## Verdict in one line

The plan is aimed at the wrong bottleneck. Acquisition is already working;
**74% of paying subscribers ran zero enrichments in the last 30 days.** Fixing that
alone reaches $4k MRR in six months with no new traffic at all.

---

## Where the business actually is

| Metric | Value |
| --- | --- |
| MRR | **~$1,939** (21 Starter · 8 Pro · 1 Enterprise · 1 legacy) |
| Subscribers | 31 · ARPU $62.50 |
| Total user rows | 6,652 (+88 credit-pack buyers, non-recurring) |
| Visitors | ~7,500/mo, **85% from search** |
| Signups | ~600/mo (~140/wk, rising) |
| New paying customers | 11 (Jun) → 7 (Jul) → ~7 (Aug run-rate) |
| Churn | ~2 subscribers/mo = **6.5%/mo** |

### The funnel, end to end

    7,500 visitors  →  600 signups (8%)  →  ~540 activate (90%!)  →  ~7 pay (1.2%)

Activation is outstanding — 90% of signups run an enrichment. Nothing is wrong with
the product's first five minutes. Everything falls apart after the credit card.

---

## Finding 1 — subscribers are not using what they pay for

Joining `linkfinderai_users.token` → `enrichment_history.user_id` (note: **`token`,
not `email`** — the email join silently returns zero and looks like total inactivity):

| Plan | Subs | Active in 30d | Avg credits used /30d | Allowance |
| --- | --- | --- | --- | --- |
| Starter | 21 | **5** | 371 | 5,000 (7.4%) |
| Professional | 8 | **2** | 163 | 20,000 (0.8%) |
| Enterprise | 1 | **0** | 0 | 50,000 (0%) |

**8 of 31 paying subscribers were active in the last 30 days.** The Enterprise
customer at $149/mo has used none of their allowance. This is the 6.5% churn rate's
cause, and it is a leading indicator — those 23 dormant accounts are next quarter's
cancellations.

## Finding 2 — the paywall leaks worse than the top of funnel

60-day paywall funnel, unique users:

| Step | Users | Drop |
| --- | --- | --- |
| `pricing_modal_opened` | 259 | — |
| `upgrade_clicked` | 225 | −13% |
| `plan_selected` | 67 | **−70%** |
| `checkout_overlay_opened` | 52 | −22% |
| `checkout_redirect_started` | 21 | −60% |
| `checkout_payment_success` | **16** | −24% |

259 people opened pricing, 16 paid — **6.2%**. The single worst step is
`upgrade_clicked` → `plan_selected`: 158 people gone at the moment they see the plans.

Against 16 successes, the same window logged: 7 `checkout_page_load_timeout`,
7 `checkout_abandoned`, 6 `checkout_closed_before_page_opened`, 4 `checkout_error`,
4 `checkout_redirect_stalled`. Checkout failure incidents are the same order of
magnitude as checkout successes.

> Caveat: `checkout_session_created` only began firing ~Aug 17, so intra-checkout
> ratios are directional. The error volume is real regardless.

## Finding 3 — the two proposed channels have no supporting signal

Monthly unique visitors by source:

| Source | Mar | Apr | May | Jun | Jul | Aug* |
| --- | --- | --- | --- | --- | --- | --- |
| Search | 1,953 | 3,723 | 5,407 | 6,209 | **7,069** | 4,059 |
| Direct | 1,578 | 1,579 | 2,104 | 1,494 | 1,645 | 1,464 |
| Reddit | 251 | 178 | 202 | 227 | 258 | 57 |
| **LLM (AEO)** | 60 | 50 | 44 | 24 | 27 | **21** |
| **YouTube** | 16 | 3 | 10 | 5 | 25 | 88 |

\* Aug is 25 days.

- **SEO already 3.6×'d in four months.** It is the proven engine — but it is an
  existing asset to maintain, not a new bet.
- **AEO/LLM referrals are *declining*** — 60/mo down to 21/mo, straight through the
  landing-page rework that named the AI-visibility outcome. There is no leading
  indicator to justify a six-month AEO investment yet.
- **YouTube is noise** — and per `CLAUDE.md`, the demo recording is a blocked manual
  step that has already produced two thrown-away attempts. Worst effort-to-return
  ratio on the table.

## Finding 4 — search traffic plateaued in July

Weekly visitors peaked at 2,465 (week of Jul 6) and have run 1,570–1,790 since.
Signups rose over the same period, so this is not tracking breakage — it is real.
Seasonality (August, B2B sales tooling) is the benign reading; a ranking loss is the
other. **If SEO is the whole plan, verify this in Search Console before committing
six months to it.**

---

## The arithmetic

$4,000 MRR at $62.50 ARPU = **64 subscribers**, up from 31.

**Status quo** — 7 gross adds/mo, 6.5% churn:

| Month | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Subs | 36 | 41 | 45 | 49 | 53 | **57** |
| MRR | $2,250 | $2,544 | $2,819 | $3,075 | $3,313 | **$3,538** |

Short by ~$460. Needs ~9 gross adds/mo sustained (+30%) to close.

**Halve churn to 3%/mo, add zero traffic:**

| Month | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Subs | 37 | 43 | 49 | 54 | 60 | **65** |
| MRR | $2,319 | $2,688 | $3,044 | $3,388 | $3,725 | **$4,050** |

**Fixing retention alone hits the target.** Traffic is not required.

Also worth knowing: at 6.5% churn the steady-state ceiling is 7 ÷ 0.065 ≈ **108
subscribers (~$6,750 MRR)** no matter how much traffic you add. Churn, not
acquisition, sets the roof. Doubling SEO traffic raises a ceiling you are nowhere
near while the floor keeps falling out.

---

## Recommended reweight

| Priority | Workstream | Effort | Expected |
| --- | --- | --- | --- |
| **1** | **Subscriber activation** — onboard the 23 dormant payers; usage-triggered emails; make the first bulk run happen in week 1 of a subscription | 2–4 wks | Churn 6.5% → 3% = **hits $4k alone** |
| **2** | **Checkout repair** — fix timeout/stall/error paths; instrument fully | days | Recover a share of ~28 failure incidents/60d |
| **3** | **`upgrade_clicked` → `plan_selected`** — 158 users lost at the plan grid | 1–2 wks | 6.2% → 10% paywall conv = +5 adds/mo |
| **4** | **Convert the 88 credit-pack buyers** — already paid once, no subscription. Not CRM users, so subscriptions are the right ask (per `CLAUDE.md`) | 1 wk | Direct upsell list |
| **5** | **SEO/backlinks** — keep running, it is the engine. Check Search Console for the July plateau first | continuous | Maintains the 3.6× trajectory |
| **6** | **YouTube** — defer as a *channel*. If made, embed on money pages for video schema, not for subscribers | — | ~0.5 customers/mo at best |
| **7** | **AEO** — instrument LLM referral → signup before investing. It is currently shrinking | — | No signal yet |

Keep the SEO half of the original bet. Drop the YouTube half. Spend the freed time on
retention and checkout — same upside, two weeks instead of six months, and it raises
the ceiling that SEO would otherwise be pushing traffic into.

---

## Doc corrections found while verifying

- `enrichment_history.user_id` joins `linkfinderai_users.**token**`, not `email`.
  The email join returns zero rows silently and reads as "no subscriber ever used the
  product". Worth adding to `CLAUDE.md`.
- `CLAUDE.md` credit allowances (5,000 / 20,000 / 50,000) match the database.
  `app.html:1770-1772` lists 60,000 / 240,000 / 600,000 — one of the two is stale.
  Prices ($49/$89/$149) agree everywhere.
- `checkout_session_created` was only instrumented ~2026-08-17; treat older
  checkout-funnel ratios as incomplete.

## Queries to re-run

```sql
-- MRR + subscriber mix (Supabase)
select plan_type, count(*) from linkfinderai_users
where subscription_id is not null group by plan_type order by plan_type;

-- Subscriber activity (note: join on token)
with subs as (select token, plan_type from linkfinderai_users where subscription_id is not null)
select s.plan_type, count(*) subs,
       count(*) filter (where h.last_used >= now() - interval '30 days') active_30d,
       round(avg(coalesce(h.credits_30d,0))) avg_credits_30d
from subs s left join (
  select user_id, max(timestamp) last_used,
         sum(credits_used) filter (where timestamp >= now() - interval '30 days') credits_30d
  from enrichment_history group by user_id
) h on h.user_id = s.token
group by s.plan_type order by s.plan_type;
```

```sql
-- Paywall funnel, 60d (PostHog HogQL)
SELECT event, uniq(person_id) AS users, count() AS n
FROM events
WHERE timestamp >= now() - INTERVAL 60 DAY
  AND event IN ('pricing_modal_opened','upgrade_clicked','plan_selected',
                'checkout_overlay_opened','checkout_redirect_started',
                'checkout_payment_success','checkout_error',
                'checkout_page_load_timeout','checkout_redirect_stalled',
                'checkout_abandoned','checkout_closed_before_page_opened')
GROUP BY event ORDER BY users DESC
```
