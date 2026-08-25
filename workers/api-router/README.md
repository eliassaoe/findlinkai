# api.linkfinderai.com — the public API router

Live Worker name in Cloudflare: **`linkedfinderapiaccess`**.
There is no wrangler project. Deploy by pasting `worker.js` into the dashboard.

`worker.js` here was pulled from the live Worker on 2026-08-25 and is byte-for-byte
that code except for the one bug fixed below. Committed so it stops existing only
inside a browser tab.

## Shape

    POST /                        -> enqueue an enrichment, sync or async
    GET  /status/:job_id          -> poll an async result
    POST /webhook/complete/:job_id -> n8n pushes the finished result back (X-Callback-Secret)

Bindings it expects: `jobs_kv`, `RATE_LIMIT_KV`, `RATE_LIMITER`, `GLOBAL_RATE_LIMITER`,
`CALLBACK_SECRET`. Upstream is a single n8n webhook on Railway.

`linkedin_profile_to_linkedin_info` is the **only** type in `asyncTypes` — it always
returns `202` plus a `poll_url`. Everything else races Railway for 27s and only falls
back to async on timeout.

---

## Incident 2026-08-24 — customers getting HTTP 403, Cloudflare Error 1010

A customer reported:

    HTTP 403 — Cloudflare Error 1010, browser_signature_banned
    zone:    api.linkfinderai.com
    ray_id:  a30549910ff8e4bb
    at:      2026-08-24T21:00:35Z
    op:      linkedin_profile_to_linkedin_info
    "Do not retry. Your user-agent has been banned by the site owner."

**This Worker never ran.** Nothing in `worker.js` can emit that payload — every error
path here returns `{error, message}` and nothing else. No `error_name`, no `zone`, no
`ray_id`. The 403 was produced by Cloudflare's edge, on our own zone, before the
request reached the Worker. "The site owner" who banned them is us.

It is not LinkedIn. `linkedin.com` is not behind Cloudflare, so it cannot emit a 1010.
And a 1010 raised upstream could not reach a customer in that shape anyway: a
Cloudflare error page is HTML, which would hit the `JSON.parse` failure path here and
come back as our own `502 "Invalid response from server"`.

### Cause

Cloudflare's **Browser Integrity Check** is *on by default* on every zone. Per
Cloudflare's docs it "challenges visitors without a user agent or with a non-standard
user agent" and "denies access" — that denial is Error 1010. It is built for browser
traffic. On an API host every legitimate client is, by definition, not a browser.

Our own published examples in `api-documentation.html` send exactly the user-agents it
rejects:

| Example | User-Agent sent |
| --- | --- |
| cURL (`:392`) | `curl/8.x` |
| Python (`:405`) | `python-requests/2.x` |
| Node `fetch` (`:423`) | a UA Cloudflare tolerates |
| n8n node (`n8n-nodes-linkfinderai`) | sets only `Authorization` + `Content-Type` |

So this is not one unlucky customer — it is a coin flip on every API customer,
decided by their HTTP client. That is also why it looked intermittent instead of
total, and why nobody caught it earlier.

`linkedin_profile_to_linkedin_info` is over-represented in reports for a structural
reason: it is the only operation that forces the caller into a **polling loop** of
repeated `GET /status/:job_id`. Repeated GETs from a non-browser client is the exact
traffic shape edge bot protection reacts to. The screenshot's title was "Retry Error".

### Fix — dashboard only, cannot be done from code

The Worker cannot help: it never executes. This has to be turned off at the edge.

1. **Confirm which feature fired**, using the ray ID. Security → Analytics → *Events*,
   search ray `a30549910ff8e4bb`. The **Service** column names it: `Browser Integrity
   Check`, `Bot Fight Mode`, or a custom rule. Do this first — it is the difference
   between fixing it and guessing.

2. **If it is Browser Integrity Check** — disable it for the API hostname only, so the
   marketing site keeps it. Rules → Overview → Configuration Rules → *Create rule*:
   - Name: `Disable BIC on the API`
   - Field **Hostname**, operator **equals**, value `api.linkfinderai.com`
   - Scroll to **Browser Integrity Check**, **+ Add**, set the toggle **Off**
   - Deploy

   (Zone-wide off is Security → Settings → *Browser integrity check*. Prefer the
   hostname-scoped rule.)

3. **If it is Bot Fight Mode** — it must be turned off entirely: Security → Settings →
   filter *Bot traffic* → **Bot fight mode** off. Per Cloudflare's docs it "does not
   run on the Ruleset Engine", so *Skip*, *Bypass* and *Allow* actions have no effect
   on it and no rule can carve out the API. Super Bot Fight Mode (Pro/Business) can be
   skipped by a custom rule; plain Bot Fight Mode cannot.

4. Keep the abuse protection that actually belongs on an API: this Worker already
   rate-limits per API key (`RATE_LIMITER`, 10 req/10s) and in aggregate
   (`GLOBAL_RATE_LIMITER`). That is the right control here, not user-agent sniffing.

### Billing

The customer was almost certainly not charged. A 403 at the edge means the Worker
never ran, so no credit was ever deducted. Confirm against their ledger before
promising it.

---

## Bug found while reading this file: every upstream 401/403 became a 500

On the sync fast path, `text` was declared `const` **inside** the try block, and then
read outside it by the 401/403 diagnostic:

```js
    let data;
    try {
      const text = await response.text();   // block-scoped
      ...
      data = JSON.parse(text);
    } catch (parseError) { ... }

    if (response.status === 403 || response.status === 401) {
      console.error(`... Upstream body:`, text.slice(0, 500));   // ReferenceError
    }
```

`text` is not in scope there. Any 401 or 403 from Railway threw
`ReferenceError: text is not defined`, which the outer `catch` swallowed and returned
as a generic **500 "Internal server error"** — hiding the real status on precisely the
two codes a customer most needs to see, and destroying the log line meant to diagnose
them.

Second-order problem in the same block: the diagnostic ran *after* `JSON.parse`. A
401/403 from Railway is usually an HTML error page, so the parse threw first and
returned 502 — meaning the log never fired in the case it exists for.

Both fixed in `worker.js`: `text` is hoisted to function scope, the body is read once,
the diagnostic logs before parsing, and the parse happens last.

Reproduced against the live code before patching:

    upstream said 403
      OLD worker returns: {"status":500,"error":"text is not defined"}
      NEW worker returns: {"status":403,"data":{"error":"upstream refused"}}

This is unrelated to the 1010 above — it was found while reading the file, not while
chasing it. Ship it with the same paste.
