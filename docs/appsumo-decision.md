# AppSumo: the decision, and what has to be true first

**Date:** 2026-09-05 · **Sources:** the docs cited inline, all in this repo.
Written because this session is ephemeral. Update it when the answer changes.

## The one-line answer

**Not yet — and not as a credit stockpile.** An AppSumo lifetime deal converts a
one-time payment into unbounded, permanent cost of goods on a product whose COGS
per credit **this repo has never measured**, and routes the upsell that is
supposed to justify it through a checkout where **35 of 42 plan selections never
reach a payment page**. Both are fixable in weeks. Neither is fixed today.

This is a sequencing objection, not a channel objection. The same argument
`GROWTH-STRATEGY-REVIEW.md` makes about YouTube applies with more force here,
because an LTD is irreversible: a bad video stops costing you the day you stop
publishing, a bad LTD costs you every month for the life of the account.

---

## 1. Why an LTD is structurally more dangerous here than for most SaaS

A normal SaaS LTD sells access to software you have already built. Marginal cost
per extra user is near zero, so the worst case is support load.

**LinkFinder resells third-party data.** Every credit spent is a real invoice
from a supplier. An LTD sells *unlimited future supplier invoices for one
payment*. That is a different instrument, and it has to be priced like one.

### 1a. Nobody has ever checked the supplier invoice

`docs/credit-grant.md` flagged this in August and it was never closed:

> "If your supplier charges anywhere near $0.40 a lookup, this takes that line
> from ~70% margin to ~35%. **Check the supplier invoice before halving it.**"

That check is still outstanding. `grep -rn "COGS\|cost per\|per lookup"` across
the whole repo returns that one line and nothing else. **You cannot price an LTD
without a COGS-per-credit number.** Everything below is arithmetic you can only
finish once you have it.

### 1b. The AppSumo persona is the exact usage shape that already loses money

`docs/data-provider-angle.md` identifies two usage shapes. Shape A — "bulk
resolver (dies)" — is the AppSumo buyer, precisely:

| user | lookups | types | active days | still here |
| --- | --- | --- | --- | --- |
| digitalmarketing@kbscorporate.com | 14,064 | one type only | 6 | no |
| steven@salesignition.com | 9,058 | one type only | 4 | no |
| ayamit05@gmail.com | 3,274 | one type only | 5 | no |

> "These people had a list. They resolved the list. The job finished, so they
> finished. 26,000 lookups between them and zero of them is still here."

Now price that as an LTD. On a $59 tier, on AppSumo's typical first-deal split,
you net roughly **$18**. The first user above would burn **14,064 credits** —
about **$350 of list value at PAYG rates** — inside six days, and then leave.

That is a ~20:1 ratio of value delivered to revenue kept, on the single most
common AppSumo behaviour there is. It is not a tail risk. It is the median
Sumo-ling.

### 1c. Phone lookups are the landmine

From `docs/credit-grant.md`: phone is **27% of all credit consumption from 0.5%
of runs** (50 credits a lookup), and phone data is the most expensive thing most
enrichment vendors resell. A single LTD holder with a 10,000-credit monthly
allowance can pull **200 mobile numbers every month, forever, for one payment of
$18 net.** If phone COGS is anywhere near $0.40, that one account costs you
$80/month in perpetuity.

**Phone must not be in any LTD tier at any allowance.** This is the one
non-negotiable in the whole document.

### 1d. The 60-day refund window is a free-credits window

AppSumo refunds are effectively no-questions for 60 days. A Shape A user redeems,
resolves their entire list in 4–6 days (see the table above), and refunds in week
three. You keep nothing and paid the supplier for all of it. Any LTD you sign
needs the allowance to be **monthly and non-rollover**, so the first 60 days can
only ever cost you two months of allowance rather than the whole lifetime grant
up front.

### 1e. The audience is the audience you already can't monetise

`docs/traffic-capture-verdict.md` diagnosed the current traffic problem:

> "The intent that brings them is **'do this myself, cheaply.'** You cannot sell
> 'don't do it yourself' to an audience defined by wanting to do it themselves."

AppSumo is that intent, concentrated and self-selected, with a coupon. Meanwhile
`docs/data-provider-angle.md` establishes that the customers who *survive* are
agencies and RevOps teams buying recurring account-list maintenance at
$500–1,500/month. **Those people are not on AppSumo.** An LTD does not move you
toward the ICP that retains; it buys several thousand more of the one that
doesn't, and makes them permanent.

