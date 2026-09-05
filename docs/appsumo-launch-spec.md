# AppSumo launch spec — the deal shape, the guards, the upsell

**Date:** 2026-09-05 · **Status:** launching, decision made.
Companion to `docs/appsumo-decision.md` (the gates). This file is the *how*.

The objective, in Elias's words: **don't lose money on most LTD buyers, and
upsell the ones who stay.** Both are achievable. This is what each requires.

---

## 1. The churn observation changes the answer — write it down

> *"LTD users will very likely not come back after 2-3 months max for the vast
> majority of them."*

This is correct and the repo already evidences it: of 1,401 users who ever
enriched, **31 reached 4+ active days (2.2%)**, and the Shape A bulk resolvers
die in 4–6 days (`docs/data-provider-angle.md`). Assume it.

It has **two consequences that point in opposite directions**, and both matter:

**Good news — it makes a monthly allowance nearly free.** A perpetual monthly
grant to someone who stops showing up in month 3 costs three months, then zero,
forever, automatically. The "unbounded perpetual liability" objection to an LTD
mostly dissolves.

**Bad news — it makes the upsell window 60–90 days, and then it shuts.** You
cannot run a patient nurture sequence and monetise these people in month six.
There is no month six. Everything in §5 is built around that.

**And it makes the stockpile shape strictly worse**, because a one-time credit
grant gets drained in exactly the window where churn *hasn't* happened yet — and
that window is also AppSumo's 60-day no-questions refund window. Churn does not
protect you from a stockpile. It only protects you from a monthly cap.

---

## 2. The numbers

Model: `scripts/ltd-model.py` — re-run it with the real COGS. 1,000 codes at $18 net (a $59 tier, ~30% seller share —
**verify against the real contract**) = $18,000 gross to you.

Churn applied: 100% / 40% / 15% / 7% / 5% / 4% of activators in months 1–6, then
a 3% residual carried two years = **2.43 effective full-consumption months per
code.** Consumption bands from `docs/credit-grant.md` (median 9, p90 121 over six
weeks), scaled 3× because LTD buyers self-select heavier.

| COGS/credit | Monthly cap 2,000 | **Monthly cap 5,000** | Stockpile 25,000 | Stockpile 50,000 |
| --- | --- | --- | --- | --- |
| $0.0005 | $236 | **$309** | $919 | $1,794 |
| $0.0010 | $472 | **$618** | $1,837 | $3,587 |
| $0.0020 | $944 | **$1,236** | $3,674 | $7,174 |
| $0.0040 | $1,889 | **$2,472** | $7,348 | **$14,348** |
| $0.0080 | $3,777 | **$4,944** | **$14,696** | **$28,696** |

Kept after data cost, on a **5,000/month non-rollover cap**:

| COGS/credit | Kept of $18,000 |
| --- | --- |
| $0.0010 | $17,382 (97%) |
| $0.0020 | $16,764 (93%) |
| $0.0040 | $15,528 (86%) |
| $0.0080 | $13,056 (73%) |

**The monthly cap survives every plausible COGS.** The 50,000 stockpile loses
money outright above $0.008 and eats most of the proceeds at $0.004 — *before*
refunds. That is the entire decision, and it costs you nothing to take the safe
side of it.

> These are estimates on an unmeasured COGS. They rank the two deal shapes
> reliably; they do not predict your P&L. Re-run with the real invoice.

---

## 3. Tier design

Three stacking tiers, AppSumo-standard. **Monthly, non-rollover, no phone.**

| | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| Price | $59 | $119 | $199 |
| Credits **per month**, non-rollover | 2,000 | 5,000 | 12,000 |
| Bulk CSV | ✓ | ✓ | ✓ |
| API + MCP | — | ✓ | ✓ |
| Phone lookups | **excluded** | **excluded** | **excluded** |
| CRM sync-on-write | — | — | — |
| Scheduled re-checks / list maintenance | — | — | — |
| Google Sheets add-on | ✓ | ✓ | ✓ |

**Why these choices:**

- **Non-rollover is the whole safety mechanism.** Rollover recreates the
  stockpile and the table in §2 flips to the right-hand columns. There is no
  version of this deal with rollover that I would sign.
- **Phone excluded at every tier.** 50 credits a lookup, **27% of all credit
  consumption from 0.5% of runs**, and the priciest line any enrichment vendor
  resells (`docs/credit-grant.md`). It is also the best upsell bait you own —
  see §5.
- **CRM sync and scheduled re-checks are out.** They are the $500–1,500/month
  products (`docs/data-provider-angle.md` §3) *and* the only features that spend
  credits with no user action — precisely the wrong property to grant for life.
  Holding them back preserves the upsell and caps the liability in one decision.
- **API gated to tier 2+.** It raises AOV and it halves the number of accounts
  that can script against you.
- **Tier 1 deliberately too small for an agency.** The upgrade path is the
  product.

---

## 4. The guards — what must ship before a single code is issued

Found by reading the code this session. Several are live bugs today; they become
expensive at AppSumo scale.

