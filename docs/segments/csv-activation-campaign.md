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
| **Send list (PostHog cohort)** | **889** |

Already sent to: 54. Remaining: roughly 800-950.

## Build it as a PostHog cohort — no list import needed

**Corrected 2026-08-26.** An earlier version of this file had you export a CSV
from Supabase and import it. That is unnecessary. The emails send from PostHog,
which already holds every signal the audience needs.

The one thing PostHog does *not* store is email-confirmation status — its person
profiles carry only geoip data, no `email_confirmed` property. But it does not
need one: **`signup_google_clicked` is the same gate.** Google-auth accounts all
have a Supabase auth row and are confirmed by Google, so they are deliverable by
construction. That is already the heuristic in use on the other campaigns.

### The cohort

| Condition | Purpose |
| --- | --- |
| Performed `enrich_started` at least once | activated |
| Performed `signup_google_clicked` at least once | **deliverability gate** |
| Has NOT performed `csv_uploaded` | not already a bulk user |
| Has NOT performed `checkout_payment_success` | still free |

**Cohort size: 889.**

### It matches the hand-built list to within 1.2%

| Method | Count |
| --- | --- |
| Supabase `auth.users.confirmed_at` + activated + free, less exclusions | 900 |
| **PostHog-native cohort above** | **889** |

The 11-person gap is the email+password users who genuinely confirmed. Per
`docs/email-verified-is-wrong.md` there are only **74 of those in the entire
base**, so the native cohort gives up almost nothing.

### Why the cohort is better than a list

- **Self-maintaining.** Someone who uploads a CSV tomorrow drops out
  automatically; an imported list goes stale the day it is exported.
- **No PII leaves the systems that hold it.** Nothing to export, store, or
  accidentally commit.
- **One place to edit.** The audience lives next to the campaign.

### When a Supabase export *would* be needed

Only to reach confirmed email+password users, who are invisible to the
`signup_google_clicked` condition. That is 74 people base-wide — not worth the
export. The SQL is kept below for reference if that changes.

```sql
SELECT lower(u.email)
FROM linkfinderai_users u
JOIN auth.users a
  ON lower(a.email) = lower(u.email)
 AND a.confirmed_at IS NOT NULL
JOIN (SELECT user_id, count(*) AS runs
      FROM enrichment_history GROUP BY user_id) h
  ON h.user_id = u.token AND h.runs > 0
WHERE u.subscription_id IS NULL
  AND NOT u.is_unlimited;
```

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

---

## Send log and ramp schedule

### Batch 1 — sent 2026-08-26 11:48 UTC

| | |
| --- | --- |
| Workflow | `01a03dd6-6083-0000-cfee-bf85b1a46795` — "7b. Bulk upload — backfill batch 1 (100)" |
| Cohort | `517907` — 100 people |
| Batch job | `01a03de6-c696-0000-6ca3-239227967946` — **completed** |
| Tracking | open/click tracking OFF (all engagement in this project is bot-flagged; no pixel, no URL rewriting) |

**Why a second workflow exists.** The original (`01a02ada`) is event-triggered on
`signup_success` — it only ever catches *new* signups, which is why it reached 54
people and can never reach the backlog. `7b` is a batch trigger over a cohort.
The original is untouched and still running for new signups.

Two failures worth remembering, both caught before they mattered:

1. **A static cohort can fail to populate silently.** Cohort `517902` returned
   `errors_calculating: 1`, `count: null`, and `last_error_message: null` — no
   usable error. `workflows-blast-radius` reported `affected: 0`; firing would
   have sent nothing. The cause was the query selecting a second column
   (`last_enrich`) alongside `person_id`. **Wrap the ordering in a subquery and
   select `person_id` alone.** Always confirm `count` is non-null before sending.
2. **Patching an active workflow stages a draft**, it does not change what runs.
   `workflows-patch-graph` then `workflows-publish` with `confirm: true` and the
   token from the preview call.

### Is there a sending limit?

**No hard technical limit at this scale.** `workflows-blast-radius` reports a cap
of **500,000** per batch, and the workflow's `email_sending_rate_limit` is
`null`.

**But volume ramping still matters, for reputation rather than limits.** These
send from `support@linkfinderai.com` — a real transactional domain. Recent daily
volume:

| Date | Sent |
| --- | --- |
| 2026-08-22 | 24 |
| 2026-08-23 | 49 |
| 2026-08-24 | 69 |
| 2026-08-25 | **255** (peak) |
| 2026-08-26 | 39 + 100 (batch 1) |

Sending the remaining ~789 in one day would be roughly **3x the highest day this
domain has ever done**. A step change like that is itself a spam signal to
Gmail and Microsoft, independent of how clean the list is. Ramp for that reason
as well as for bounce rate.

### Remaining schedule

Roughly 789 left of the 889 cohort (minus anyone who converts and exits).

| Day | Batch | Volume | Gate to proceed |
| --- | --- | --- | --- |
| 2026-08-26 | 1 | 100 | **sent** |
| +1 day | 2 | 200 | batch 1 bounce < 3% |
| +2 days | 3 | 250 | cumulative bounce < 3% |
| +3 days | 4 | ~239 | cumulative bounce < 3% |

Each batch stays at or near the domain's existing peak day rather than above it.

**When to read the bounce rate.** Hard bounces (the ones that matter — dead
addresses) report within minutes to a couple of hours. Soft bounces can take up
to 72h but are not the risk here. **Waiting 24h before the next batch is
sufficient and safe.**

If any batch exceeds 3%, stop and re-cut the segment before continuing — do not
push through it.

### Building batch 2

Same cohort query with `LIMIT 200`, and add an exclusion for batch 1 so nobody
is sent twice:

```sql
AND person_id NOT IN (
  SELECT DISTINCT person_id FROM events
  WHERE properties.$workflow_id = '01a03dd6-6083-0000-cfee-bf85b1a46795'
)
```

Then: create cohort → confirm `count` is non-null → point a workflow at it →
`workflows-blast-radius` → confirm → `workflows-run-batch`.
