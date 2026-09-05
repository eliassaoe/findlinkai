# The distribution partner — which kind, and what you have to pay them

**Date:** 2026-09-05 · **Sources:** Supabase `snxhsboboatjywgwdeds` (live),
`GROWTH-STRATEGY-REVIEW.md`, `docs/data-provider-angle.md`, `docs/seo-audience.md`.

The idea being tested: *find a partner with a massive audience who embodies the
product, and it skyrockets.*

**The instinct is supported by your own data — but not the "massive audience"
half of it.** Broadcast to a big audience has already been tried here twice and
produced zero customers. A personal referral has the best conversion rate in the
business. Those are two different things, and only one of them is worth chasing.

---

## 1. Broadcast vs. referral, measured on this account

Every referral source ever recorded on `linkfinderai_users.refered_by`:

| source | referred | activated | **subscribers** | rate |
| --- | ---: | ---: | ---: | ---: |
| **`ogZ0byKuozK46D6a`** (affiliate link) | 26 | **21 (81%)** | **2** | **7.7%** |
| `anchor` | 14 | **0** | 0 | 0% |
| `rory` | 5 | 0 | 0 | 0% |
| `d.leeb` | 3 | 3 | 0 | 0% |
| `producthunt` | 3 | 1 | 0 | 0% |
| `peerpush` | 3 | 1 | 0 | 0% |
| `reddit` | 2 | 1 | 0 | 0% |
| `vivek` | 1 | 1 | 0 (pack) | — |
| `nxgntools`, `poweredbyai`, `test_xyz` | 1 each | ≤1 | 0 | 0% |

Set that against the two audience channels from `GROWTH-STRATEGY-REVIEW.md`
(90-day first-touch cohorts):

| channel | people | signups | saw pricing | **paid** |
| --- | ---: | ---: | ---: | ---: |
| YouTube | 32 | 28 (88%) | 5 (18%) | **0** |
| Reddit | 46 | 37 | 11 (30%) | **0** |
| Search | 1,043 | 967 | 160 (17%) | 12 (1.2%) |

**Broadcast to an audience: 65 signups, 0 customers. One affiliate link: 26
referrals, 21 activated, 2 subscribers — 6× the site-wide rate.**

The sample is small and 2-of-26 will regress; do not plan on 7.7%. But the
direction is unambiguous and it is the only channel on the property that has
ever beaten baseline. And `anchor`, at 14 referrals and **zero activations**,
shows the failure mode: a placement that sends clicks from people with no
intent, which is what most "massive audience" traffic is.

**What separates them is not reach. It is whether someone recommends you to
people who already have the problem, or mentions you to everybody.**

## 2. Why a big creator drop is not the number you are imagining

Take a genuinely large launch — 3,000 visitors from a creator, decaying over a
week. At the homepage's 13% signup rate that is ~390 signups. At the site-wide
1.2% signup→paid it is **~5 customers ≈ $310 MRR**, less 25% commission, less
6.5% monthly churn. One-off.

The same 3,000 visitors at the affiliate cohort's rate would be ~30 customers
and ~$1,875 MRR. **The spread between those two outcomes is entirely "who the
audience is", and none of it is "how big".**

And per `docs/seo-audience.md`, size without fit is already proven here:
`/instagram-profile-url-finder` is the single biggest entry point on the site —
5,245 visitors, more than the homepage — and has produced **zero revenue, ever**.
You do not have a reach problem.

## 3. The real blocker: nobody with an audience will embody this for $12/month

Current affiliate terms: **25% recurring, capped at $500 per referred customer.**

| they refer a… | your MRR | their cut |
| --- | ---: | ---: |
| Starter $49 | $49 | **$12.25/mo** |
| Professional $89 | $89 | $22.25/mo |

A creator who sends 500 signups converts ~6 of them at the current rate and earns
roughly **$75/month**. That is not a partnership; that is a rounding error on
their sponsorship rate. **This — not a shortage of creators — is why the program
has 12 referrers all-time and $0.28 in total payouts.** The offer has never been
worth a serious partner's attention, so no serious partner has taken it.

Any partner conversation that starts from the current affiliate page will fail
for arithmetic reasons before it reaches the relationship.

## 4. The partner worth having, given what actually buys here

`docs/data-provider-angle.md` already established who retains and pays: **agencies
and service firms that need contact data as an input to what they sell** —
`salesignition.com`, `cambium.ai`, `kbscorporate.com`, `guidance.so`,
`legistify.com`, `devotedstudios.com`. Not founders doing their own outbound.

So the highest-value partner is not someone with an audience of *users*. It is
someone with an audience — or a client book — of **agencies**. Ranked:

### a. A reseller / white-label agency partner — the best economics available
Straight from `data-provider-angle.md` §3: *"An agency with 20 clients does 20
list builds a month, forever. One contract multiplies by their client count."*
One agency partner reselling enrichment to 20 clients is worth more than 5,000
signups, and it is the only partner shape whose per-account economics clear the
$2–3k LTV bar from `docs/outbound-close-motion.md`.

### b. Someone embedded in the outbound-tooling ecosystem
Consultants and communities serving agencies that build lists daily — the
Clay / Instantly / Smartlead consultant world, outbound course sellers, agency
owner communities. These people are asked "what do you use for enrichment?"
weekly, by buyers, with budget. That is a recommendation channel, not a
broadcast channel. Small audience, correct audience.

### c. A creator — last, and only on different terms
Not because creators do not work, but because the ones whose audience matches
(RevOps, sales ops, agency owners) are far smaller than the ones whose audience
does not (general "AI tools"), and the current commission cannot buy either.

## 5. What to change before having the conversation

1. **Rebuild the partner offer around the $750/mo Done For You deal, not the
   $49 plan.** 20–30% of $750 is **$150–225/month recurring per client** —
   a number a real partner will work for, and it makes one introduction worth
   more than a thousand signups. The self-serve affiliate link stays as-is for
   casual referrers; it is simply not the thing you pitch a partner.
2. **Decide the ceiling deliberately.** The $500 lifetime cap (commit `c46acc2`)
   is right for an open affiliate program and wrong for a reseller contract.
   A partner bringing recurring agency deals cannot be capped at $500 or they
   stop after the first one.
3. **Fix attribution first.** `refered_by` is a free-text column holding
   `'null'` as a literal string 5,131 times, alongside real codes, a UTM
   fragment (`poweredbyai?utm_source=PoweredbyAI`) and `test_xyz`. The
   `referral_partners`, `referral_clicks`, `referral_attributions` and
   `referral_commissions` tables all exist and are all **empty**. You cannot pay
   a partner on numbers you cannot produce, and a partner who suspects they are
   not being credited leaves. This is a small job and it gates everything else.
4. **Have one closed DFY client before pitching a reseller.** Per
   `docs/outbound-close-motion.md`, the service is not yet proven deliverable —
   0 human replies from 44 cold sends. A partner who resells something that does
   not deliver costs you the partner and their audience at once.

## 6. The honest summary

The instinct is right and your data backs the *mechanism*: a recommendation from
someone trusted converts ~6× better than anything else you have. What the data
does not back is the *scale* — reach is the part you already have and it has
never converted. Chase a partner with a buying audience and pay them out of the
$750 offer, and one such partner is worth more than the "massive audience" the
idea started with.
