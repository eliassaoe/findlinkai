# Task credits: why approvals never paid out, and the fix

## The symptom

A user completes an onboarding task, the row lands in the Supabase task table,
you flip `status` to `completed` — and their credit balance does not move.

## The cause

The approval step was never wired to anything.

Tracing `app.html:4684-4952`, there are two kinds of task:

| Task | Endpoint | Row written as |
|---|---|---|
| `youtube_subscribe`, `linkedin_share` | `/tasks/complete` | `completed` |
| `g2_review`, `trustpilot_review` | `/tasks/submit-review` | **`pending`, `credits: 0`** |

Review tasks are the ones you approve by hand. They are filed as `pending`
with a credit value of zero (`app.html:4936`), waiting for you.

The only code that grants credits lives inside `onboarding-tasks-worker`'s
`/tasks/complete` handler. Review tasks never reach that handler — they go to
`/tasks/submit-review`. So when you flip `status` to `completed` in the
Supabase table editor, you are running a plain `UPDATE` on a row, and nothing
is subscribed to it. No worker runs. No trigger fires. No job reconciles it.
The row reads `completed` and the balance sits still.

Note also that `addCredits()` in the browser (`app.html:2509`) only repaints
the number in the header. The real balance is served by a different worker
(`linkfinderaicredits`, `app.html:2477`), so the UI briefly agreeing with you
proves nothing.

## The fix

`01_fix_task_credit_awarding.sql` makes the database itself react to the
approval, so your existing workflow — flip the status field — starts working
unchanged. No worker redeploy.

It installs:

- **`onboarding_task_catalog`** — the credit value of each task as data.
  Amounts mirror `OTP_TASKS` in `app.html:4693`. The trigger reads payouts
  from here rather than from the row's own `credits` column, because pending
  review rows carry `0` and would otherwise pay nothing.
- **`onboarding_task_credit_grants`** — an audit ledger, one row per grant that
  actually happened, with `UNIQUE (user_token, task_name)`. This constraint is
  what makes double-payment impossible no matter how often a status is toggled.
- **A `BEFORE INSERT OR UPDATE` trigger** on the task table that awards credits
  on the transition into `completed`, and corrects the row's `credits` column
  so the "credits earned" total in the popup (`otpEarnedTotal()`) is right.
- **`backfill_onboarding_task_credits()`** — pays out every approval you
  already flipped and that was silently dropped. Re-runnable.

## Applying it

1. Run `00_inspect_task_credit_schema.sql` in the Supabase SQL editor.

   Step 3 of its output is the confirmation: **no trigger on the task table is
   the bug.** Steps 1, 2 and 5 give the real table, column and status names.

2. Check those names against the migration. It assumes:

   - `public.onboarding_task_completions (user_token, task_name, status, credits)`
   - `public.users (token, credits)` for balances

   These were inferred from the client code, not read off your database. If any
   differ, the migration's preflight block stops with a message naming the
   mismatch before applying anything — correct `add_user_credits()` and the
   `CREATE TRIGGER` statement and re-run.

3. Apply `01_fix_task_credit_awarding.sql`. It is transactional and idempotent:
   a failed preflight leaves the database untouched, and re-running is safe.

4. Pay out the approvals that were dropped:

   ```sql
   SELECT * FROM public.backfill_onboarding_task_credits();
   ```

   It prints exactly who got what, so you can check the list before telling
   anyone their credits arrived.

## Verifying

```sql
-- Approve something, then confirm the balance moved:
UPDATE public.onboarding_task_completions
   SET status = 'completed'
 WHERE user_token = '<token>' AND task_name = 'g2_review';

SELECT token, credits FROM public.users WHERE token = '<token>';
SELECT * FROM public.onboarding_task_credit_grants WHERE user_token = '<token>';
```

Grants that were recorded but never reached a balance — the user row was
missing at approval time — are visible here and picked up by the next
back-fill:

```sql
SELECT * FROM public.onboarding_task_credit_grants WHERE NOT balance_applied;
```

## Tests

`tests/` holds a regression suite that runs against a throwaway Postgres, never
production. 25 assertions covering the approval path, idempotency under status
toggling, the back-fill, recovery of stranded grants, and repricing.

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./tests/run.sh
```

Run against the mock schema *without* the migration, the suite fails at T1 with
`expected 1025, got 25` — the reported bug, reproduced.

## Getting told when a task needs approving

Approving only helps if you know there is something to approve. A PostHog
workflow now emails `support@linkfinderai.com` on every task submission, with
the subject saying whether it needs you — see
[`docs/onboarding-task-notifications.md`](../docs/onboarding-task-notifications.md).

That alert fires from the browser, so ad blockers make it undercount. This
table stays the source of truth for what is owed:

```sql
SELECT user_token, task_name, status, created_at
FROM public.onboarding_task_completions
WHERE status = 'pending'
ORDER BY created_at;
```

## One thing left open

`onboarding-tasks-worker` still awards credits itself on the `/tasks/complete`
path, and that write does not go through this ledger. For auto-approved tasks
inserted as `completed`, the trigger now also fires, so if the worker adds
credits *and* the trigger adds credits, those users get paid twice.

Check the worker's `/tasks/complete` handler. If it updates the balance
directly, either remove that update and let the trigger own payouts, or have it
call `public.grant_onboarding_task_credits(user_token, task_name)`, which is
safe to call from anywhere and cannot double-pay. Paste the worker source and
this can be settled properly.
