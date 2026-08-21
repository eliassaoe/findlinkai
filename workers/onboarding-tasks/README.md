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

Optional:
- `TRUSTPILOT_POLICY=manual` / `G2_POLICY=manual` — queue that platform instead
  of auto-approving. Instant kill switch, no code change.
- `REQUIRE_KNOWN_REVIEW=false` — pay out on URL shape alone. Do not set this:
  fabricated URLs pass shape checks. It exists only to reproduce the old
  behaviour deliberately.
- `REVIEW_NOTIFICATION_WEBHOOK` — overrides the n8n webhook.

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

### Shape is not existence

A G2 review id is just a number. `.../linkfinder-ai/reviews/linkfinder-ai-review-13270299`
passes every pattern check while pointing at nothing, and the next number does
too. No amount of URL checking fixes that — fabricated URLs are free to mint.

So auto-approval requires the review to be in `known_reviews`: the set of
reviews we have independently observed to exist. Shape decides whether a
submission is worth considering; membership decides whether it gets paid.

Unknown is **not** a rejection. A genuine review written a minute ago will not
be in the set yet, so it queues — and the next sync releases it and pays out
without anyone touching it.

**With `known_reviews` empty, nothing auto-approves and everything queues.**
That is the intended failure: a manual queue beats a faucet.

### Feeding the review list

`POST /admin/sync-reviews` with `{admin_key, platform, review_urls: [...]}`.

Source-agnostic on purpose — it takes URLs and does not care where they came
from:

| Platform | How to get your real review URLs |
|---|---|
| **Trustpilot** | The Business API (`/v1/private/business-units/{id}/reviews`) returns your own reviews. You own the data; no scraping. |
| **G2** | No free API. Either G2's Review Stream API on a paid plan, or an Apify G2 review-scraper actor pointed at `g2.com/products/linkfinder-ai/reviews`, run on a schedule. |

Wire either through n8n (or a cron) into that endpoint. It records the keys and
immediately releases any pending submission that has now appeared, returning
what it credited.

Verifying membership also settles the Trustpilot attribution problem below: a
review present in *your* Trustpilot review list is by definition about you.

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
