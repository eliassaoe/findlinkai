# `api_first_call_succeeded` — the one event the API funnel is missing

**Status:** the in-app side ships in this repo. The worker side is a 20-line
patch to the public API worker, which lives in Cloudflare and not here.

## Why

157 people copied an API key in 90 days. Nobody knows how many ever made a
request, because nothing anywhere records a successful API call against the
person who made it. Every decision about the API route is being made on
`api_key_copied`, which is intent, not adoption.

Two events close the gap:

| Event | When | Who fires it |
| --- | --- | --- |
| `api_first_call_succeeded` | The first 2xx response a person ever gets from `api.linkfinderai.com` | The app / API page / docs page today (source `in_app_test`, `api_access_test`, `api_docs_test`), the API worker for everything else (source `api`) |
| `api_call_made` | Daily rollup per person, **not** per request | The API worker only |

The ratio that matters from then on: **`api_first_call_succeeded / api_key_copied`**.

## What already fires (this repo)

`app.html`, `api-access.html` and `api-documentation.html` each have a **Run it
now** button under the request they show. It POSTs to the public API from the
browser with the person's real key and shows the response. On a 2xx it fires
`api_test_call_succeeded` every time and `api_first_call_succeeded` once per
browser (guarded by `localStorage.lf_api_first_call_ok`). Failures fire
`api_test_call_failed` with `http_status` (or `network` when the browser could
not reach the API at all, which is the CORS case below).

## What the API worker needs

The worker already derives the account from the bearer key. PostHog's distinct
id for a user is the **session token** (`posthog.identify(userToken, …)` in
`app.html`), and the API key is `transformerToken(token)`: each char code + 7,
two hex digits, joined with `Z`. Reversing it gives the token, i.e. the distinct
id, so the event lands on the same person as everything else.

```js
// In the API worker, after a request has been served with status 2xx.
const POSTHOG_KEY = 'phc_HqgzMyWAMtzH7K5j9CLw0dijB0I9W1VjPkkyzg9KOFG';

function tokenFromApiKey(key) {
  return key.split('Z').map((h) => String.fromCharCode(parseInt(h, 16) - 7)).join('');
}

async function captureFirstCall(env, apiKey, type, status, ms, isFirst) {
  const distinct_id = tokenFromApiKey(apiKey);
  const events = [];
  if (isFirst) {
    events.push({ event: 'api_first_call_succeeded', distinct_id,
      properties: { source: 'api', type, http_status: status, ms } });
  }
  // Daily rollup: only when the KV/D1 flag for (distinct_id, today) is unset.
  if (await markDailyOnce(env, distinct_id)) {
    events.push({ event: 'api_call_made', distinct_id, properties: { source: 'api', type } });
  }
  if (!events.length) return;
  // ctx.waitUntil so the response is never delayed by analytics.
  await fetch('https://us.i.posthog.com/batch/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: POSTHOG_KEY, batch: events }),
  });
}
```

`isFirst` is "this key has never had a 2xx before": one boolean per account in
KV/D1, set on the first success. `markDailyOnce` is one key per
`(distinct_id, YYYY-MM-DD)` with a 48h TTL. Both are a few lines.

**Do not fire `api_call_made` per request.** A 4,000-row nightly job would be
4,000 events for one fact.

## CORS, so the in-app button can actually run

From this sandbox the API answered the preflight with **403**, which may be the
sandbox's own egress block rather than the worker. If a real browser also fails
(the button then shows "This browser could not reach the API directly"), the
worker needs to answer `OPTIONS` and add these headers on every response for
the `https://linkfinderai.com` origin:

```
Access-Control-Allow-Origin: https://linkfinderai.com
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

Until that is in place the buttons degrade to "copy this and run it in a
terminal", which is what the page said before. Check `api_test_call_failed`
with `http_status = network` in PostHog: if that is most of the volume, CORS is
still off.

## Where the event is used

- The **API route** lifecycle workflow (`workers/lifecycle-email/NEW_CAMPAIGNS.md`)
  uses `api_first_call_succeeded` as its conversion goal, so the follow-up
  email is never sent to someone whose key already works.
- `docs/next-step-routing.md` names it as the only honest read on the API side
  of the CSV-or-API activation metric.
