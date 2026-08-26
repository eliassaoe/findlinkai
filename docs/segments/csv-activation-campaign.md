# Scaling "stop doing these one at a time" — send list and ramp

**Date:** 2026-08-26 · Segment for the bulk/CSV activation campaign.

## Why the list is not 1,319

A naive PostHog query returns 1,319 people who ran an enrichment and never
uploaded a CSV. **Do not send to that list.** Per `docs/email-verified-is-wrong.md`,
`email_verified` is `true` for 6,571 accounts of which only ~1,955 are real, and
**4,616 accounts (70% of the base) have no Supabase auth row at all.** Those
addresses were never verified by anything and are where the hard bounces come
from.

The only trustworthy signal is `auth.users.confirmed_at IS NOT NULL`.

## The real universe

| Filter | Count |
| --- | --- |
| Accounts confirmed in `auth.users` | **2,049** |
| ...and activated (>=1 enrichment) | **1,078** |
| ...and free (no subscription, not `is_unlimited`) | **1,047** |
| Already uploaded a CSV (exclude) | ~229 distinct emails |
| **Approximate send list** | **~850-1,000** |

Already sent to: 54. Remaining: roughly 800-950.

## Build it in two halves

**Supabase — the confirmed, activated, free base:**

```sql
SELECT lower(u.email) AS email
FROM linkfinderai_users u
JOIN auth.users a
  ON lower(a.email) = lower(u.email)
 AND a.confirmed_at IS NOT NULL
JOIN (SELECT user_id, count(*) AS runs
      FROM enrichment_history GROUP BY user_id) h
  ON h.user_id = u.token AND h.runs > 0
WHERE u.subscription_id IS NULL
  AND NOT u.is_unlimited
ORDER BY email;
```

**PostHog — exclude anyone who already uses bulk.** Do this as a cohort
condition (`has not done csv_uploaded`) rather than by crossing email lists
by hand; the event lives in PostHog and the exclusion stays live as people
convert.

## Bounce rate is the constraint — ramp, do not blast

Daily bounce rate on the sends so far:

| Date | Sent | Bounced | Rate |
| --- | --- | --- | --- |
| 2026-08-22 | 24 | 3 | **12.5%** |
| 2026-08-23 | 49 | 1 | 2.0% |
| 2026-08-24 | 69 | 1 | 1.4% |
| 2026-08-25 | 255 | 13 | **5.1%** |
| 2026-08-26 | 39 | 2 | 5.1% |

Overall 20/435 = **4.6%**, and that is *with* the Google-auth filter already
applied. Mailbox providers start throttling around 5% and penalise sustained
rates above it. Blasting 900 at 5% means ~45 hard bounces in a day, which is how
a sending domain gets damaged.

The `confirmed_at` filter above should cut this materially, since it removes the
4,616 never-verified accounts entirely — but that is a prediction, not a
measurement. Prove it on a small batch first.

**Ramp:**

| Day | Volume | Gate to continue |
| --- | --- | --- |
| 1 | 100 | bounce < 3% |
| 2 | 200 | bounce < 3% |
| 3 | 300 | bounce < 3% |
| 4+ | remainder | bounce < 3% |

If any batch exceeds 3%, stop and re-check the segment before continuing.

## Do not read the open rate

100% of email engagement in this project is flagged `$virt_is_bot: true` /
`Automation` — the open and click numbers are security scanners. See
`docs/revenue-levers-2026-08.md`.

**Judge this campaign on `csv_uploaded` only**, which is a first-party product
event scanners cannot fake. Baseline to beat: **6 uploads from 54 sends (11%)**.

## No new domains or mailboxes are needed

This is a PostHog broadcast to the project's own signed-up users, sent from
existing infrastructure — not cold outbound. New sending domains are only
relevant to the Instantly campaigns, and there the need is to **reconnect the 38
existing accounts** (all at `status: -1`, `autofix_failed: true`), not to buy
more.
