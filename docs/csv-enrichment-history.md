# CSV enrichments: history, resume, and the shape of the export file

Before this, a bulk run left no trace anyone could find later. The rows landed
in `enrichment_history` one at a time, mixed in with every single lookup, with
nothing tying them back to the file they came from — so "where's the list I
enriched last Tuesday, and how much of it came back?" had no answer, and the
export CSV existed only for as long as the tab stayed open.

The History page now opens with a **CSV enrichments** section: one card per
uploaded file, showing how far the run got, what share of the file came back
enriched, and a button that hands back the finished CSV.

## The export file is the user's file

**Non-negotiable: what comes back is what went in, plus columns.** Every
original column, every original row, in the original order, with the enrichment
appended on the right. Before this it returned a freshly-invented table — rows
the enrichment could not read a name from had silently vanished, and the user's
own columns with them. People noticed, and they were right to.

`csvRenderRange(fromSrc, toSrc, includeHeader)` in `app.html` is the only thing
that writes CSV, and it iterates **`lfCsvRows`** — the uploaded grid — not
`bulkResults`. Enrichment is looked up per original row and left blank where
there is none. Two consequences worth knowing:

- `csvData` is not `lfCsvRows`. `lfBuildCsvData()` drops rows with no readable
  name, so every `csvData` entry carries a **`srcIndex`** back to the line it
  came from. Nothing may index one list with the other's offset.
- `employees` and `reactions` return many results per input row. Those still
  expand to one line each, but every line repeats the original row's columns, so
  the user's data is never lost — only multiplied.

`total_rows` counts rows the enrichment can actually run; `file_rows` is what
they uploaded. The History card names the gap ("12 with no name to look up")
rather than quietly reporting "500 of 500" on a 512-row file.

## Running in the background

The enrichment loop lives in the browser tab, so closing it stops the run. A
batch the user hands over is marked **`queued`**, and a runner finishes it with
no browser involved at all.

Nothing about it is new state. `input_rows`, `column_mapping` and
`processed_rows` were built for the in-tab resume and mean exactly the same
thing here; the runner is just a second thing that can move the cursor.

**Where it runs.** `supabase/functions/csv-batch-runner`, poked by six
`pg_cron` jobs every 30 seconds (`csv-batch-runner-1`…`-6`). Cloudflare would
have been the obvious home — the rest of the backend lives there — but Workers
cannot be deployed from this repo's tooling, and Supabase already had `pg_cron`
and `pg_net` installed. The cron jobs read the service key from
`vault.decrypted_secrets`, following `process-next-keyword` rather than
inlining a key.

### Parallel, and why that needed a different shape

**Measured: 418 rows a minute.** A 500-row file finishes in 72 seconds, 4,600
rows in about 11 minutes. The first version managed 72 a minute and would have
taken over an hour on the same file.

The old design could not go faster, and the reason is worth keeping: `result_csv`
is append-only and `csv_batch_checkpoint` only accepts a chunk starting exactly
where the row stands. That ordering is what makes the archive safe — and it is
also what stops two workers ever touching one batch.

So rows are stored individually in **`csv_enrichment_rows`** and assembled in
order at the end, instead of being appended as they finish. Each row owns the
CSV lines for its own span of the user's original rows — from just after the
previous enrichable row through its own — and any worker can compute that span
alone from `input_rows`. That is the property that makes parallelism safe rather
than merely fast: no worker needs to know what any other is doing.

Row `-1` holds the header and row `total` the trailing rows, so assembly
(`csv_batch_assemble`) is a plain ordered concatenation onto whatever the
browser already wrote, with no special cases. It only runs once every row is in,
so whichever worker finishes last closes the batch and the rest no-op.

Two things had to be fixed before it actually scaled, both worth remembering:

- **`FOR UPDATE SKIP LOCKED` over `LIMIT 1` is an exclusive claim.** Six workers
  raced for the same batch row, one took the lock and the other five were told
  "nothing queued". A batch that is already laid out is now handed back with no
  lock and no write at all — there is nothing to serialise, because the real
  claim happens per row in `csv_batch_claim_rows`, which has its own lease and
  its own `SKIP LOCKED`. The exclusive path survives only for a batch nobody has
  sharded yet, where exactly one worker must lay it out.
- **Claiming ahead cost more than it saved.** A worker that grabbed forty rows
  and ran out of slice after eight left thirty-two claimed and idle until their
  lease expired, stalling the batch for minutes. Workers now claim exactly one
  wave, and hand back anything they could not enrich (`csv_batch_unclaim_rows`)
  rather than letting it sit on a dead lease.