### G1 · Monthly reset job
A cron that sets `credits = tier_allowance` on the 1st for every `source =
'appsumo'` account. **Non-rollover: assign, never add.** Nothing like this exists
today — the whole product is stockpile-shaped, so this is genuinely new work and
it is the single most important item here.

### G2 · Phone blocked server-side, not in `app.html`
`docs/credit-grant.md` is explicit: `deductCredits()` in `app.html` only updates
the number in the browser; the real charge happens server-side in n8n. **A
client-side block is not a block.** `linkedin_profile_to_phone` must be refused
for LTD accounts in n8n and in the API path, or one curl gets around it.

### G3 · Cap the two uncapped per-record operations
`mcp-server/src/server.ts:99-100` — `find_company_employees` and
`find_linkedin_post_reactions` **bill per record instead of per call**, and
reactions has **no cap parameter at all**. A viral LinkedIn post has tens of
thousands of reactions; `app.html:3410` does `deductCredits(data.length)` for
every one. One call against the right post drains any allowance you set and
generates the supplier cost to match. **Cap reactions server-side** (2,000 is
generous) and require an explicit `employee_count` on the employees path.

### G4 · The employees price disagrees with itself, 2×
- `app.html:3412` charges **0.5 credit per employee**
- `mcp-server/src/server.ts:99` documents **1 credit per employee**

One of them is wrong and the server is the one that actually bills. This is
exactly the failure `docs/credit-grant.md` warned about — *"users see 25 credits,
get charged 50, and find out on refresh."* Shipping that to 1,000 deal-hunters
with a public review page is a bad way to find out which number is real.
**Reconcile before launch.** `tests/auto-topup-pricing.test.mjs` already proves
the pattern for pinning prices across files; extend it to `creditCosts`.

### G5 · No pre-flight affordability check on variable-cost operations
`app.html:3317` explicitly excludes `employees` from
`updateAffordabilityWarning()`, because the cost isn't known until results
return. So an account with 10 credits can start a job that costs 500. Confirm the
server refuses (the API does return **402 Insufficient credits** —
`mcp-server/src/client.ts:74`) rather than letting the balance go negative.
**Test it: an LTD account at 0 credits, one employees call, one reactions call.**

### G6 · API rate limit per account
LTD + unmetered API is one script away from an unbounded supplier bill. Per-token
requests/minute and requests/day, enforced at the worker.

### G7 · `source` column on `linkfinderai_users`
Set `'appsumo'` at redemption, **before the first code ships**. Every analysis in
`docs/` runs on this table; 1,000 untagged LTD accounts make signup→paid,
activation, churn and ARPU uninterpretable. `is_unlimited` has already caused one
documented misread (`docs/dfy-activation-campaign.md`). Retrofitting is guesswork.

### G8 · Fix the token leak first — this one is a security issue
`workers/auto-topup-charge/README.md` records it: **`auto-topup-settings` is
reachable from the internet with `Access-Control-Allow-Origin: *` and no shared
secret, and its `list_enabled` action returns every enrolled user's token.** A
token is this app's entire credential — it is what `?token=` uses to read
credits, history and account data. Requiring a shared secret on `list_enabled`,
`acquire_lock` and `release_lock` is a small change and it is not optional before
you put thousands of new accounts behind it.

### G9 · Audit the redeem worker
`linkfinder-redeem` is live but **not in this repo**, so it is unaudited from
here. AppSumo needs unique single-use codes, tier stacking, and deactivation on
refund. `redeem-code.html:466` currently forwards the code straight through as a
`?token=`, which is not a redemption scheme. Pull it into `workers/` and read it.

### G10 · Fix the `find_company_employees` placeholder bug
It returns the Apify actor's own marketing copy — `⚠️ No Leads found`,
`❤️ Check the log` — as if those were people (`docs/lead-search-bugs.md` bug 2).
Three-line fix: drop rows with a null `personId`, lowercase the `seniority` and
`department` filters, return an empty array and don't charge. Shipping this to a
review-driven audience is how you get a permanent 3-star page.

---

## 5. The upsell machine — build it before launch, not after

**You have 60–90 days per buyer. Design for that, not for a drip.**

### 5a. Deploy auto top-up — the highest-value single action here
`workers/auto-topup-charge/` is **built, priced correctly, and inert.** Its own
README:

> *"This worker is not deployed by anything in this repo, and the pricing fix is
> not live until someone deploys it… auto top-up is inert until the deploy
> happens."*

It charges the saved card at **PAYG rates ($0.025/credit)** when the balance
falls under a threshold. That is 12–50× your likely COGS. **This is the mechanism
that converts a heavy LTD user from your worst account into your best one** — the
Shape A bulk resolver with a 14,000-row list either stops at the cap or pays
PAYG for the overage. Without it deployed, they just stop, and you get nothing.

    cd workers/auto-topup-charge && npx wrangler deploy

Diff `worker.js` against the live version first — the README warns the deployed
copy may have moved on.

### 5b. Make the cap the pitch, not the punishment
When an LTD account hits its monthly ceiling, the modal is the whole upsell. Two
offers, in this order:

1. **Auto top-up** — "keep going now, $25 per 1,000 credits, charged to your
   card." Immediate, no decision about identity.
