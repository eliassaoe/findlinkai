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