**The dials.** Throughput is roughly `cron jobs × ROW_CONCURRENCY`. Six jobs and
a concurrency of 8 gives the measured 418/min. Both can go up — but they raise
load on the enrichment pipeline in direct proportion, and that, not this runner,
is the real ceiling. Raise them together with a look at the error rate, not
blind.

**It calls the pipeline directly** rather than through the `linkfinderapp`
worker, whose rate limit is per client IP: every background row would come from
the same few Supabase addresses and throttle every user at once. The payload is
identical to the one that worker forwards, and it fires the same user webhook
afterwards, so a background row is indistinguishable from a foreground one.
Credits are deducted downstream either way.

Because rows complete out of order, `processed_rows` stops being a contiguous
cursor for a sharded batch — it becomes a count. The in-tab resume depends on it
being a cursor, so History does not offer "Resume here" for a batch the runner
has taken over; `sharded` on the batch row is the flag.

### The parity problem

A batch can be enriched **partly in the tab and partly by the runner**, with
both halves appended to the same archive. If the two export builders ever
disagree — a column renamed, a value formatted differently — the file has a
silent seam in the middle that nobody would think to look for.

So the runner's builder lives in `shared-export.js` as **plain JavaScript**,
specifically so `tests/csv-export-parity.test.mjs` can import the exact file the
runner runs and compare it against the copy inside `app.html`, over seven
enrichment shapes, demanding byte-identical output. It also asserts that a
handover mid-file joins invisibly. Change one, change the other; the test is
what stops that being a silent data bug.

### How a user reaches it

- **Leaving mid-run.** A notice under the progress bar says "Safe to leave"
  with a toggle (on by default). `flushCsvBatchOnExit` then marks the batch
  `queued` instead of `stopped`. The toggle only promises a handover once
  `csvBatchStoreInput` has confirmed the grid landed — otherwise the runner
  would have nothing to work from.
- **From History.** A stopped batch offers "Finish N in background" alongside
  "Resume here".

Taking a batch back into the tab sets its status to `processing`, and only
`queued` rows are claimable — that is what stops the runner working the same
batch underneath a resumed run.

## Resume

A run that stops — closed tab, dead laptop, credit wall — can be picked up where
it left off. The rows already enriched are **neither re-run nor re-charged**.
This started as a support ticket: a user stopped at 2,588 of 4,600 and had no
way back to their work.

Two entry points:

1. **On load.** `checkUnfinishedCsvBatch()` looks for the most recent batch that
   stopped short and still has its input rows, and puts a banner at the top of
   the app. Somebody whose tab died finds their work waiting rather than having
   to remember it.
2. **From History.** The card's Resume button links to `app?token=…&resume=<id>`.
   The app owns resuming — it needs the enrichment panel, the credit balance and
   the whole bulk pipeline — so History just hands the batch over.

A run whose grid never made it into the batch simply does not offer Resume: the
load banner filters on `input_rows=not.is.null` and the History card on
`input_bytes`. There is no state where the button appears and then fails.

`resumeCsvBatch(id)` rebuilds the run from the stored batch: it restores the
input/output selects, sets `lfCsvHeaders` / `lfCsvRows` / `lfMapping`, and
re-derives `csvData` through the *same* `lfBuildCsvData()` the first run used.
That is why the grid and the mapping are stored rather than the derived list —
it guarantees the row order, and therefore the resume cursor, still means the
same thing.

`processBulk(true)` then starts at `csvResumeFrom` instead of 0. Inside the
loop, `bulkResults` holds only **this** run's rows, so `slot = i - csvResumeFrom`
indexes it — an absolute `bulkResults[i]` silently corrupts a resumed run, and
`tests/csv-batch-history.test.mjs` fails the build if one comes back.

The invariant that makes any of this safe: **a resumed run must produce exactly
the file an uninterrupted run would** — no lost, duplicated or reordered lines.
`tests/csv-export-shape.test.mjs` asserts it directly, both across a resume and
across per-row checkpointing.

## The table

`public.csv_enrichment_batches` — one row per bulk run.