### 1f. It will corrupt every metric these docs depend on

Every analysis in `docs/` is built on `linkfinderai_users` and PostHog funnels.
Drop 2,000 LTD accounts into that base and signup→paid, activation, churn and
ARPU all become uninterpretable — and `is_unlimited` is *already* an overloaded
flag that has caused one documented mistake (`docs/dfy-activation-campaign.md`
corrects a "120 paying accounts" figure that was really 31 subscribers + 89 pack
buyers).

**If you launch, add a `source` column to `linkfinderai_users` set to
`'appsumo'` on redemption, before the first code is issued.** Retrofitting it is
guesswork. This is a one-hour job that protects every future decision.

---

## 2. The gate list — what must be true before you sign

Ordered. Nothing below the first unfinished line matters yet.

| # | Gate | Why | State today |
| --- | --- | --- | --- |
| 1 | **COGS per credit, per lookup type, from the actual supplier invoice** | You cannot price the deal without it. Everything else is arithmetic on top. | **Never measured** (`docs/credit-grant.md`) |
| 2 | **Checkout leak closed** | The entire ROI of an LTD is the upsell. 35 of 42 plan selections never reach a payment page — you would take the COGS and lose the upgrade revenue. | **Open** (`docs/checkout-leak.md`) |
| 3 | **`find_company_employees` placeholder-row bug fixed** | It returns the Apify actor's own marketing copy as if it were people, and leaks that the data is third-party. Shipping that to a review-driven audience buys a permanent 3-star page. | **Open** (`docs/lead-search-bugs.md`, bug 2) |
| 4 | **The redeem worker audited for one-time use, stacking and revocation** | `linkfinder-redeem` is live but **not in this repo**, so it is unaudited from here. AppSumo requires unique single-use codes, tier stacking, and deactivation on refund. `redeem-code.html` currently just forwards the code as a token. | **Unknown** |
| 5 | **API rate limits per account** | LTD + unmetered API is one script away from an unbounded supplier bill. | Unverified |
| 6 | **`source='appsumo'` on `linkfinderai_users`** | Protects every metric in `docs/`. | Does not exist |

Gates 2 and 3 are the ones already on the roadmap for other reasons. Gate 1 is a
phone call to your supplier. **None of this is months of work** — it is the
difference between a launch that funds the next year and one you spend the next
year paying for.

---

## 3. If you go anyway — how to shape it so it cannot kill you

Your call, and there is a real case for it (§4). If you proceed, the deal design
matters more than the launch:

1. **Sell a recurring monthly allowance, never a stockpile.**
   "5,000 credits **per month**, for life" — not "50,000 credits, one time."
   A monthly non-rollover reset caps your maximum exposure per code at a known,
   bounded number forever. **Rollover recreates the stockpile** and must not
   exist at any tier.
2. **Exclude phone entirely.** See §1c. If you must include it, hard-cap phone
   lookups per month independently of the credit balance, in the worker, not in
   `app.html` — per `docs/credit-grant.md`, `deductCredits()` is client-side
   only and the real charge happens server-side.
3. **Keep the machines out of the deal.** CRM enrichment-on-write, scheduled
   re-checks, account-list maintenance — `docs/data-provider-angle.md` §3 — are
   the $500–1,500/month products. They are also the only features that consume
   credits *with no user action*, which is exactly the wrong property to grant
   for life. Keeping them out preserves the upsell and caps the liability in one
   decision.
4. **Set the allowance from gate 1, not from what looks generous.** The formula,
   once you have COGS:

       months_to_underwater = net_per_code / (monthly_allowance × utilisation × COGS_per_credit)

   At $18 net, a 5,000-credit allowance, 20% utilisation and $0.004/credit, you
   are underwater in **month 5**. At $0.001/credit, month 18. If that number is
   under ~24 months, the deal only works via upsell — which is why gate 2 is
   non-negotiable.
5. **Price tier 1 to be genuinely too small for an agency.** The upgrade path is
   the product. Make tier 1 solve a personal-use job and tier 3 stop short of
   what a 20-client agency needs.
