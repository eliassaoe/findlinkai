# API calls in History and in "What you've found"

**Status:** the database side and the History page ship in this repo. The last
step is a few lines in the public API worker (`api.linkfinderai.com`), which
lives in Cloudflare and not here.

## The problem

History (`history.html`) and the account page's **What you've found**
(`user_value_summary`, see `docs/account-value-summary.md`) read one table:
`enrichment_history`. That table is written **inside the n8n app workflow**
(`/webhook/linkfinderapp` on the `Webhook processor` Railway service). The app
writes it. **The public API path does not.**

So everything a customer runs through the API (MCP, the n8n community node, the
Google Sheets add-on, Zapier, their own code) was charged but left no trace they
could find, and never counted toward what they found. For the customers using
us most heavily, those are the lookups that matter most.

What the data showed on 8 Oct 2026: in a 12-hour window the pipeline webhooks
served ~300 requests (213 on `/webhook/linkfinderapp`, 78 on a second webhook
called from Cloudflare) while `enrichment_history` gained **5 rows**.

## The fix

1. **`source` column** on `enrichment_history`: `'app'` (default, so every
   existing row and every pipeline write is unchanged) or `'api'`.
2. **`record_api_enrichment(...)`**: the API worker calls it after each
   successful lookup. It is **safe whether or not the pipeline also writes the
   row**, which cannot be checked from here: if an identical row (same user,
   type, input) landed in the last two minutes it is tagged `source = 'api'`
   instead of duplicated. Service role only, never `anon`: `user_id` is the
   session token and must not be writable from a browser.
3. **History** shows an `API` badge, a **Source** filter (App & API / App only /
   API only) and a `Source` column in the export.
4. **What you've found needs no change.** `user_value_summary` already counts
   every row in `enrichment_history`, so API rows count from the moment they
   are written, through the same "found" rules.

Migration: `supabase/migrations/20261008120000_api_calls_in_history.sql`.

## The worker patch (the remaining step)

Copy `record.js` next to the API worker's entry file. Add a KV namespace for
async jobs and the two Supabase secrets:

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "API_JOBS"
id = "<create with: wrangler kv namespace create API_JOBS>"
# secrets: wrangler secret put SUPABASE_URL / SUPABASE_SERVICE_KEY
```

Then, where the worker already has the request body and the response it's
about to return:

```js
import { recordApiCall, recordJobResult } from './record.js';

// POST / (and the legacy /v1/<type> paths), after the pipeline has answered:
ctx.waitUntil(recordApiCall(env, {
  apiKey: request.headers.get('Authorization'),
  body,                       // the parsed request JSON: { type, input_data, ... }
  pathname: url.pathname,
  status: response.status,    // what the customer gets
  payload: responseJson,      // the parsed JSON the customer gets
}));

// GET /status/{job_id}, after it has answered:
ctx.waitUntil(recordJobResult(env, { jobId, status: response.status, payload: responseJson }));
```

`ctx.waitUntil` keeps the write off the response path, and both functions
swallow every error: a Supabase outage must never fail or slow a paid API call.

What gets written:

| Response | Row? |
| --- | --- |
| 2xx with a result, including "not found" | yes. The app records misses too; `user_value_summary` scores them 0 |
| 202 + `job_id` | not yet. Parked in KV for 15 min (results live 10) |
| `/status/{id}` → `done` | yes, once. The KV entry is deleted, so re-polls add nothing |
| 4xx / 5xx / `status: error` | no |

## Checking it works

After deploying the worker, make one API call, then:

```sql
select type, input, source, "timestamp"
  from enrichment_history
 where source = 'api'
 order by "timestamp" desc limit 5;
```

If the pipeline *was* already writing API rows, you'll see them flip from
`app` to `api` rather than appear twice. Either way, History shows them with
the `API` badge.

## Tests

    node --test tests/api-history.test.mjs

Pins the key→token mapping, one row per sync call, async jobs recorded exactly
once, no rows for errors, Supabase failures never throwing, credit costs equal
to `app.html`'s `creditCosts`, the RPC grants, and the History page wiring.
