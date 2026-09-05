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

## 2. The numbers — why monthly, not a stockpile

This section compares the two **deal shapes**. The chosen tier allowances are in
§3; the caps below are illustrative.

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

## 3. Tier design — locked

**Two tiers, 2,500 and 5,000 credits per month, non-rollover.** Elias's numbers,
and the ladder is right to stop at 5,000. Reasoning below.

| | Tier 1 | Tier 2 |
| --- | --- | --- |
| Price | $59 | $119 |
| Credits **per month**, non-rollover | **2,500** | **5,000** |
| Bulk CSV · Google Sheets add-on | ✓ | ✓ |
| API + MCP | — | ✓ |
| Phone lookups | **excluded** | **excluded** |
| CRM sync-on-write | — | — |
| Scheduled re-checks / list maintenance | — | — |
| Upgrades to | **Starter** $49/mo | **Professional** $89/mo |

### Why it must stop at 5,000

**Starter is $49/mo for 5,000 credits.** A tier at 5,000/month is already exactly
Starter, for life. Anything above it — a 10,000 or 12,000 tier — hands out *twice*
your entry plan permanently and leaves that buyer nothing to upgrade to short of
Professional at $89. An earlier draft of this spec proposed 2,000/5,000/12,000;
the 12,000 tier was a mistake and is dropped.

At 2,500 and 5,000 every buyer has a real next step:

| Tier | Allowance | Upgrade | Multiple |
| --- | --- | --- | --- |
| 1 | 2,500/mo | Starter $49 (5,000) | **2× credits** + phone + CRM |
| 2 | 5,000/mo | Professional $89 (20,000) | **4× credits** + phone + CRM |

Phone and CRM being excluded at both tiers is what keeps Starter a genuine
upgrade for tier 1 even though the credit jump is only 2×. **This is the reason
the exclusions in §3 are not negotiable** — remove them and tier 1 has no upgrade
path at all.

### The economics of these exact numbers

1,000 codes at a 60/40 tier split, ~30% seller share = **$83,000 gross,
$24,900 net.** Data cost over the full lifetime of every code:

| COGS/credit | Data cost | Kept | % |
| --- | --- | --- | --- |
| $0.0005 | $297 | $30,003 | 99% |
| $0.0010 | $594 | $29,706 | 98% |
| $0.0020 | $1,187 | $29,113 | 96% |
| $0.0040 | $2,375 | $27,925 | 92% |
| $0.0080 | $4,749 | $25,551 | 84% |

*(Table computed on a 50/35/15 three-tier mix before the top tier was dropped, so
it is slightly conservative for the two-tier structure — the direction is safe.)*

**"Don't lose money on most buyers" is satisfied structurally**, not by luck: 55%
of codes never activate and another 25% barely do, so **~80% of codes are pure
margin**. The whole cost sits in the 7% who use it properly.

### The tail still loses money per-account, and that is fine

A single code that maxes its cap every month for two years:

| Tier | at $0.002 | at $0.008 | Net received |
| --- | --- | --- | --- |
| 1 (2,500/mo) | $120 | $480 | $18 |
| 2 (5,000/mo) | $240 | $960 | $36 |

Every one of those is a loss on that account. **This is expected and the
portfolio absorbs it** — the table above already includes them. Two things keep
it bounded: the monthly cap (a stockpile has no such ceiling), and auto top-up
(§5a), which converts exactly this user into a paying one. **A heavy LTD user is
only a loss if auto top-up is not deployed.**

## 4. The guards — what must ship before a single code is issued

Found by reading the code this session. Several are live bugs today; they become
expensive at AppSumo scale.

### G1 · Monthly reset job — **BUILT, not yet applied**

`supabase/migrations/20260905120000_appsumo_ltd.sql`. pg_cron on the 1st at
04:00 UTC, alongside the existing `ai_keywords` jobs. The rule is one line:

    credits := greatest(credits, ltd_monthly_credits)

**Top the balance back up to the allowance; never take anything away.** A plain
`credits = allowance` would delete credits the customer *bought* — an LTD holder
who tops up through auto top-up would watch that balance vanish on the 1st, and
"PAYG credits never expire" is a standing promise on `pricing.html`.

Also ships `appsumo_redeem()` (stacking: tier only ever moves up),
`appsumo_revoke()` (a refund stops the recurring top-up), and the
`appsumo_tiers` table. The granted allowance is **copied onto the user row**, so
re-pricing a tier can never retroactively change a deal somebody already bought.

Idempotent — a second run in the same calendar month is a no-op, so a retried
cron cannot double-grant.

