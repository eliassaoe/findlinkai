# Lists are where payment comes from (8 Nov 2026)

**The data (PostHog, last 6 months, people who did each thing):**

| Did | People | Paid | Rate |
| --- | --- | --- | --- |
| Uploaded a CSV list | 333 | 18 | 5.4% |
| Copied an API key (no CSV) | 216 | 7 | 3.2% |
| Single lookups only | 1,732 | 3 | 0.17% |
| No lookup | 720 | 1 | 0.14% |

Part of the gap is selection (people with a list are more serious), so the goal is
not to push everyone into bulk — bulk-first as the default cut activation 68% → 41%
in Oct (`docs/bulk-first-default.md`). It is to remove what stops people who *do*
have a list. 135 people started a list and stopped at the credit gate; 9 paid.

## 1. Paste a list into the search box (`app.html`)

Pasting 2+ lines into `#inputData` no longer drops them into a one-line field.
It keeps the first line for a single lookup and shows "N rows pasted. Run them all
as a list (up to X credits)? [Run all N] Just the first one". "Run all" switches to
bulk and feeds the normal CSV pipeline (`parseCSV` → preview → Process), so nothing
is spent until they press Process.

- Names + company: tab-separated (copied from a sheet) or "Jane Smith, Acme" typed.
- A copied header row ("First Name / Last Name / Company") is kept and mapped.
- A name list without companies, where a company is required, says so instead.
- Events: `paste_list_detected`, `paste_list_run`, then the usual `csv_uploaded`
  path with file name "Pasted list".
- Functions: `lfPastedLines`, `lfPasteListCsv`, `lfShowPasteListOffer`,
  `lfRunPastedList`. Pinned by `tests/paste-a-list.test.mjs`.

## 2. "Your list stopped at X of Y" email (PostHog workflow 2)

`bulk_results_gated_shown` now carries `batch_id`, `found_rows`, `list_name`
(plus the existing `total_rows`, `processed_rows`, `locked_rows`).

