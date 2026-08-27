# CSV enrichments in the History tab

Before this, a bulk run left no trace anyone could find later. The rows landed
in `enrichment_history` one at a time, mixed in with every single lookup, with
nothing tying them back to the file they came from — so "where's the list I
enriched last Tuesday, and how much of it came back?" had no answer, and the
export CSV existed only for as long as the tab stayed open.

The History page now opens with a **CSV enrichments** section: one card per
uploaded file, showing how far the run got, what share of the file came back
enriched, and a button that hands back the finished CSV.

## The table

`public.csv_enrichment_batches` — one row per bulk run.

| Column | Notes |
| --- | --- |
| `user_id` | the LinkFinder token, same as `enrichment_history.user_id` |
| `file_name` | what the user dropped (`crm-export.csv`) |
| `label` | human enrichment name, e.g. `Lead Full Name + Company Name → Verified Email` |
| `type` / `input_type` / `output_type` | the combination type, so the History filters work on batches too |
| `total_rows` | rows in the file |
| `processed_rows` | how far the run got |
| `found_rows` | rows that came back with a value |
| `credits_used` | numeric, so half-credit employee scrapes stay exact |
| `status` | `processing` · `completed` · `stopped` · `out_of_credits` |
| `result_csv` | the export file, archived verbatim |
| `result_bytes` | **generated** — `octet_length(result_csv)` |

`result_bytes` exists so the list query can say "file available, 1.8 MB"
without ever pulling a multi-megabyte column. The list selects every field
*except* `result_csv`; the content is fetched only when someone clicks
Download. Keep it that way — selecting `*` here would make the page unusable
for anyone with a few large batches.

RLS is **off**, exactly as it is on `enrichment_history`: the page talks to
PostgREST with the publishable key and scopes every read to
`user_id=eq.<token>`. That is the posture the History page already had; this
table matches it rather than inventing a second one. If `enrichment_history`
ever moves behind real RLS, move this table in the same change.

The migration lives in Supabase (`create_csv_enrichment_batches` and
`csv_enrichment_batches_result_bytes` on project `snxhsboboatjywgwdeds`) and is
reproduced at the bottom of this file.

## Writing it — `app.html`

`processBulk()` owns the row end to end:

1. **Open** — `csvBatchCreate(csvData.length)` before the first request,
   `status: 'processing'`.
2. **Progress** — every `CSV_BATCH_PROGRESS_EVERY` (25) rows, fire-and-forget
   PATCH of `processed_rows` / `found_rows` / `credits_used`. Never awaited: a
   slow write must not stall the enrichment.
3. **Close** — `csvBatchFinalize()` after the loop, whichever way it ended.
   `out_of_credits` when the credit wall stopped it, `stopped` when it ended
   short of the file, `completed` otherwise.

Every call is best-effort and swallows its errors. A Supabase outage must
degrade the history, never the enrichment the user is paying for.

The archived CSV comes from `buildBulkCsv()` — the same function
`downloadResults()` uses, extracted for exactly this reason. What History hands
back is byte-for-byte the file the Export button would have produced, so the two
can never drift.

Two deliberate limits:

- **`CSV_BATCH_MAX_CSV_CHARS` = 4,000,000.** Postgres would take far more, but
  a 4 MB POST from a browser on a bad connection is already pushing it. Past
  that the run is still tracked, just without the file, and the card says so.
- The row still marked `Processing` when the credit wall hit never got an
  answer, so it is filtered out of the archived file (and handed back to
  `bulkResults` afterwards, which the results table is still reading).

## Reading it — `history.html`

- `loadCsvBatches()` fetches metadata only, newest first, 200 max.
- The **same search / type / date filters** narrow the CSV section and the
  activity list together, so finding a file is one query rather than a scroll.
- Each card shows two numbers, because they answer different questions:
  **% enriched** (`found / total`, the big one — what the file is worth now) and
  **rows processed** (`processed / total` — how far the run got). The bar layers
  both: solid green for enriched, pale blue for processed-but-no-match, grey for
  rows that never ran.
- A run left in `processing` that has not reported for 15 minutes
  (`CSV_BATCH_STALE_MS`) reads **Interrupted**, not **Running** — progress is
  written every 25 rows, so anything quieter than that is a closed tab. Those
  runs never reached finalize, so they have no file, and the card says so
  instead of offering a dead button.

## Things that will bite

- **`enrichment_history` is written server-side**, somewhere in the n8n /
  Railway pipeline — not by `app.html` and not by the `linkfinderapp` worker
  (which only proxies and fires the webhook). That is why batches are a separate
  table written from the page rather than a `batch_id` column on the history
  rows: tagging them at the source would mean changing a pipeline that is not in
  this repo.
- The whole History page is behind the subscriber paywall, so the archived CSV
  is only ever handed to subscribers. That matches `downloadResults()`, which
  gates full export behind `ensureSubscribedForExport()`.
- Runs are archived regardless of subscription status. A free user who upgrades
  later finds their earlier files waiting, which is the point.

## The migration

```sql
create table if not exists public.csv_enrichment_batches (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    file_name text,
    label text,
    type text,
    input_type text,
    output_type text,
    total_rows integer not null default 0,
    processed_rows integer not null default 0,
    found_rows integer not null default 0,
    credits_used numeric(12,2) not null default 0,
    status text not null default 'processing',
    result_csv text,
    result_filename text,
    started_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists csv_enrichment_batches_user_started_idx
    on public.csv_enrichment_batches (user_id, started_at desc);

alter table public.csv_enrichment_batches disable row level security;

grant select, insert, update on public.csv_enrichment_batches to anon, authenticated;

alter table public.csv_enrichment_batches
    add column if not exists result_bytes integer
    generated always as (octet_length(result_csv)) stored;
```

## Tests

`tests/csv-batch-history.test.mjs` pulls both halves straight out of the
shipped HTML and runs them — `node --test tests/csv-batch-history.test.mjs`. If
a marker moves, the slice fails loudly rather than silently checking nothing.
