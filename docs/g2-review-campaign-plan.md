# G2 review campaign — findings before building it

**Date:** 2026-08-31 · **Sources:** Supabase `snxhsboboatjywgwdeds`, PostHog 263837, web

The plan was: email all paid customers and Trustpilot reviewers, offer 1,000
credits for a G2 review. Four things found while sizing it.

## 1. The machinery already exists and has been running since July

`user_task_completions` and `pending_reviews` already implement exactly this
flow, including auto-verification of G2 permalinks.

| Task | Completed | Pending | Credits paid |
| --- | --- | --- | --- |
| `youtube_subscribe` | 19 | — | 1,900 |
| **`g2_review`** | **6** | **8** | **5,000** |
| `trustpilot_review` | 3 | 3 | 500 |
| `linkedin_share` | 2 | — | 300 |

Credits per G2 review already average ~833, so 1,000 is in line with precedent.
**This is not a new campaign to build — it is an existing one to re-run.**

## 2. The audience is 65 — and the Trustpilot list DID add people

**Corrected 2026-08-31** after the actual Trustpilot list was supplied as a
Typeform export. An earlier version of this file said the Trustpilot list added
nobody. That was wrong: it was computed from `pending_reviews` and
`user_task_completions`, which hold only 6 Trustpilot rows. The real list is a
separate Typeform with **35 submissions**, almost none of which reach those
tables.

Working through it:

| Step | Count |
| --- | --- |
| Typeform submissions | 35 |
| ...with a URL actually on trustpilot.com | 28 |
| ...distinct emails | 27 |
| ...that match a LinkFinder account | 26 |
| ...**deliverable** (`confirmed_at` set) | **16** |
| ...that already went through the G2 flow | **0** |

Combined with the paid users:

| Segment (deliverable, not yet G2) | Count |
| --- | --- |
| Paid customers | 50 |
| Trustpilot reviewers | 16 |
| **Union** | **65** |
| **Union who have actually run an enrichment** | **36** |

## 2b. Half the list has never used the product

This is the part that should decide the send.

| | Count |
| --- | --- |
| Trustpilot reviewers who never ran a single enrichment | **10 of 16** |
| Paid users who have run enrichments | 31 of 50 |
| **Whole union who have actually used the product** | **36 of 65** |

**Ten of the sixteen Trustpilot reviewers reviewed a product they never used.**
The incentive is attracting review-farmers, not customers.

That matters more on G2 than on Trustpilot, because **G2 verifies reviewers** —
LinkedIn or work-email identity, plus usage questions — and rejects those who
cannot demonstrate use. This is a better explanation for "four approved
permalinks, one published review" than moderation lag, and it means sending the
ask to non-users actively risks the profile rather than merely wasting credits.

**Recommendation: send to the 36 who have used the product, not the 65.**

## 2c. The Typeform data shows the same claiming pattern as G2

Seven submissions were not Trustpilot links at all:

| Email | Submitted |
| --- | --- |
| yathish@salesmist.com | `ample.com` |
| ayushcybertron1.8@gmail.com | `linkfinderai.com` |
| andrewcheung0611@gmail.com | `linkfinderai.com` |
| remyhasan21@gmail.com | **the Typeform itself** |
| jumiaaffliat2022@gmail.com | **the Typeform itself** |
| bfubbapb@signinid.com | a Google search for "linkfinder ai review" |
| contato@ecommerceupdate.com.br | `ecommerceupdate.org` |

And two review URLs were claimed more than once:

- `trustpilot.com/reviews/69b836c54c0748391a348172` — claimed by **two different
  people** (`harmoulisse@gmail.com` and `eduardo@solvis.com.br`). One of them did
  not write it.
- `trustpilot.com/reviews/69f1f17ac9c59c5dd58e0b89` — submitted twice by the same
  person on two dates.

Same fix as for G2: validate the URL shape on submission, and reject a permalink
already claimed by another account.

## 3. Four G2 reviews are approved, but G2 appears to show one

Four submissions carry genuine G2 review permalinks and were auto-approved:

    linkfinder-ai-review-13356682   2026-08-25
    linkfinder-ai-review-13345416   2026-08-22
    linkfinder-ai-review-13270299   2026-08-21
    linkfinder-ai-review-13270237   2026-08-21

Yet a search result for the G2 seller page reads "Read 1 Reviews on G2".

**This gap is the thing to resolve before spending more credits.** Either the
reviews are held in G2 moderation, were rejected, are not attached to the right
product, or the search snippet is stale. Generating twenty more reviews into a
pipe that publishes one in four is the expensive way to find out.

*This could not be checked from here: `g2.com` is blocked by the egress proxy,
and the G2 API returns no products for the connected account, which is a buyer
account rather than the LinkFinder seller account.*

## 4. Most pending submissions are not reviews

The ten pending G2 rows, verbatim:

| Submitted URL | What it actually is |
| --- | --- |
| `g2.com/authorize?context=product_review` | a login page |
| `g2.com/wizard/new-review/finish?product_id=500conference-by-500apps` | **a different company's review wizard** |
| `linkedin.com/in/sunilmali9922/` | a LinkedIn profile |
| `linkedin.com/in/rishikesh-kumar-013607251/` | a LinkedIn profile |
| `g2.com/fr/products/linkfinder-ai/reviews` (x3) | the reviews listing page |
| `g2.com/products/linkfinder-ai/reviews?filters[nps_score]=5...` | a filtered listing |
| `g2.com/survey_responses/.../suggestions` | mid-flow, unfinished |

The auto-verifier is working correctly — it approves only real permalinks. But
**six of ten submissions are people claiming credits without leaving a review**,
one with another company's URL entirely.

Before re-running: the submit step needs to reject anything that is not
`g2.com/products/linkfinder-ai/reviews/<slug>`, with the rule stated in the form
rather than discovered after submission.

## What to do, in order

1. **Find out why four approved permalinks show as one review.** Blocking; only
   answerable from the G2 seller account.
2. **Tighten the submit validation** to a permalink pattern, so pending stops
   filling with login pages.
3. **Then email the 36 who have actually used the product** — not the full 65.
   G2 rejects reviewers who cannot show usage, and 29 of the 65 have never run
   an enrichment.
4. **Do not promise credits for a positive review.** G2 permits incentives only
   when offered regardless of rating; the wording must ask for a review, not a
   good one. One existing submission is a link filtered to 5-star reviews, which
   suggests the current framing may already lean that way.

## Unrelated but urgent: RLS is disabled on six tables

Supabase flagged this while listing tables. **Row Level Security is off on
`enrichment_history` (90,436 rows), `csv_enrichment_batches`,
`linkedin_lead_searches`, `email_pattern_logs`, `processed_companies` and
`ai_columns_tables`.** Anyone holding the public anon key can read or modify
every row — that includes customers' enrichment inputs and results.

Remediation SQL, **not applied here** because enabling RLS without policies
blocks all access and would break the app:

```sql
ALTER TABLE public.email_pattern_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_columns_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_lead_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csv_enrichment_batches ENABLE ROW LEVEL SECURITY;
```

Each needs policies written alongside it before it is safe to enable.