Workflow **"2. Credit wall — ran out, never saw pricing"**
(`01a02579-2580-0000-52d3-689a36d8390d`, version 10, published 8 Nov) now branches
after its 30-minute wait: if the event has a `batch_id` it sends
"Your list stopped at {processed} of {total}" with the found count and a
**Finish my list** button to `https://linkfinderai.com/app?resume={batch_id}`
(the app's existing resume-by-link). Otherwise it sends the old credit email as
before. Same audience rules as before (Google sign-ups, verified), same
once-per-30-days masking, payers exit.

Routing tested with `workflows-test-run` on the draft (list event → list email,
plain `credits_exhausted` → old email). The liquid rendering of the event
properties was not seen in a real inbox yet — check the first one that goes out.

Known, not changed: the old email (`email_1`) says "$49/month — 60,000 credits";
Starter is 5,000 credits a month. Fix the copy in the PostHog editor.

Re-check in 4 weeks: `paste_list_run` count, CSV uploaders per week, and payments
from people who received the list email (workflow stats).

## 3. The list-stopped banner checks out directly (8 Nov 2026)

**Why:** in 6 months, 25 people clicked upgrade on the list-stopped banner. All
25 saw the pricing modal (which opens on **annual** billing); 5 started a
checkout and all 5 paid. The 20 others stopped at the plan picker. The
payments with a known plan were monthly (Starter, Professional).

**Now** the banner (`showUpgradeBanner` → `lfGateButtonsHTML`) shows:
`[Finish my list · Starter $49/mo]  [$25 one-time · 1,000 credits]  See all plans`
- the plan is the smallest one whose monthly credits cover the rows left
  (`sizePlanForRows`), checked out **monthly** via `proceedToCheckoutDirect`;
- the pack is the smallest of $25 / $75 / $200 that covers the rows left, and is
  hidden when none does;
- "See all plans" is the old modal path;
- subscribers keep the old single button (they change plan in the modal).

Event: `bulk_gate_direct_checkout {choice: plan|pack|all}`; the plan and pack
clicks also fire `bulk_results_upgrade_cta_clicked` with `surface: banner_direct`
so the old funnel stays comparable. Re-check: of the clickers, how many reach
`checkout_worker_request_started` (was 5 of 25).

## 4. Email changes for conversion (8 Nov 2026)

Read-out first (PostHog, 90 days, payments seen in the browser only — the Dodo
server-side event is not in this project, so these undercount):

| Workflow | Reached | Opened | Clicked | Paid within 14d |
| --- | --- | --- | --- | --- |
| 3. New user activation | 816 | 325 | 53 | 4 |
| 7. Bulk upload | 729 | 144 (20%) | 14 | 1 |
| 6. Never found the API/MCP | 501 | 159 | 11 | 0 |
| 5. Pricing seen, no payment | 144 | 31 | 2 | 0 |
| 2. Credit wall | 81 | 14 | 5 | 1 |
| 1. Checkout recovery | 19 | 6 | 3 | 2 |

Checkout recovery — a direct link back to the plan they picked — converts best
by far. The other emails sent people to a modal or a call. So:

- **Workflow 2, `email_1`** (credit wall, not a list): said "$49/month — 60,000
  credits" (wrong: 5,000 a month) and linked to the plan picker. Now states the
  real figures and has two direct buttons:
  `/app?action=upgrade&plan=starter_monthly` and `/app?action=upgrade&plan=payg_small`.
  Version 11.
- **Workflow 5** (pricing seen, no payment): new **day-1** email "the two ways to
  pay for LinkFinder (one is $25)" with the same two direct buttons, before the
  existing day-3 research/call email (which is unchanged, by the owner's intent).
  Skipped when the modal was opened from the credit wall
  (`trigger` = `credits_exhausted` / `bulk_credits_gated`) because workflow 2
  already emailed them. Most modal opens come from the header "Buy credits"
  button (200 people / 90 days). Version 8.
- **Workflow 7** (bulk, 24h after signup): subject "stop doing these one at a
  time" assumed they had run lookups and opened at 20% vs 40% for the welcome
  email. Now "got a list? run all of it at once", mentions pasting a list, and
  the button is `/app?action=sample` (opens bulk with the sample list loaded);
  a text link `/app?action=bulk` for their own file. Version 2.

New app links these depend on (`app.html`, `checkAuth`):
- `?action=upgrade&plan=payg_small|payg_medium|payg_large` → that pack's checkout
  (`email_resume_checkout {billing: payg}`).
- `?action=sample` / `?action=bulk` → list mode, sample loaded for `sample`
  (`bulk_email_landed`).

Re-check on **6 Dec 2026**: per-workflow paid-within-14d with the table query
above, `email_resume_checkout` by plan, `bulk_email_landed`, and workflow 7's
open rate.

## 5. Paying from an email credits the right account (8 Nov 2026)

Credits are granted to the account whose token rides on the Dodo session
(`metadata.user_token`, set by `dodo-checkout` from the signed-in browser; the
static second-door link carries the same `metadata_user_token`). So an email
link pays into **whoever is signed in on that browser**. Before 8 Nov the
`?action=upgrade&plan=` path had never fired in production
(`email_resume_checkout`: 0 in 120 days), so it was checked end to end offline,
worker intercepted (scratchpad `emailpay.js` / `rescue.js`):

| Case | What reaches the worker |
| --- | --- |
| signed in, `plan=payg_small` | `payg_small`, that account's token |
| signed in, `plan=starter_monthly` | `starter_monthly`, that account's token |
| signed out | no checkout; redirected to sign in; plan kept 24h in `lf_pending_email_checkout` |
| first load after signing in as B | `payg_small`, **B's** token; key removed, next load opens nothing |
| worker down | static Dodo link for the pack, `metadata_user_token` = the account |
| came back unpaid | rescue banner: open page / direct payment link / email us / try again |

Before checkout opens, `lfEmailCheckoutNotice()` shows "Opening checkout for
<email>. Credits go to this account. Not you? …" so a shared or second-account
browser is noticed before paying, and Dodo pre-fills the same email.
Pinned by `tests/paste-a-list.test.mjs`.
