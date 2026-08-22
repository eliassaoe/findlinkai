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
- **Phone: 50 -> 25 credits**

That lands ~18% of users at the wall, 2.3x today, while still leaving a real
trial: 5 email finds, or 2 phone finds, or 50 name-to-LinkedIn lookups. The
median user (9 credits) still finishes what they came to do.

### "2x more phone finds on every plan" is already done

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

1. **n8n - the charge.** The per-combination cost for
   `linkedin_profile_to_phone`: 50 -> 25.
2. **n8n / signup - the grant.** Geo-tiered signup credits: standard 150 -> 50,
   low_conversion 25 -> 12.
3. **Client display, only once 1 and 2 are live.** Two files, same line:
   - `app.html` - `creditCosts['linkedin_profile_to_phone']` 50 -> 25
   - `app_beta.html` - same key, same change

   (Unrelated but worth fixing while you are there: `email_to_linkedin_url` is 4
   in `app.html` and 1 in `app_beta.html`. One of them is lying to users.)

## Measuring it

Watch `credits_exhausted` per activated user weekly. It should move from ~8%
toward ~18% within two weeks of the grant change. If it does not, the grant did
not actually change - check n8n before concluding anything about behaviour.