6. **Cap the low-conversion geos out of the deal if AppSumo permits it.**
   `docs/geo-pricing.md`: five countries are 55% of signups and 5% of revenue, a
   24× conversion gap. An LTD makes that mix permanent instead of merely current.
7. **Staff the first 30 days as support, not as growth.** One founder, a review
   page that outranks nothing yet but lives forever, and a known data-quality
   bug is the combination that produces a bad permanent asset.

---

## 4. The honest case *for* doing it

Not a strawman — these are real and they are why this is a judgement call, not a
rule:

- **Cash now.** 1,000 sales at ~$18 net is ~$18k — roughly **nine months of
  current MRR** (~$1,939) in one month, non-dilutive. That funds the CRM machine
  in §3 of `docs/data-provider-angle.md`, which is the actual path to
  $500–1,500/account.
- **A DR-90-ish backlink and a permanent listing.** 85% of traffic is search
  (`GROWTH-STRATEGY-REVIEW.md`); AppSumo's domain authority is not nothing.
- **Reviews and social proof**, which the G2 campaign is separately trying to
  manufacture (`docs/g2-review-campaign-plan.md`).
- **A large cohort to learn from at once.** 1,000 activations in a month against
  ~600 signups/month today is a genuine research asset — *if* gate 6 is in place
  so you can still tell them apart from organic users.

The case against is not that these are false. It is that **every one of them is
still true in eight weeks**, and the gates are not.

---

## 5. What to do in the meantime — the levers that need no AppSumo

Ranked by expected value per week of work, from this repo's own measurements.
Together these are worth roughly **$1,300/mo new MRR plus ~$1,400 protected**
against a ~$1,939 base (`docs/revenue-levers-2026-08.md`) — with no new traffic.

1. **Close the checkout leak.** 42 real plan selections produced 7 redirects over
   21 days; August had 8 payments total. Recovering two or three is a ~30% month.
   The instrumentation to name it already shipped — read the table in
   `docs/checkout-leak.md` and act on the first row that matches. *(Also gate 2.)*
2. **Reconnect the 38 Instantly mailboxes.** All at `status: -1`,
   `autofix_failed: true` — an OAuth reconnection, not a rebuild. **Five written
   campaigns have never sent a single email.** Capacity waiting on the other
   side: 180/day, ~900 prospects/month (`OUTBOUND-CRM-AUDIT.md`).
3. **Rewrite the post-first-result offer.** 739 users see it, **2 click (0.3%)**.
   It is the highest-volume copy surface in the product and it is doing nothing.
   Then ungate the bulk nudge, which currently reaches 2.3% of activated users
   (`FUNNEL-REVIEW.md`).
4. **Scale "stop doing these one at a time".** 6 `csv_uploaded` from 54 sends
   (11%), and bulk users pay at 8.3% vs ~1% baseline. **1,319 users qualify and
   54 have been sent to.** Send the next 200 before trusting the projection
   (`docs/revenue-levers-2026-08.md`).
5. **Deploy task #25 and ship the monthly re-check cron.** CRM sync-on-write is
   ~90% built and the subscriber gate is written and undeployed. This is the only
   mechanism in the product that consumes credits without the user doing
   anything — which `docs/data-provider-angle.md` identifies as the entire
   retention problem, and the only route from $89 to $1,000 an account.
6. **The 67 idle credit-pack buyers**, hand-sent from the personal inbox, 18
   confirmed addresses first (`docs/dfy-activation-campaign.md`).
7. **The 114 integrated non-payers.** They wired LinkFinder into their own stack
   and never bought anything. Nothing in the product treats them as a segment
   (`FUNNEL-REVIEW.md` §4).

Items 1, 3 and 5 are also gates or force-multipliers for an AppSumo launch. **Do
them and the launch gets better; skip them and the launch is what pays for
learning them.**

---

## 6. One number to settle it

Fill this in the day the supplier invoice arrives:

    COGS per credit                 = $______
    Net per code (after AppSumo)    = $______
    Monthly allowance offered       =  ______ credits
    Observed utilisation            =  ______ %

    months_to_underwater = net / (allowance × utilisation × COGS)

**Under 24 months, the deal is an upsell bet, not a cash sale — and gate 2 has to
be closed first.** Over 24 months, and with phone excluded and the allowance
monthly, it is a defensible bet worth taking.

Nothing here says no. It says: get one number, close one bug, and then the answer
is arithmetic instead of a feeling.