**Verify before applying:** `./scripts/test-appsumo-migration.sh` spins up a
throwaway Postgres, applies the migration and runs 22 behaviour checks
(`supabase/tests/appsumo_ltd_test.sql`) covering non-rollover, purchased-credit
survival, stacking, refunds, idempotency, and that non-LTD accounts are
untouched. **Then apply it to the real project** — writing the migration is not
applying it, and this is the guard the whole deal rests on.

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

### G7 · `source` column on `linkfinderai_users` — **BUILT, not yet applied**
Same migration as G1. Set to `'appsumo'` by `appsumo_redeem()`, indexed, with a
comment on the column telling the next reader to exclude it from every funnel
query. **Applies before the first code ships**. Every analysis in
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

## 5.5 · What the SendPilot launch teaches — and the one thing that does not transfer

**Source:** SendPilot founder's own walkthrough, 13 days post-launch.
$160,000 gross · 1,219 customers · **$131 AOV** · 57 reviews, all 5-star ·
**3.5% refund rate** · 4.91% landing-page conversion · Launch Pad tier, not
Select. Pre-launch they were at ~$5k MRR with **~30 active users** — a comparable
stage to us (~$1,939 MRR, 8 active subscribers), which is why it is worth reading
closely rather than dismissing as survivorship.

### The mechanism, in his words

> *"80% of the revenue is coming through AppSumo's channels."*
> *"You can't compete with AppSumo's distribution. You need to get featured. And
> the way to get featured is reviews."*
> *"Instead of focusing on marketing, all we focused on was fast customer
> response time."* — **average 3 minutes 19 seconds, nights and weekends.**

Fast support → 5-star reviews → algorithmic featuring → AppSumo's email and
affiliate machine → 80% of sales. He ranked #1 in **5 days** and got his first
dedicated email on the Friday after a Monday launch.

### This corrects §5 of this spec

An earlier draft filed support under "staff the first 30 days as support" — a
cost to absorb. **That was wrong. Support response time is the acquisition
channel.** It is not a cost centre attached to the launch; it is the mechanism
that produces the launch's revenue. Reordered accordingly in §6.

### Three things that follow

1. **Week 1 decides the whole outcome.** Featuring is won in ~5 days. There is no
   "fix it in week two" — every guard in §4 must be live before the first code
   ships, and the launch date is the date the guards are done, not a date chosen
   first.
2. **Deploy the support chat worker before launch.** `support-worker/` is an
   LLM-backed support agent that already knows the pricing, product and policy
   facts and can escalate to email + Calendly. Its README says *"This repo has no
   Cloudflare account access wired up, so I couldn't deploy this for you."*
   **Verify whether it is live.** A solo founder cannot hold a 3-minute median
   across nights and weekends unaided; this worker is the only thing in the repo
   that makes that number reachable. It is now a launch blocker, not a nice-to-have.
3. **The refund target tightens.** He ran 3.5%. Use **< 5%**, not < 10%.

### Do NOT point the review-credits machinery at AppSumo

`user_task_completions` / `pending_reviews` already pay credits for G2 and
Trustpilot reviews and auto-verify permalinks
(`docs/g2-review-campaign-plan.md`). Reusing it for AppSumo is the obvious move
and is probably **against AppSumo's terms** — incentivised reviews are a common
prohibition and getting caught can pull the deal. **Read the terms before wiring
anything.** The transferable part of his playbook is not an incentive; it is
*resolve the problem fast, then ask*. Ask by hand, in the support thread, right
after you have solved something.

### The one thing that does not transfer: COGS

SendPilot is **LinkedIn automation** — a seat-based tool whose marginal cost per
extra user is near zero. His $160,000 is nearly all margin, so his "just do it,
worst case is support load" is genuinely safe advice **for him**.

LinkFinder resells third-party data. Every credit is a supplier invoice. This
does not change the decision to launch — it is exactly why the monthly
non-rollover cap in §3 is not negotiable, and why "unlimited" or a large
stockpile, which SendPilot could have offered harmlessly, would be the one
mistake capable of turning a $100k launch into a loss.

His other warning lands squarely on us, though:

> *"Your product will have bugs and it won't be perfect… but you just need to be
> super fast in support."*

True for UX bugs. **Not true for a data product that returns fabricated rows.**
`find_company_employees` currently returns the Apify actor's marketing copy —
`⚠️ No Leads found` — as if it were a person (§4 G10). No support response time
saves a review from someone who paid for contact data and got that. Fix it.

### Raise AOV with a third tier — on zero-COGS dimensions only

His **$131 AOV** against our two-tier $83 says we are leaving money on the table.
The fix is *not* more credits — that reopens the cannibalisation problem in §3.
It is a third tier that escalates on things that cost us nothing per unit:

