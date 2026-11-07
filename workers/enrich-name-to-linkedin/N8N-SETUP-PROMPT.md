# Setup prompt for Claude in Chrome

Paste everything below the line into Claude in Chrome. It deploys the worker in
the Cloudflare dashboard and wires it into the n8n enrichment router at 20% of
traffic. n8n keeps its own credit charging and history logging. The worker only
replaces the search.

---

You're going to set up a better "name → LinkedIn URL" lookup for LinkFinder AI.
There are two parts: deploy a Cloudflare Worker, then route 20% of one n8n
branch to it. Work carefully: this workflow serves paying customers live.
**Stop and ask me before** you activate anything, delete any node, or if
something doesn't match what I describe here.

## Part A — deploy the Worker (Cloudflare dashboard)

1. Open https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   **Create Worker**. Name it `enrich-name-to-linkedin`, then click
   **Deploy** (it deploys a Hello World first, which is normal).
2. Click **Edit code**. Open
   https://raw.githubusercontent.com/eliassaoe/findlinkai/main/workers/enrich-name-to-linkedin/worker.js
   in another tab and copy the whole file. In the editor, replace all the
   contents of `worker.js` with it, then click **Deploy**.
3. Go to the Worker's **Settings → Variables and Secrets** and add these. Use
   type **Secret** for all except the first:
   - `SUPABASE_URL` (Text) = `https://snxhsboboatjywgwdeds.supabase.co`
   - `SUPABASE_SERVICE_KEY` (Secret): in the Supabase dashboard, project
     `snxhsboboatjywgwdeds` → Project Settings → API → the `service_role` key.
   - `SERPER_API_KEY` (Secret): copy it from the n8n Serper HTTP Request node
     in the branch described in Part B (header `X-API-KEY`). Read it, don't
     change that node.
   - `APIFY_TOKEN` (Secret): https://console.apify.com → Settings →
     **API & Integrations** → copy the personal API token.
   - `N8N_SHARED_SECRET` (Secret): generate a random 32-character string
     (letters and digits) and **show it to me** so I can keep it. You'll paste
     the same value into n8n in Part B.
4. Copy the Worker's URL (something like
   `https://enrich-name-to-linkedin.<account>.workers.dev`) and show it to me.

## Part B — route 20% of the n8n branch to it

5. Open n8n and find the workflow behind the API (the webhook that receives
   `{"type": ..., "input_data": ...}`). **Before editing, duplicate the
   workflow** (⋯ → Duplicate) or download it as JSON, as a backup.
6. Find the **Switch** branch for `lead_full_name_to_linkedin_url`. Map it
   for me before you change anything. It should be roughly:
   a Serper HTTP Request (`google.serper.dev/search`, query = the input +
   `site:linkedin.com/in`) → a node that checks `organic[0].title` against the
   name → on a match, a credit-charging Code node (1 credit, probably named
   `Code97`) → on no match, another one (0.5 credit, probably `Code24`) →
   a history insert into `enrichment_history` → Respond to Webhook. Note the
   **exact field and node names** each downstream node reads (for example
   `$json.result`, or `$('Serper…').item.json.organic[0].link`).
7. Between the Switch output and the Serper node, insert an **If** node named
   `Rollout: worker 20%`, with a Boolean condition: `{{ Math.random() < 0.2 }}`
   is true.
   - **false** → connect to the existing Serper node (old path, untouched).
   - **true** → the new node from step 8.
8. Add an **HTTP Request** node named `Worker: name → LinkedIn`:
   - Method `POST`, URL = the Worker URL from step 4.
   - Headers: `Content-Type: application/json`,
     `X-Worker-Key: <N8N_SHARED_SECRET from step 3>`.
   - Body JSON: `{"input_data": <the same input expression the Serper node uses, without " site:linkedin.com/in">}`
   - Options: Timeout `40000` ms. Response → **Include response headers and
     status** on, and **Never error** on (so 422 and 502 come through as data).
9. After it, add an **If** (or Switch) on the status code:
   - `422` → a **Respond to Webhook** with status 422 and body
     `{"error":"company_required","status":"error","message":"Add the company after the name, e.g. \"Jane Smith Acme\". Not charged."}`.
     No charge and no history row on this path.
   - `200` → step 10.
   - anything else (502, timeout…) → connect to the **old Serper node**, so
     the request quietly falls back to the old path.
10. On `200`, add a **Set** node that outputs exactly what the old match
    node handed downstream (from your map in step 6), with the URL taken from
    `{{ $json.body.result }}`. Then add an If on whether
    `{{ $json.body.result }}` is not empty:
    - not empty → the **same node the old "match found" branch led to**
      (the 1-credit charge);
    - empty → the **same node the old "no match" branch led to**
      (the 0.5 charge).
    If any downstream node reads a field by the Serper node's name (like
    `$('Serper').item.json...`), it won't exist on this path. Tell me which
    ones, and make them read the Set node's output instead in a way that
    still works on the old path (for example
    `{{ $json.result ?? $('Serper').item.json.organic[0].link }}`). Show me
    every expression you change.

## Part C — test, then ask me before activating

11. Temporarily set the rollout condition to `{{ true }}` and run the
    workflow in **test** mode with a real test token of mine (ask me for
    one), for each of:
    - `Alicia Carrasco Turning Point Brands` → expect
      `https://www.linkedin.com/in/alicia-carrasco` (found through the
      LinkedIn search fallback);
    - `Satya Nadella Microsoft` → expect a `linkedin.com/in/...` URL;
    - `Jane Smith` → expect the 422 `company_required` and **no** credit
      change;
    - `Zxqv Plorkington Acme` → expect an empty result and a 0.5 charge.
    For each one, tell me the response, how the token's credits changed (it
    should be exactly one charge: 1, 0.5 or 0), and whether an
    `enrichment_history` row was written.
12. Set the condition back to `{{ Math.random() < 0.2 }}`. Show me a summary
    of every node you added or changed, then **ask me before you
    activate/save the production workflow.**

Once it's live, after 3 days I'll compare hit rates with this SQL in Supabase:

```sql
select count(*) filter (where (result::jsonb->>'result') <> '') * 100.0 / count(*)
from enrichment_history
where type = 'lead_full_name_to_linkedin_url'
  and timestamp >= now() - interval '3 days';
```
