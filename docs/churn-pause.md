# Churn: pause between lists (11 Nov 2026)

Owner, 11 Nov: "lower churn, it's what changes everything". At ~22%/month,
MRR tops out near new subs × ARPU ÷ churn ≈ $1,000; halving churn doubles it
(`docs/revenue-baseline-2026-11.md`).

## What the data says

Supabase, 36 accounts with a `subscription_id` (that column is not cleared on
cancel, so most are ex-subscribers), joined to `enrichment_history`:

- **Only 3 used the product in the last 30 days.**
- The common shape of a leaver: **one list run over 1–3 days, then nothing**
  (e.g. 6,043 lookups 11–12 Aug, 4,827 on 24–27 Aug, 3,912 on 18–19 May).
  That is a finished project, not a complaint.
- The other shape: paid, ran 1–5 lookups, never came back with 4,980–5,000
  credits left (onboarding failure — `CHURN-PLAYBOOK.md` archetype A).

The cancel flow's reason grid had no option for "I finished my project", so
those people picked "not using it" or "other" (the two biggest buckets).

## What changed in `account.html`

1. New first reason **"I finished my list / project"** (`projectDone`). Step 2
   offers **pause billing for 1 month** (existing `retentionAction('pause')`,
   cancel worker) and a cheaper plan.
2. **Last-chance pause on step 3** for every other reason (`#lastPauseCard`),
   hidden after `notUsing` / `projectDone` since they were just offered it.
   `retentionAction` now takes optional button/status ids because step 2 can
   hold a hidden `#pauseBtn`.
3. `retention_pause` carries `offered_at`: `reason_offer` or `last_chance`.

Cancelling is still two clicks from step 3 (ROSCA / California ARL).
Pinned by `tests/churn-pause.test.mjs`.

## Not verified

The pause runs through `cancel-subscription.hamoureliasse.workers.dev`, which is
not in this repo. It last succeeded in May (2 `retention_pause` events). If a
pause fails the user sees "Something went wrong" and can still cancel.

## Read it again on 11 Dec 2026

```sql
-- PostHog
select properties.reason, properties.offered_at, count()
from events where event in ('retention_pause','subscription_cancelled','cancellation_reason_selected')
and timestamp > '2026-11-11' group by 1,2;
```

## Known blind spot

`workers/dodo-webhook` (server-side `subscription_cancelled_server`, failed
payments) was never deployed: no `_server` events exist in PostHog. Cancels
made in Dodo's portal and failed-card churn are invisible until it is.
