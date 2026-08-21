# Onboarding tasks worker

Handles the onboarding task popup: claiming tasks, submitting review URLs,
and crediting accounts. Reviews are verified automatically; manual approval
survives only for what automation cannot settle.

## Deploying

```bash
cd workers/onboarding-tasks
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put ADMIN_API_KEY
wrangler deploy
```

**Apply `schema.sql` first.** The worker calls `increment_user_credits()` and
depends on the uniqueness it creates. Deploying without it means credit grants
fail outright.

Optional: `TRUSTPILOT_POLICY=manual` stops auto-approving Trustpilot (see
below). `REVIEW_NOTIFICATION_WEBHOOK` overrides the n8n webhook.

## How a review is judged

Three things, all read off the URL string:

1. **Shape** — a permalink to one specific review, not a page anyone can copy.
2. **Product** — that it points at LinkFinder.
3. **Uniqueness** — that no one has claimed this review before.

The two platforms are not equally verifiable, and the design turns on that:

| | Is it a LinkFinder review? |
|---|---|
| **G2** — `g2.com/products/`**`linkfinder-ai`**`/reviews/<slug>` | **Provable.** The product slug is in the URL. |
| **Trustpilot** — `trustpilot.com/reviews/<hex-id>` | **Not provable.** The company appears nowhere in the URL. |

### The Trustpilot gap, stated plainly

A Trustpilot permalink proves a specific review exists and has not been claimed
here. It does **not** prove the review is about LinkFinder. Anyone pasting a
real Trustpilot review URL — of any company — gets 500 credits.

Bounded by one payout per person per task, and by every decision being recorded
on the row. Nothing else.

Watch it:

```sql
SELECT user_id, review_url, auto_reason, reviewed_at
FROM public.pending_reviews
WHERE reviewed_by = 'auto' AND platform = 'trustpilot'
ORDER BY reviewed_at DESC;
```

Turn it off without touching code: `wrangler secret put TRUSTPILOT_POLICY`
→ `manual`. Those submissions then queue for approval as before. G2 carries
no equivalent risk and is unaffected.

### What is deliberately not checked

That the review exists, is live, is positive, or was written by the submitter.
That needs an HTTP fetch, and both sites refuse datacenter IPs — a fetch would
fail on genuine submissions as readily as fake ones. A check that cannot be
trusted is worse than an absent one, so it is not attempted.

## Bugs fixed from the previous version

- **Lost credits under concurrency.** `creditUser` read the balance, added, and
  wrote it back; two grants landing together lost one. Now a single atomic
  `increment_user_credits()` statement.
- **Double credit on a race.** "Already completed?" was checked, then a row
  inserted. Two simultaneous requests both passed and both credited. A unique
  index now decides it, and the check just makes the loser's message friendly.
- **Marked complete but never paid.** The completion row was inserted, then
  credits granted, with nothing between them. A failed grant left a row saying
  "completed" that also blocked retrying. The row is now rolled back, and
  `/admin/reconcile-approved` repairs any that slip through.
- **Reject after approve paid twice.** `handleRejectReview` never checked the
  current status, so rejecting an approved review deleted the completion row
  while the credits stayed granted — the user could resubmit and be paid again.
  Rejection now only applies to pending reviews.
- **Email links fired without a click.** Approve/reject acted on the `GET`
  itself. Mail providers and security scanners fetch links to check them, so an
  approval could happen with nobody clicking. The `GET` now renders a
  confirmation page; the change happens on the `POST` its button submits.
- **`linkedin_share` accepted any URL.** 150 credits for `example.com`. Now
  requires a linkedin.com link.
- **PostgREST filter injection.** `review_id` from the query string went
  unencoded into filters, letting a caller append their own and change which
  rows a `PATCH` or `DELETE` touched. All interpolated values are encoded.
- **Internal errors leaked.** `detail: String(e)` returned raw Supabase
  responses to the browser. Errors are logged, not returned.
- **Timing-safe admin key** comparison, replacing `!==`.

## Removed

`creditReferrer` / `/tasks/credit-referral` and `initialCreditsForGeoTier` were
never called from anywhere in the site. They are not carried over — reinstate
them from git history alongside the caller that uses them, rather than leaving
untested credit-granting paths exposed.

## Tests

```bash
node workers/onboarding-tasks/test-review-urls.mjs
```

36 assertions over the URL grammar: both platforms' permalink forms, the pages
users are sent to, reviews of other products, lookalike hosts
(`g2.com.evil.example`), cross-task URLs, and canonicalisation — that one review
yields one key however it is dressed up, so it cannot be redeemed twice.
