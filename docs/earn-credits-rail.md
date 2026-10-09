# Earn-credits tasks: the corner button only

**Test:** `tests/tasks-button-only.test.mjs`

The credit tasks (G2 review, referral, first API call, Sheets add-on,
HubSpot, YouTube) open from the corner **Get Free Credits** button
(`#reopenTasksBtn`) and nowhere else.

## History

- **2026-10-09, added:** an always-on rail (`<aside id="tasksRail">`) to the
  left of the form on screens 1200px and wider, listing every task with its
  reward. Only about 11% of signups had ever opened the tasks from the button
  (56 manual opens out of 1,111 signups over 60 days), and the idea came from
  Derrick.
- **2026-10-09, removed:** the owner found the rail annoying. `renderTasksRail`,
  `openTaskFromRail`, the `tasks-rail` styles and the `tasks_rail_shown` /
  `tasks_rail_clicked` events were deleted. `onboarding_popup_shown` is back
  to `trigger: 'manual_reopen'` only.

Do not bring back an always-visible task list or an auto-opening popup
without asking. See also `docs/next-step-routing.md`: interrupting prompts
converted at about 1%.
