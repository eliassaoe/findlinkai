# LinkFinder AI for Make

A Make (Integromat) custom app with one module per LinkFinder AI operation, generated
from `integrations/catalog/operations.json`.

## Build

```bash
node build.mjs        # regenerates general/, connections/ and modules/
node --test test/app.test.mjs   # structural checks against the catalog
```

Everything under `general/`, `connections/` and `modules/` is generated. Change
`integrations/catalog/overlay.json` or the root `openapi.json` and rebuild — do not
hand-edit the generated files.

## Layout

| Path | What it is |
| --- | --- |
| `app.json` | App metadata |
| `general/base.imljson` | Base URL, bearer header, and the shared error messages |
| `connections/linkfinderai/` | API-key connection and its (free) validation call |
| `modules/<key>/` | One folder per operation — `api`, `parameters`, `interface`, `samples` |

Operations that return a list (employees, post reactions, AI lead search) are Make
**searches**, emitting one bundle per record. Everything else is an **action**.

## How a module handles asynchronous lookups

`Get LinkedIn Profile Details` always returns a job rather than a result, and any
operation can fall back to a job under load — so every module is generated as the same
three steps: POST the enrichment, then poll `/status/{job_id}` *only if* a job id came
back (`repeat`, 2s apart, capped at 20 tries ≈ 40s), then emit the bundle. A scenario
never hangs on a stuck job.

## Credits

Module descriptions carry the real cost. They are not uniform — `Find Phone from
LinkedIn Profile` is **50 credits**, `Get LinkedIn Profile Details` and `Find Email
from LinkedIn Profile` are **10**, `Find Email from Name` is **7**, most company
lookups are **1**. Employee lists bill 0.5 credits per employee returned.

Every call is charged, **including one that finds nothing**.

## Before submitting to Make

Two things cannot be checked from this repo, because the build environment has no
network access to the API:

1. **IML validation.** The `repeat` / `condition` / `temp` usage above is written to
   Make's documented semantics but has not been run in Make's editor. Import the app
   and run each module once before submitting it for review.
2. **Sample output.** `samples.imljson` and `interface.imljson` are derived from
   `api-documentation.html` and the app's own result renderers, not from live
   responses. Reconcile them against a real call.
