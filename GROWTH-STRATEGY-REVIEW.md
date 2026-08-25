# Growth strategy review — the "YouTube + backlinks → $4k MRR in 6 months" bet

**Date:** 2026-08-25 · **Sources:** PostHog project 263837, Supabase `snxhsboboatjywgwdeds`

Written because this session is ephemeral. Re-run the queries at the bottom to refresh.

---

## Verdict in one line

The channels are right; the *sequence* is wrong. Acquisition is already working —
**74% of paying subscribers ran zero enrichments in the last 30 days.** Fixing that
alone reaches $4k MRR in six months with no new traffic at all, and makes every
future backlink and video permanently worth more.

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
- **YouTube is early traction, not noise** — see the correction below. It is the
  fastest-growing source proportionally, though the demo recording remains a blocked
  manual step per `CLAUDE.md`.

## Finding 3b — correction: YouTube is already working (but not yet paying)

An earlier draft of this doc called YouTube "noise". That was wrong, and the weekly
data shows why:

| Week | YouTube visitors | Pageviews | Pages/visit |
| --- | --- | --- | --- |
| Jun 22 – Jul 20 | 1–5 | 1–22 | ~2 |
| **Jul 27** | 21 | 119 | 5.7 |
| **Aug 3** | 27 | 206 | 7.6 |
| **Aug 10** | 33 | 226 | 6.9 |
| Aug 17 | 19 | 63 | 3.3 |

Something started sending traffic in late July — a **5–6× step change** — and those
visitors read **7–8 pages per session**, far above site average. That is the profile
of high-intent, pre-qualified traffic, exactly the argument for the channel.

First-touch cohorts over 90 days confirm the quality:

| First touch | People | Signups | Activated | Saw pricing | Paid |
| --- | --- | --- | --- | --- | --- |
| YouTube | 32 | 28 (88%) | 24 | 5 (18%) | **0** |
| Search | 1,043 | 967 | 737 | 160 (17%) | 12 (1.2%) |
| Reddit | 46 | 37 | 32 | 11 (30%) | 0 |

> Denominators are unreliable — `$initial_referring_domain` is only populated for
> identified persons, so anonymous visitors fall into the `other` bucket (24,357
> people, 294 signups). Compare the *downstream ratios*, not the visitor→signup rates.

**YouTube signups reach pricing at the same rate as search (18% vs 17%).** They are
not worse visitors. And 0 payers from 28 signups is not evidence of failure either —
at the site-wide 1.2% signup→paid rate, the expected value is 0.3 payers. The sample
is simply too small to distinguish.

The correct conclusion is not "YouTube doesn't work". It is: **YouTube feeds the same
leaky bucket as every other channel.** 28 signups produced 0 subscribers because
*1.2% of all signups become subscribers*, regardless of where they came from.

### What YouTube would have to do to carry the plan alone

$2,110 of new MRR = ~34 net subscribers. At the current 1.2% signup→paid, that needs
~2,800 signups, i.e. **~3,200 YouTube visitors** — and more once 6.5% monthly churn is
netted out. Today YouTube sends ~110/month. That is a sustained **5–10× increase**,
built video by video, on a channel whose recording step is manually blocked.

At a repaired 3% signup→paid, the *same* traffic delivers 2.5× the subscribers — and
every video made after the fix keeps that multiple permanently, because the content
compounds against the repaired funnel rather than the broken one.

**This is a sequencing argument, not a channel argument.** Compounding cuts both ways:
6.5% monthly churn compounds against you at the same time the content compounds for
you. Fix the funnel first and every video ever made afterwards is worth more.

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
| **6** | **YouTube** — real early traction (5× step change in Aug, 7–8 pages/visit). Keep publishing at a low, steady cadence; do **not** make it the growth bet until signup→paid is fixed. Every video made post-fix is worth ~2.5× one made today | steady | Compounds — but against a repaired funnel |
| **7** | **AEO** — instrument LLM referral → signup before investing. It is currently shrinking | — | No signal yet |

Keep both halves of the original bet — but **reorder them**. SEO and YouTube are both
real compounding assets and neither should stop. What they should not be is the
*mechanism* for reaching $4k in six months, because both deliver their return into a
funnel that converts 1.2% of signups and loses 6.5% of subscribers a month.

Spend weeks 1–4 on retention and checkout. Then let SEO and YouTube compound into a
funnel that is worth 2–3× more per visitor — permanently.

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