2. **A subscription** — Starter $49/5,000. Per `CLAUDE.md`, **never recommend
   PAYG to a CRM user**; but an LTD holder is not a CRM user, so PAYG-first is
   correct here and the subscription is the second ask.

Do **not** show the 40%-off discount code (`workers/discount-code/`) to LTD
holders. It is the last-resort credit-wall offer for people who have never paid;
an LTD holder has paid, and burning it here trains them to wait for a discount.
The worker already refuses subscribers — **extend that guard to
`source='appsumo'`.**

### 5c. Phone is the upsell, because you excluded it
Excluding phone from the tiers isn't only a cost guard — it creates the one thing
an LTD holder cannot get by waiting. Show phone in the UI, priced, greyed, with
"available on any paid plan or with credits." 50 credits a lookup at PAYG is
$1.25, and it is the feature heavy users want most.

### 5d. Front-load everything to week 1–3
The lifecycle machinery already exists in PostHog Workflows
(`workers/lifecycle-email/`) and the cohorts are behavioural. Build an
`source='appsumo'` branch with the asks compressed:

| When | Ask |
| --- | --- |
| Day 0 | Onboarding — get them to a first result. 69% activation is the healthiest step you have (`FUNNEL-REVIEW.md`); protect it. |
| Day 1–3 | **Get them to upload a CSV.** Bulk users pay at 8.3% vs ~1% baseline. This is the single strongest predictor of payment in the whole dataset. |
| Day 7 | Phone teaser (5c). |
| Day 14 | Auto top-up enrolment offer, framed as "never hit the cap". |
| Day 30 | Subscription ask, with their own usage numbers — `user_value_summary()` already computes what they actually *found* (`docs/account-value-summary.md`). "You found 1,240 emails last month" is the only upsell that works on someone who got value. |
| Day 45–60 | Last ask before they go quiet. Assume no month 4. |

**One switch still blocks the reporting:** PostHog → Settings → Workflows →
**Engagement events is off, and it does not backfill.** Turn it on before launch
or you get no open/click/bounce data for the entire campaign, permanently.

### 5e. Fix the post-first-result offer before 1,000 people see it
739 users have seen it and **2 clicked (0.3%)** (`FUNNEL-REVIEW.md`). It is the
highest-volume copy surface in the product. Putting an AppSumo cohort through it
unchanged wastes the best upsell moment you will get with these people.

### 5f. Close the checkout leak — the upsell has nowhere to land without it
**35 of 42 plan selections never reach a payment page** (`docs/checkout-leak.md`,
still open). Every ask in 5b–5d terminates in that checkout. The instrumentation
to name the cause already shipped; walk the table in that doc and act on the
first row that matches. **If only one thing on this page gets done, make it this
one** — without it you take all the COGS and collect none of the upgrade revenue.

---

## 6. Launch order

| # | Item | Guard |
| --- | --- | --- |
| 1 | COGS per credit from the supplier invoice | gate 1 |
| 2 | Close the checkout leak | 5f |
| 3 | Deploy auto top-up | 5a |
| 4 | `source` column + monthly reset cron | G7, G1 |
| 5 | Phone blocked server-side; reactions capped; employees price reconciled | G2, G3, G4 |
| 6 | Fix the token leak | G8 |
| 7 | Audit the redeem worker for single-use / stacking / revoke-on-refund | G9 |
| 8 | Fix the employees placeholder bug | G10 |
| 9 | API rate limits; 402 verified at zero balance | G5, G6 |
| 10 | PostHog engagement events ON; lifecycle branch built | 5d |
| 11 | Rewrite the post-first-result offer | 5e |
| 12 | **Ship codes** | |

Items 2, 3, 5e and 11 are worth doing whether or not AppSumo happens — they are
the top of `docs/revenue-levers-2026-08.md` already.

---

## 7. What to measure, and the one number that decides it

Tag everything `source='appsumo'` and keep it out of the main funnel reporting.

| Metric | Why | Target |
| --- | --- | --- |
| Redemption rate | codes sold → accounts created | — |
| **Activation** (ran an enrichment) | Baseline is 69% | ≥ 69% |
| **CSV upload rate** | The payment predictor: bulk users pay at 8.3% vs ~1% | ≥ 25% |
| **Refund rate** | The 60-day window | < 10% |
| **Auto top-up enrolment** | The cost-recovery mechanism | ≥ 5% |
| **LTD → subscription by day 90** | **The number the deal lives or dies on** | ≥ 3% |
| Credits consumed per active code/month | Validates §2 against reality | < 1,500 |
| Support tickets per 100 codes | Founder time is the hidden cost | — |

**At 1,000 codes, a 3% conversion to Starter is 30 subscribers ≈ $1,470 MRR —
which is roughly a doubling of the business** (~$1,939 today, 31 subscribers).
That, not the $18k, is the reason to do this. The cash is the impulse; the 30
subscribers are the outcome. Every item in §5 exists to move that one line.

And measure it against churn: at 6.5%/mo, 30 LTD-sourced subscribers are ~22 a
year later. The retention work in `CHURN-PLAYBOOK.md` is what makes the launch
compound instead of spike.
