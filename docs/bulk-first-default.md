# Bulk is the default; single lookup is the secondary option

**Date:** 2026-10-09 · **Source:** PostHog, signups 120 → 7 days before that date
**Test:** `tests/bulk-first-default.test.mjs`

## Why

What signups did, and who paid (2,107 signups, 21 payers, so direction, not
precision):

| Path after signup | Users | Share | Paid | Rate |
| --- | --- | --- | --- | --- |
| Single lookups only, never a list | 1,349 | 64% | 3 | 0.22% |
| No lookup at all | 482 | 23% | 2 | 0.41% |
| List first (median 2 min after signup) | 160 | 7.6% | 8 | 5.0% |
| Single first, then a list | 116 | 5.5% | 8 | 6.9% |

By list size: lists of 25+ rows convert at 9.2% (13 / 141); smaller lists at 2.2%.

Single = `enrich_started` or `quickstart_used`. List = `csv_uploaded`,
`spreadsheet_uploaded` or `quickstart_bulk_used`. Paid = `checkout_payment_success`.

Two readings, and the change follows both:

1. **Lists are where people pay.** 16 of 21 payers ran one, 12 of them before
   paying. So the app opens on bulk.
2. **Single lookup feeds lists; it doesn't compete with them.** The best path of
   all (6.9%) is single first, then a list. Removing single would cut that path,
   so single stays one click away. The other route, removing single lookup
   entirely, was considered and rejected for this reason.

## What changed (`app.html`)

| Before | After |
| --- | --- |
| `currentMode = 'single'`; the toggle reads Single / Bulk, single selected | `currentMode = 'bulk'`; bulk is first, wider and selected; `Single lookup` is second |
| Bulk panel appears only after a toggle click | Bulk panel is drawn on load, locked until a pair is picked (`showInputSections()` at init) |
| Quick-start: "Popular searches", four cards that run a single lookup | "Enrich a list…", four cards that call `quickStartBulk` (set the pair, open the drop zone). Single is reached only through the toggle or the "I just need one lookup" route choice |
| — | `quickStart` and the "I just need one lookup" route call `switchMode('single')` themselves |
| Locked drop zone fades everything | `Try a sample list` stays at full strength: it picks its own pair, so it is the zero-homework way into bulk |

A line of four instant single-lookup links ("No list yet? Try one lookup
instantly: …") briefly sat under the cards and was removed the same day
because it made the landing view too busy. `quickStart()` still exists but
nothing on the page calls it.

The button label `Upload CSV (bulk)` is unchanged on purpose: video storyboards
in `claude/guidee/scripts/` quote it. A storyboard that shows a single lookup now
has to click `Single lookup` first (see `claude/guidee/app-ui.md`).

## New events

- `mode_switched` {to, from, source: `toggle`}: a person clicked the toggle.
  Programmatic switches (quick-start, routes, resume) are not recorded.
- Super property `app_default_mode: 'bulk'` on every event after the change,
  so before/after reads can filter on it.

## What to watch

**North star: % of signups who run a list of 25+ rows** (`csv_uploaded` with
`row_count >= 25`). Baseline: **6.7%** (141 / 2,107). Target: 10–12%. Each of
those people pays at about 9%.

Don't judge this on paid conversion alone: at ~21 payers per four months, an
A/B test on paid would take years to reach significance.

Guardrails:

- Activation (any lookup or upload) was 77%. A drop of more than ~10 points
  means the bulk-first landing is losing people who would have tried single.
- `mode_switched` to `single` from `toggle`: how many people go looking for
  single. If that's most of the sessions, the cards are pointing at the wrong
  lists.
- `quickstart_bulk_used` now fires on a **card click**, not an upload. Since
  this change it is not a list event: count lists with `csv_uploaded` only.
  (The table above counted it as a list event; its share was small.)

## Expected effect

Rough estimate per 1,000 signups (about 10 payers today): **+15% to +40%
payers**, from bulk reach going from ~13% to 20–25% of signups at ~3%
conversion for the new, lower-intent list users. This is a modelled estimate,
not a measured result.
