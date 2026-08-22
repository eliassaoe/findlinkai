# Sizing the free grant, and the phone price

## What users actually consume

639 real enrichers (my three test accounts excluded), six weeks to 22 Aug 2026:

| | credits |
|---|---:|
| median user | **9** |
| mean | 41 |
| p75 | 32 |
| p90 | 121 |

**Half of all users spend under 10 credits.** The most common action by headcount
is `lead_full_name_to_linkedin_url` - 409 people - and it costs 1 credit. With a
150-credit grant those users could run 150 lookups. They will never see a paywall,
which is exactly what the funnel shows.

## What each grant would do

| grant | hit the wall | vs today |
|---:|---:|---|
| 150 (today) | 9.2% | - |
| 100 | 12.8% | +4pp |
| 50 | 21.4% | +12pp |
| 25 | 30.5% | +21pp |

The model predicts 9.2% at today's grant against 8% actually observed, so it is
calibrated, not a guess.

**100 is not a real change.** It buys four percentage points. If the point is to
put more people in front of a price, the choice is between 50 and 25.

## The interaction nobody expects

Halving the phone price works *against* hitting the wall - cheaper credits last
longer. The two changes partly cancel:

| grant | phone at 50 | phone at 25 |
|---:|---:|---:|
| 50 | 137 people hit | **116 people hit** |
| 25 | 195 | 195 |

Do not count both changes as additive. They are not.

## Recommendation

- **Standard grant: 150 -> 50**
- **Low-conversion tier (IN, PK, NG, BD, EG): 25 -> 12**
- **Phone: staying at 50 for now** (your call, 22 Aug)

That lands ~18% of users at the wall, 2.3x today, while still leaving a real
trial: 5 email finds, or 2 phone finds, or 50 name-to-LinkedIn lookups. The
median user (9 credits) still finishes what they came to do.

### Deferred: the phone price

Held at 50. If you revisit it, the note below still applies.

### "2x more phone finds on every plan" would already be done

Plans are denominated in credits, not per-feature quotas. Halving the phone price
doubles the phone finds included in every plan automatically - Starter's 60,000
credits go from 1,200 phone finds to 2,400. No plan config change needed, and the
pricing page can say so.

### Margin warning

At PAYG rates ($25 / 1,000 credits = $0.025/credit) a phone find bills ~$1.25
today and ~$0.63 at 25 credits. Phone data is the most expensive thing most
enrichment vendors resell. If your supplier charges anywhere near $0.40 a lookup,
this takes that line from ~70% margin to ~35%. Check the supplier invoice before
halving it. Everything else in this doc holds either way.

Phone is worth the attention: it is **27% of all credit consumption from 0.5% of
runs** (143 runs of ~3,460, at 50 credits each).

## What has to change, and where

**These must land together.** `deductCredits()` in `app.html` only updates the
number in the browser; the real charge happens server-side in n8n. Ship the
client half alone and users see "25 credits", get charged 50, and find out on
refresh. That is the worst possible bug to ship on a pricing change.

1. ~~n8n / signup - the grant.~~ **Correction, 22 Aug:** the grant is not in
   n8n. It is one line in the `linkfinderai-sign-up` Cloudflare Worker, now
   version-controlled at `workers/signup/worker.js`:

   ```js
   const SIGNUP_CREDITS = { low_conversion: 10, standard: 50 };
   ```

   Already changed in the repo; deploy with `wrangler deploy` from
   `workers/signup/`. Both signup paths go through this worker - the
   email/password form and the Google flow in `confirmation-signup.html`,
   which posts here with `provider:'google'` - so one change covers both.

   **The caveat that decides whether this works at all:** the worker only
   *sends* `startingCredits` to n8n. If the n8n workflow ignores that field and
   applies its own constant, changing the worker does nothing. Verify by
   signing up once and checking the balance is 50, not 150.
2. **Worth fixing while you are in there:** `email_to_linkedin_url` costs 4 in
   `app.html` and 1 in `app_beta.html`. One of them is lying to users.

Note the phone price is deferred, so nothing about the client cost table needs
to change today. When it does: `deductCredits()` in `app.html` only updates the
number in the browser, so the client half must never ship ahead of n8n or users
see one price and get charged another.

## Measuring it