| Column | Notes |
| --- | --- |
| `user_id` | the LinkFinder token, same as `enrichment_history.user_id` |
| `file_name` | what the user dropped (`crm-export.csv`) |
| `label` | human enrichment name, e.g. `Lead Full Name + Company Name → Verified Email` |
| `type` / `input_type` / `output_type` | the combination type, so the History filters work on batches too |
| `total_rows` | rows the enrichment can run (drives progress and the resume cursor) |
| `processed_rows` | how far the run got |
| `found_rows` | rows that came back with a value |
| `credits_used` | numeric, so half-credit employee scrapes stay exact |
| `status` | `processing` (a tab) · `queued` (the server) · `completed` · `stopped` · `out_of_credits` |
| `queued_at` / `locked_until` / `attempts` / `last_error` | the background runner's queue and lease |
| `file_rows` | rows in the uploaded file (≥ `total_rows`) |
| `result_csv` | the export file, archived verbatim, appended to as the run goes |
| `result_bytes` | **generated** — `octet_length(result_csv)` |
| `input_rows` | the uploaded grid, verbatim, so the run can be resumed |
| `csv_headers` / `column_mapping` | the rest of what a resume needs |
| `input_bytes` | **generated** — is there still enough stored to resume? |

`result_bytes` and `input_bytes` exist so the list query can say "file
available, 1.8 MB" and "this one can be resumed" without ever pulling a
multi-megabyte column. The list selects every field *except* `result_csv` and
`input_rows`; either is fetched only on the click that needs it. Keep it that
way — selecting `*` here would make the page unusable for anyone with a few
large batches.

RLS is **off**, exactly as it is on `enrichment_history`: the page talks to
PostgREST with the publishable key and scopes every read to
`user_id=eq.<token>`. That is the posture the History page already had; this
table matches it rather than inventing a second one. If `enrichment_history`
ever moves behind real RLS, move this table in the same change.

The migrations live in Supabase on project `snxhsboboatjywgwdeds`:
`create_csv_enrichment_batches`, `csv_enrichment_batches_result_bytes`,
`csv_enrichment_batches_resume`, `csv_enrichment_batches_original_grid`,
`csv_enrichment_batches_input_bytes`, `csv_enrichment_batches_file_rows`. The
whole schema is reproduced at the bottom of this file.

## Writing it — `app.html`

`processBulk(resuming)` owns the row end to end:

1. **Open** — `csvBatchCreate(csvData.length)` before the first request. Just
   metadata, so it is a fast round trip. Skipped on a resume: the row exists.
   `csvBatchStoreInput()` then sends the uploaded grid **in the background** —
   see below. Skipped on a resume for the same reason.
2. **Checkpoint** — `csvBatchCheckpoint()` every `CSV_BATCH_PROGRESS_EVERY` (10)
   rows **or** `CSV_BATCH_PROGRESS_MS` (20s), whichever lands first. That is the
   most work a closed tab can cost.
3. **Close** — `csvBatchFinalize()` after the loop, whichever way it ended.
   `out_of_credits` when the credit wall stopped it, `stopped` when it ended
   short of the file, `completed` otherwise.

Every call is best-effort and swallows its errors. A Supabase outage must
degrade the history, never the enrichment the user is paying for.

### Why an RPC and not a PATCH

Re-sending the whole `result_csv` on every checkpoint is O(n²) in bytes: a
4,600-row profile scrape checkpointing every 10 rows would push hundreds of
megabytes. `public.csv_batch_checkpoint(...)` appends **only the rows finished
since the last checkpoint** and advances the counters in the same statement, so
`result_csv` and `processed_rows` can never disagree.

It takes a `p_from_row`, and applies the chunk only if the stored row is
*exactly* there. That makes it idempotent and ordering-safe — a retried or
out-of-order request cannot duplicate lines. It returns the true
`processed_rows`; on a mismatch the client leaves its cursor alone and retries
the same chunk rather than appending out of order.

Only the first chunk of a batch carries the header row. `csvBatchAppendTail()`
flushes the user's trailing rows — the ones with no name, or a tail that
produced nothing — but **only when the run completed**. A run that stopped short
leaves them out on purpose: a resume continues there, and appending them early
would put them in the file ahead of their own enrichment.

### Reliability

- **One retry** (`CSV_ROW_RETRIES`) on a dropped connection or a 5xx. A 4xx is
  an answer, not a blip — 403 is the credit wall — so it comes straight back.
  Before this, one flaky request put `Error` in the user's file permanently.
- **Checkpointing on time as well as rows**, so a slow enrichment cannot go
  twenty minutes without saving anything.
