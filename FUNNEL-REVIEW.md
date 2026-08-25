# Does the app actually run the intended funnel?

**Date:** 2026-08-25 · **Source:** PostHog 263837, 90-day cohort of 1,581 signups

Intended: **single call (activate) → CSV upload (convert) → API / MCP / CRM (retain).**

Short answer: step 1 works, step 3 is confirmed, **step 2 barely happens**, and
step 4 is running backwards.

---

## The measured funnel

| Step | Users | Rate |
| --- | --- | --- |
| Signups | 1,581 | — |
| Activated (ran an enrichment) | 1,092 | **69%** of signups |
| Bulk / CSV | 240 | **22%** of activated |
| Paid | 20 | 8.3% of bulk |
| Integrated (API / MCP / webhook / CRM) | 122 | — |

Signup → first enrichment averages **3 hours**.

---

## 1 · Activation works

69% of signups run an enrichment, and `quickstart_used` reaches **975 users** — by
far the most-used surface in the product. The single fast call is doing its job.

The 31% who never activate are worth a look, but this is not the broken step.

## 2 · Single → CSV is the hole

**Only 22% of activated users ever touch bulk.** 852 activated users never upload
a CSV. If CSV is the converting feature, this is where the money is lost, and it
is the largest drop anywhere in the funnel.

The reason is that the push barely exists:

| Nudge | Shown | Acted |
| --- | --- | --- |
| `first_result_offer_shown` | **739** | **2** clicked (0.3%) |
| `bulk_nudge_shown` | **25** | 2 clicked |
| `bulk_tutorial_popup_shown` | 20 | **20 dismissed** (100%) |

- The one surface that reaches real volume — the post-first-result offer, 739
  users — converts at **0.3%**. That is the highest-leverage copy in the product
  and it is doing nothing.
- The nudge actually aimed at bulk reaches **25 of 1,092** activated users (2.3%).
  It is gated on `n < 2` enrichments plus two localStorage flags
  (`lf_bulk_nudge_shown`, `lf_csv_uploaded_ever`), so it fires once per browser
  and only in a narrow window.
- The bulk tutorial popup was dismissed by every single person who saw it.

## 3 · CSV → paid: the thesis holds, the volume does not

Ordering confirms bulk is the converting step:

- **12** users did bulk *then* paid
- **4** paid *then* did bulk
- Only **4** of 20 payers never touched bulk at all

So the CSV-converts hypothesis is right — 3:1 in its favour. The problem is
purely that so few people get there, and that **220 bulk users never paid**.

## 4 · Integration is inverted — it is a free-user behaviour

This is the finding that contradicts the plan.

- **122** people integrated (API key, MCP URL, webhook, CRM)
- **20** people paid
- **114 integrated and never paid**
- Ordering: **6** integrated then paid, **2** paid then integrated

Integration is not a retention layer sitting on top of paying customers. It is
something free users reach for *before* paying, three times more often than
after. Only about 8 of the 122 integrators are payers.

That cuts both ways. It is a monetisation gap — the stickiest surface in the
product is mostly being consumed by people who never pay. But it is also the
warmest untapped segment there is: 114 people who wired LinkFinder into their
own stack and still have not bought anything.

## The sequencing assumption does not hold either

Average time from first enrichment to first bulk action is **−6 hours** — i.e.
negative. Plenty of people hit bulk *before* their first tracked single
enrichment. The funnel is not ordered the way the strategy assumes; people
arrive at bulk directly, and the product does not walk them through the stages.

---

## What to fix, in order

1. **Rewrite the post-first-result offer.** 739 users see it, 2 act. Even 5%
   would put ~35 more people per quarter into the converting step. This is the
   cheapest, highest-volume lever in the product.
2. **Ungate the bulk nudge.** Reaching 2.3% of activated users makes it
   irrelevant. Drop the `n < 2` condition and let it re-appear rather than firing
   once per browser forever.
3. **Kill or rebuild the bulk tutorial popup.** A 100% dismissal rate across
   everyone who saw it is not a copy problem, it is a wrong-moment problem.
4. **Monetise the 114 integrated non-payers.** They have already done the hard
   part. Nothing in the product currently treats them as a segment.
5. Only then worry about activation (69%) — it is the healthiest step.

## Caveat

Bulk is counted as any of `csv_uploaded`, `quickstart_bulk_used`,
`bulk_results_gated_shown`, `example_csv_downloaded`, `sample_csv_used`, so
"touched bulk" is generous — the true CSV-upload number is lower
(`csv_uploaded` alone: 191 users). That makes step 2 worse, not better.
