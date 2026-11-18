# Onboarding: "Get started" checklist + first-result tour (18 Nov 2026, owner's call)

Read with `docs/smart-start.md` (start screen) and `docs/next-step-routing.md` (offers inside results).

## Why
24h activation was 65–77% in Jun–Aug and 31–40% in the two weeks after the
blocking route question came back (7 Nov). The blocking question was removed and
the first card click now runs a real example (see smart-start.md, 18 Nov). This
adds what Apollo, Clay and Notion do on top of that: a short checklist with
progress and a reward, and a 3-step tour of the first result that ends on a list
(list users pay at 5.4% vs 0.17% for single-only).

## What a new account sees
- **Get started · 0 of 3** above the cards (`#starterList`, outside
  `#quickstartSection` so a run does not hide it), with a progress bar and an ×.
  1. Try a real example — done by any example run (Satya / Tesla / Microsoft inputs).
  2. Find someone of your own — **+25 credits**.
  3. Enrich a list (sample list one click away) — **+50 credits**.
- After the first single result, a dark 3-step bubble above it (`#starterTour`):
  your result → what it cost and what is left → "Now do your whole list" with
  **Try a sample list** (bulk mode + `useSampleCsv()`, 8 rows).

State is per browser in `localStorage.lf_starter`. Shown only when the browser
has no usage yet (`lfHasUsedProduct()`).

## Credits
Paid by the Postgres function `lf_starter_reward(p_token, p_step)`
(migration `20261118090000_starter_checklist_rewards.sql`, applied with
apply_migration), called from the browser with the publishable key. It pays only:
- accounts created on/after 2026-11-18;
- `own_search`: an `enrichment_history` row whose input is not one of the examples;
- `first_list`: a `csv_enrichment_batches` row with `processed_rows >= 5`;
- once per step (unique index on `user_task_completions (user_id, task_name)`,
  task names `starter_own_search` / `starter_first_list`).
Cost at most 75 credits per new account that does both.

## Events
`starter_checklist_shown`, `starter_step_done`, `starter_reward_paid`,
`starter_checklist_dismissed`, `starter_sample_clicked`, `starter_tour_step`,
`starter_tour_end`, plus `first_example_run` (smart-start.md).

## Re-check 28 Nov 2026
24h activation by signup week (target ≥ 50%), share reaching step 2 and step 3,
and checkout visits from accounts created after 18 Nov.

## Found while building (not changed)
`increment_user_credits(p_token, p_amount)` is executable by `anon`: anyone with
the publishable key and a user token can add credits. The onboarding-tasks worker
calls it; check which key it uses before revoking anon.