- **The uploaded grid is stored out of the critical path.** A 10,000-row CRM
  export forty columns wide is ~6.5 MB of JSON (measured, not guessed). Sending
  that as part of `csvBatchCreate` would put a multi-megabyte upload between the
  user pressing Process and their first result — half a minute of staring at
  nothing on a middling connection. So `csvBatchStoreInput()` is a separate
  PATCH, fired and never awaited, with one retry on a 5xx and none on a 4xx (a
  refusal is an answer — the same payload will not fit next time either).

  If it fails for any reason, including a gateway that will not take a body that
  size, **the run is still tracked and still archived** — it just cannot be
  resumed, and the card offers no Resume button rather than one that cannot
  work. `CSV_BATCH_MAX_INPUT_CHARS` (25,000,000) is the last guard, and it is
  about what the browser can safely stringify and hold, not about what is polite
  to POST.

  This is why raising the ceiling is safe: nothing downstream assumes the grid
  is there. `input_bytes` is the single source of truth for "can this be
  resumed", and both the History card and the load banner read it.

## Reading it — `history.html`

- `loadCsvBatches()` fetches metadata only, newest first, 200 max.
- The **same search / type / date filters** narrow the CSV section and the
  activity list together, so finding a file is one query rather than a scroll.
- Each card shows two numbers, because they answer different questions:
  **% enriched** (`found / total`, the big one — what the file is worth now) and
  **rows processed** (`processed / total` — how far the run got). The bar layers
  both: solid green for enriched, pale blue for processed-but-no-match, grey for
  rows that never ran.
- Unfinished runs offer **Resume** next to the partial download. A finished one
  offers only the download.
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

## The schema

```sql
create table if not exists public.csv_enrichment_batches (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    file_name text,
    label text,
    type text,
    input_type text,
    output_type text,
    total_rows integer not null default 0,     -- rows the enrichment can run
    file_rows integer,                          -- rows the user uploaded
    processed_rows integer not null default 0,
    found_rows integer not null default 0,
    credits_used numeric(12,2) not null default 0,
    status text not null default 'processing',
    result_csv text,
    result_filename text,
    input_rows jsonb,        -- the uploaded grid, verbatim
    csv_headers jsonb,
    column_mapping jsonb,
    started_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
);

alter table public.csv_enrichment_batches
    add column if not exists result_bytes integer
    generated always as (octet_length(result_csv)) stored,
    add column if not exists input_bytes integer
    generated always as (octet_length(input_rows::text)) stored;

create index if not exists csv_enrichment_batches_user_started_idx
    on public.csv_enrichment_batches (user_id, started_at desc);

alter table public.csv_enrichment_batches disable row level security;
grant select, insert, update on public.csv_enrichment_batches to anon, authenticated;

-- Appends one chunk of finished CSV lines and advances the counters atomically.
-- p_from_row makes it idempotent: the chunk lands only if it starts exactly
-- where the row stands, so a retry cannot duplicate lines.
create or replace function public.csv_batch_checkpoint(
    p_id uuid, p_user_id text, p_from_row integer, p_processed integer,
    p_found integer, p_credits numeric, p_chunk text, p_filename text default null
) returns integer
language plpgsql
as $$
declare v_processed integer;
begin
    update public.csv_enrichment_batches
       set result_csv      = coalesce(result_csv, '') || coalesce(p_chunk, ''),
           result_filename = coalesce(result_filename, p_filename),
           processed_rows  = p_processed,
           found_rows      = p_found,
           credits_used    = p_credits,
           updated_at      = now()
     where id = p_id and user_id = p_user_id and processed_rows = p_from_row
    returning processed_rows into v_processed;

    if v_processed is null then
        select processed_rows into v_processed
          from public.csv_enrichment_batches
         where id = p_id and user_id = p_user_id;
    end if;
    return v_processed;
end;
$$;

grant execute on function public.csv_batch_checkpoint(
    uuid, text, integer, integer, integer, numeric, text, text
) to anon, authenticated;
```

## Tests

Both files pull the real code straight out of the shipped HTML and run it, so
they cannot drift from what ships. If a marker moves, the slice fails loudly
rather than silently checking nothing.

    node --test tests/csv-export-shape.test.mjs tests/csv-batch-history.test.mjs

- **`csv-export-shape.test.mjs`** guards the export contract: original rows and
  columns survive, unreadable rows stay in place blank, enrichment lands on the
  right row, and — the one that makes resume safe — a resumed or
  chunk-by-chunk run rebuilds byte-for-byte the file an uninterrupted run
  would.
- **`csv-batch-history.test.mjs`** covers the batch row: what gets stored,
  checkpoint ordering and idempotency, the four end states, and the History
  card's Resume/Download logic.
