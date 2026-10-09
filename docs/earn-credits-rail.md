# Earn-credits tasks: a rail beside the form, not a button

**Date:** 2026-10-09 · **Source:** PostHog, last 60 days · **Test:** `tests/tasks-rail.test.mjs`

## Why

The credit tasks (G2 review, referral, first API call, Sheets add-on,
HubSpot, YouTube) were only reachable through the corner **Get Free Credits**
button (`#reopenTasksBtn`). Over 60 days:

| | People |
| --- | --- |
| Signups | 1,111 |
| Opened the tasks from the button | 56 |
| Auto popup on 2nd enrichment (since retired) | 76 |
| Started the G2 review | 42 |
| G2 completed / waiting for a check | 5 / 7 |

About 11% of signups ever saw the list. The idea comes from Derrick, whose
home page keeps "Earn free credits" visible next to the main content.

## What shipped (`app.html`)

- `<aside id="tasksRail">`: fixed on the left of the 680px column, **only at
  1200px and wider**. Below that it would cover the form, so the corner button
  stays. When the rail is visible the button is hidden (`body.lf-rail-on`).
- `renderTasksRail()` lists `OTP_TASKS` in the modal's order (open first,
  done last), one line each with its reward, plus a total of the credits still
  available. Called once task status has loaded, and from
  `renderOnboardingTasksPopup()`, so a completion in the modal updates it.
- A row opens the existing modal (`openTaskFromRail` →
  `openOnboardingTasksPopupManually('rail')`) and scrolls to that task. The
  rail has no inputs: the modal stays the one place a task is done.
- It is not a popup and never auto-opens. That follows the rule in
  `docs/next-step-routing.md`: interrupting prompts converted at about 1%.

## Events

`tasks_rail_shown` {credits_available, open_tasks}; `tasks_rail_clicked`
{task_name}; `onboarding_popup_shown` now has `trigger: 'rail'` beside
`manual_reopen`.

## What to watch

The share of signups with any `onboarding_task_started` (around 5% today), and
G2 `onboarding_task_completed`. Credits handed out are a cost: if completions
rise with no lift in activation or payment, trim the list rather than add to it.

## LinkedIn share replaced YouTube subscribe (same day)

`youtube_subscribe` (100, honour) is out of the list; `linkedin_share` (150)
is back in. It was removed on 31 Aug because any linkedin.com URL counted as
proof. Proof now has to be a link to one post (`LI_POST_URL` in `app.html`,
the same pattern in `workers/onboarding-tasks/worker.js`). The button opens
LinkedIn's share dialog prefilled with linkfinderai.com.

**The worker change needs a `wrangler deploy` in `workers/onboarding-tasks`.**
Until then the live worker still accepts any linkedin.com URL; only the app's
own check stands in front of it. Both tasks stay in the worker's
`TASK_CONFIG`, so past completions keep their credits.

## Not done

No browser extension exists, so there is no "install the extension" task.
The Google Sheets add-on is the closest thing and is already a task (100 credits).