| | Tier 1 | Tier 2 | **Tier 3** |
| --- | --- | --- | --- |
| Price | $59 | $119 | **$249** |
| Credits/month, non-rollover | 2,500 | 5,000 | **8,000** |
| API + MCP | — | ✓ | ✓ |
| API rate limit | — | standard | **raised** |
| Priority support | — | — | **✓** |
| Team seats | — | — | **✓ (new build)** |
| Phone · CRM sync · scheduled re-checks | excluded | excluded | **excluded** |
| Upgrades to | Starter $49 | Professional $89 | Professional $89 |

Economics, 45/35/20 split, 1,000 codes:

| | Two tiers | **Three tiers** |
| --- | --- | --- |
| AOV | $83 | **$118** (90% of SendPilot's) |
| Net to us | $24,900 | **$35,400** |
| Kept at $0.002/credit | 96% | **97%** |
| Kept at $0.008/credit | 82% | **87%** |

**+$10,500 net and the data cost barely moves**, because T3's increment is mostly
non-COGS and because 80% of codes never consume much regardless. T3 at 8,000/mo
sits above Starter, so its upgrade path is Professional — which is correct, since
T3 buyers are the ones who can pay $89. Seats are a genuine new build; if that is
too much before launch, drop seats and keep the raised rate limit and priority
support, and price T3 at $199.

Model: `scripts/ltd-aov.py`.

---

## 6. Launch order

Support capability is now item 1, not a footnote — §5.5 is why.

| # | Item | Ref |
| --- | --- | --- |
| 1 | **Support: chat worker deployed + a 5-min response commitment you can actually hold** | 5.5 |
| 2 | COGS per credit from the supplier invoice | decision doc, gate 1 |
| 3 | Close the checkout leak | 5f |
| 4 | Deploy auto top-up | 5a |
| 5 | `source` column + monthly reset cron | G1, G7 |
| 6 | Phone blocked server-side; reactions capped; employees price reconciled | G2, G3, G4 |
| 7 | Fix the employees placeholder bug — a data product cannot ship this | G10 |
| 8 | Fix the auto-topup token leak | G8 |
| 9 | Audit the redeem worker: single-use, stacking, revoke-on-refund | G9 |
| 10 | API rate limits; 402 verified at zero balance | G5, G6 |
| 11 | PostHog engagement events ON; lifecycle branch built | 5d |
| 12 | Rewrite the post-first-result offer | 5e |
| 13 | **Ship codes** — and then do nothing but support for two weeks | |

Items 3, 4, 12 are worth doing whether or not AppSumo happens — they are already
the top of `docs/revenue-levers-2026-08.md`.

**The launch date is the date item 12 is done.** Featuring is won in the first
five days and cannot be re-won later; shipping into a half-ready product spends
the one week that decides the outcome.

---

## 7. What to measure, and the one number that decides it

Tag everything `source='appsumo'` and keep it out of the main funnel reporting.

| Metric | Why | Target |
| --- | --- | --- |
| Redemption rate | codes sold → accounts created | — |
| **Activation** (ran an enrichment) | Baseline is 69% | ≥ 69% |
| **CSV upload rate** | The payment predictor: bulk users pay at 8.3% vs ~1% | ≥ 25% |
| **Refund rate** | The 60-day window. SendPilot ran 3.5% | **< 5%** |
| **Auto top-up enrolment** | The cost-recovery mechanism | ≥ 5% |
| **LTD → subscription by day 90** | **The number the deal lives or dies on** | ≥ 3% |
| Credits consumed per active code/month | Validates §2 against reality | < 1,500 |
| **Median support response time** | The acquisition channel, not a cost (§5.5) | **< 5 min** |
| **AppSumo reviews, and the star average** | What wins featuring, which is 80% of sales | 5-star |

**At 1,000 codes on the two-tier split (600 / 400), the upsell is worth:**

| T1 → Starter | T2 → Professional | New MRR | vs $1,939 today |
| --- | --- | --- | --- |
| 2% (12 subs) | 1% (4 subs) | **$944** | +49% |
| 3% (18 subs) | 2% (8 subs) | **$1,594** | +82% |
| 5% (30 subs) | 3% (12 subs) | **$2,538** | +131% |

**That, not the $24,900, is the reason to do this.** The cash is the impulse; the
subscribers are the outcome. Every item in §5 exists to move those two rates, and
they are the two numbers to report weekly.

Note tier 2 converts at a lower rate by design — it is a $89 ask, not a $49 one.
Do not read a lower T2 number as failure.

And measure it against churn: at 6.5%/mo, 30 LTD-sourced subscribers are ~22 a
year later. The retention work in `CHURN-PLAYBOOK.md` is what makes the launch
compound instead of spike.
