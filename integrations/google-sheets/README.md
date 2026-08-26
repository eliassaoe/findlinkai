# LinkFinder AI for Google Sheets

An Apps Script add-on that enriches a column in place. Built because the most-run
operation in the whole API is `lead_full_name_to_linkedin_url` — a column goes in, a
column comes out, over and over — and the people running it are sales ops who will
never copy an API key.

## Files

| File | What it is |
| --- | --- |
| `Operations.gs` | **Generated** from the catalog — the 20 operations, their costs and inputs |
| `Code.gs` | API key handling, the API call, and the `=LINKFINDER()` custom function |
| `Bulk.gs` | Column enrichment, including surviving the 6-minute execution limit |
| `Sidebar.html` | The panel |
| `appsscript.json` | Manifest and scopes |

`node build.mjs` regenerates `Operations.gs`. Don't edit it by hand.

## Installing

1. In the sheet: **Extensions → Apps Script**.
2. Create the four files above and paste in the contents, then replace the manifest
   (**Project Settings → Show `appsscript.json`**).
3. Reload the sheet. A **LinkFinder AI** menu appears.
4. **LinkFinder AI → Set API key…**

## Using it

**A whole column** — *LinkFinder AI → Enrich a column…*. Pick the lookup, the column to
read, the column to write into. The panel shows what the run will cost *before* you
start it, multiplied out by the row count, because the real risk in a spreadsheet is
doing something two thousand times without noticing the price.

**One cell** — `=LINKFINDER("lead_full_name_to_linkedin_url", A2)`.

## The two things that make a large run safe

**It never pays twice.** A row whose target cell already has a value is skipped without
calling the API. That is what makes re-running a range cheap and resuming safe.

**It survives the execution limit.** Apps Script kills a script at six minutes, which a
few thousand rows will always exceed. The run stops at 4.5 minutes, saves its position,
and schedules itself to continue a minute later — so an interrupted job picks up where
it left off instead of starting again from the top and re-charging for every row.

A row that fails gets the error written into it rather than aborting the run — except
for "out of credits" and "key rejected", which will not fix themselves, and stop the
run rather than writing the same error into every remaining row.

## Costs

Not uniform. `linkedin_profile_to_phone` is **50 credits per row** — that is 50,000
credits over a thousand rows. `linkedin_profile_to_email` and
`linkedin_profile_to_linkedin_info` are 10, `lead_full_name_to_email` is 7, most
company lookups are 1. Employee lists bill 0.5 credits per employee returned.

Every row is charged, **including rows that find nothing** (those get "Not found").
The sidebar warns on anything costing 7 or more.

## Keys are per user, not per sheet

The key is stored in user properties, so sharing the sheet does not share your key or
spend your credits. Each person enriching from it sets their own.
