# Getting told when someone does an onboarding task

## Heads up: you have two of these

The worker already posts every review submission to an n8n webhook on Railway
(`DEFAULT_REVIEW_NOTIFICATION_WEBHOOK` in `workers/onboarding-tasks/worker.js`),
with one-click approve/reject links. The PostHog workflow below was built
before that was known and overlaps with it.

Pick one. The n8n route is better for reviews — it carries the approve/reject
links and fires server-side, so ad blockers cannot suppress it. The PostHog
route covers the non-review tasks the webhook does not touch. Keeping both
means two emails per review.

Now that reviews are verified automatically, the webhook only fires for the
ones left pending, so the volume is small either way.

## What is set up

A PostHog workflow, **"Internal alert — someone did an onboarding task"**
(`01a025dc-4dcb-0000-b634-a8db7fef277d`, project 263837), emails
`support@linkfinderai.com` every time a user completes or submits one.

[Open it in PostHog](https://us.posthog.com/project/263837/workflows/01a025dc-4dcb-0000-b634-a8db7fef277d/workflow)

The tracking itself already existed — `app.html` has fired
`onboarding_task_completed` and `onboarding_task_pending` since the popup
shipped. Only the notification was missing.

## What arrives

The subject line says whether you need to act:

| Event | Subject | Meaning |
|---|---|---|
| `onboarding_task_pending` | `Approve: g2_review — user@example.com` | A review was submitted. **Flip its status to `completed` in Supabase** to release the credits. |
| `onboarding_task_completed` | `Done: youtube_subscribe — user@example.com` | Auto-approved by the worker. Nothing to do. |

The body carries the task name, the user's email, credits, geo tier and
timestamp, plus a coloured callout repeating whether it needs you.

## How it is wired

- **Trigger** — either task event. Anything else is ignored.
- **Dedup** — masked on `{person.id}-{event.properties.task_name}` with a
  1 hour TTL. A client-side retry firing the same event twice sends one
  email; two *different* tasks by the same person still send two, because
  the task name is part of the key.
- **Sender** — the `support@linkfinderai.com` email integration (id 238896).
  Sender and recipient are the same inbox, which is why this one works
  while the customer-facing lifecycle workflows are still drafts.
- **Open/click tracking** — off (`tracking_enabled: false`). It is an
  internal alert, so there is no pixel and no link rewriting.

## Expected volume

Roughly 1–4 emails a day, from 60 days of history:

```sql
SELECT event, toDate(timestamp) AS day, count() AS n
FROM events
WHERE timestamp >= now() - INTERVAL 60 DAY
  AND event IN ('onboarding_task_completed','onboarding_task_pending')
GROUP BY event, day ORDER BY day DESC
```

If that grows, add a `delay` node and batch, or raise the mask TTL.

## Verified

Every branch was exercised with `workflows-test-run` before the workflow
was enabled:

- `onboarding_task_pending` → `Approve:` subject, amber "Needs you" callout
- `onboarding_task_completed` → `Done:` subject, green "nothing to do" callout
- an unrelated event (`enrich_started`) → trigger returns `skipped`
- one real send (`mock_async_functions: false`) delivered to
  `support@linkfinderai.com`, which also proves the sending domain works

## The limitation worth knowing

**This fires from the browser, so it undercounts.**

`posthog.capture()` runs client-side. Ad blockers, privacy browsers and
network filtering suppress it, and the popup that hosts these tasks is
shown specifically to the `low_conversion` geo tier — India, Bangladesh
and Nigeria (see the geo branch in `checkAuth()`, `app.html:3439`) — where
ad-blocker use runs high. A user can submit a G2 review, land a `pending`
row in Supabase, and generate no PostHog event at all.

So treat this as a convenience, not a ledger. **The Supabase table is the
source of truth for what is owed.** Reconcile periodically:

```sql
SELECT user_token, task_name, status, created_at
FROM public.onboarding_task_completions
WHERE status = 'pending'
ORDER BY created_at;
```

A guaranteed notification has to come from the database, not the browser —
a trigger on `onboarding_task_completions` calling out via `pg_net`, next
to the credit-award trigger in `supabase/01_fix_task_credit_awarding.sql`.
That is not built yet.

## Changing it

Content edits to a live workflow stage as a draft and need publishing:
edit, then `workflows-test-run` with `use_draft: true`, then
`workflows-publish`. To stop the emails without deleting anything, set the
workflow to draft.