Watch `credits_exhausted` per activated user weekly. It should move from ~8%
toward ~18% within two weeks of the grant change. If it does not, the grant did
not actually change - check n8n before concluding anything about behaviour.


---

# Addendum, 22 Aug 2026: the grant change is visible in the history

Eliasse recalled the grant was 50 until roughly June, then raised to 150 to
"show more value". That is testable, and the fingerprint is unmistakable.

Wall-hit rate (`credits_exhausted` per activated user), real users only:

| week | enriched | hit wall | rate |
|---|---:|---:|---:|
| 10 May | 71 | 19 | 27% |
| 17 May | 98 | 37 | 38% |
| 24 May | 86 | 19 | 22% |
| 31 May | 80 | 20 | 25% |
| 07 Jun | 94 | 22 | 23% |
| **14 Jun** | 86 | 7 | **8%** |
| 21 Jun | 94 | 6 | 6% |
| 28 Jun | 73 | 1 | 1% |
| 09 Aug | 125 | 8 | 6% |

The changepoint is the week of 14 June. Paywall exposure fell from ~26% to
~5% and never recovered. Raising the grant did exactly what raising a grant
does: it stopped people needing to buy.

## What the conversion numbers can and cannot say

| era | signups | paid | rate |
|---|---:|---:|---:|
| 50 credits (24 May - 7 Jun) | 294 | 6 | 2.04% |
| 150 credits (14 Jun - 16 Aug) | 1,260 | 16 | 1.27% |

A 38% fall, in the predicted direction - but z = 1.01, **p = 0.31**. Six
conversions against sixteen cannot carry that claim. Treat it as consistent
with the hypothesis, not as evidence for it.

Two things cut against the clean story, and both are worth knowing:

- Pricing-modal exposure stayed flat (~17-30% of signups) across both eras.
  The credit wall is not the only route to the pricing page.
- The checkout leak (83% of plan selections never reach checkout) sits
  downstream of both periods and corrupts the paid figures on both sides.

**Reverting to 50 is still right** - not because the revenue claim is proven,
but because it returns to a known prior state rather than experimenting into
one, and the exposure evidence is overwhelming.

# The bigger finding: geography, not credits

16 weeks, real users, split by the existing low-conversion country list:

| tier | signups | enriched | saw pricing | paid | conversion |
|---|---:|---:|---:|---:|---:|
| standard | 820 | 637 | 214 | 20 | **2.44%** |
| low_conversion (IN, PK, NG, BD, EG) | 993 | 775 | 182 | 1 | **0.10%** |

**Five countries are 55% of signups and 5% of revenue.** A 24x conversion gap.
775 of them ran enrichments - at 25 credits each that is up to ~19,000 credits
of data spend against one sale.

Two consequences:

1. **The geo grant should go to 10, not 12.** At 0.1% conversion the grant in
   this tier is not an investment in conversion, it is a cost. Ten still allows
   a genuine look at the product; the median user spends nine.

2. **Blended conversion was hiding a decent number.** Stripping this tier out,
   signup-to-paid is **2.44%**, which is respectable for self-serve B2B. The
   headline 1.2% was a mix artifact, not a product failure. The problems are
   the checkout leak and the acquisition mix - not that the product fails to
   convert people who can pay.

The acquisition point deserves its own look: if 55% of signups arrive from
markets converting at 0.1%, the top of the funnel is pulling the wrong
audience, and that will move blended revenue more than any pricing change.


# Site copy, 22 Aug 2026

Before this change the site made four different promises about the free grant:
**25** (59 places), **150** (57), **100** (8), plus stray 10 and 15. Every one of
them would have been false after the grant moved, and the 150s and 100s were
already over-promising for the low tier.

All 122 claims about *our* offer are now neutral - "free credits", no number.
That is not just tidying: a static number cannot be right for both tiers when
the low-conversion tier is 55% of signups, and neutral copy means the next grant
change needs no site-wide sweep.

Competitor claims were deliberately left intact: People Data Labs' 100 free
credits, Scrapingdog's 1,000, and the free-tool roundup figures are statements
about other products and rewriting them would put false claims on the site. The
"1,000 free credits" for booking a call is also untouched - that one is real.

None of the numbers appeared in `<title>`, `<meta>`, or `og:` tags, so there is
no search-ranking exposure from removing them.
