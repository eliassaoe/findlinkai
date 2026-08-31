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

## 2. The audience is 50 people, not hundreds

Deliverable (`auth.users.confirmed_at IS NOT NULL`) paid users:

| Segment | Count |
| --- | --- |
| Subscribers | 23 |
| Credit-pack buyers | 27 |
| **Paid and have not yet attempted G2** | **50** |
| **Trustpilot reviewers who have not yet done G2** | **0** |

**The Trustpilot list adds nobody.** Everyone who reviewed on Trustpilot has
already been through the G2 flow. The whole addressable audience is the 50 paid
users who have not tried yet.

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
3. **Then email the 50.** Small but the warmest list available, and the flow
   already works.
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
