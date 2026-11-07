# Setup prompt for Claude in Chrome: company name → LinkedIn company page

Do this **after** the name → LinkedIn setup
(`workers/enrich-name-to-linkedin/N8N-SETUP-PROMPT.md`): it reuses the same
Serper key, Apify token and `N8N_SHARED_SECRET`. Paste everything below the
line into Claude in Chrome.

---

You're going to set up a better "company name → LinkedIn company page" lookup
for LinkFinder AI. This workflow serves paying customers live. **Stop and ask
me before** you activate anything, delete any node, or if something doesn't
match what I describe.

## Part A — deploy the Worker (Cloudflare dashboard)

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   **Create Worker**. Name it `enrich-company-to-linkedin` → **Deploy**.
2. **Edit code**. Copy the whole of
   https://raw.githubusercontent.com/eliassaoe/findlinkai/main/workers/enrich-company-to-linkedin/worker.js
   and replace the contents of `worker.js` with it. Click **Deploy**.
3. **Settings → Variables and Secrets**, all of type **Secret**:
   - `SERPER_API_KEY`: the same value as on the `enrich-name-to-linkedin`
     worker (or from the n8n Serper node, header `X-API-KEY`).
   - `APIFY_TOKEN`: the same Apify token as the other worker.
   - `N8N_SHARED_SECRET`: **the same value** as the other worker (ask me for
     it if you don't have it).
4. Show me the Worker URL.

## Part B — route 20% of the n8n branch to it

5. In the same n8n workflow as before, **duplicate it or download the JSON**
   first as a backup.
6. Find the Switch branch for `company_name_to_linkedin_url`. Map it for me
   before changing anything: the Serper node (query like
   `<company> site:linkedin.com/company`), the node that reads
   `organic[0].link`, the credit-charging node(s), the `enrichment_history`
   insert, and the Respond to Webhook. Note which fields and node names each
   downstream node reads.
7. Insert an **If** `Rollout: company worker 20%` before the Serper node,
   with `{{ Math.random() < 0.2 }}`: **false** → the existing Serper node
   (untouched), **true** → step 8.
8. **HTTP Request** `Worker: company → LinkedIn`: `POST` to the Worker URL,
   headers `Content-Type: application/json` and
   `X-Worker-Key: <N8N_SHARED_SECRET>`, body
   `{"input_data": <the same company expression the Serper node uses, without " site:linkedin.com/company">}`.
   Timeout `40000` ms. Turn on **Include response headers and status** and
   **Never error**.
9. Branch on the status code: `200` → step 10; anything else → the **old
   Serper node** (silent fallback).
10. On `200`, add a **Set** that outputs what the old "read organic[0]" node
    handed downstream, with the URL from `{{ $json.body.result }}`, and
    connect it to the **same next node** the old path used (the charging
    logic decides hit vs miss from the result, as it does today). If any
    downstream node reads a field by the Serper node's name, tell me which
    and change it to work on both paths, for example
    `{{ $json.result ?? $('Serper').item.json.organic[0].link }}`. Show me
    every expression you change.

## Part C — test, then ask me before activating

11. Temporarily set the rollout to `{{ true }}` and run in test mode with a
    test token I'll give you:
    - `Nihon Yamamura Glass Co. Ltd` → `https://www.linkedin.com/company/nihon-yamamura-glass-co-ltd/`
      (the old path returned a different company);
    - `D.R. FERROVIARIA ITALIA SRL` → `https://www.linkedin.com/company/dr-ferroviaria-italia/`
      (the old path found nothing);
    - `stripe.com` → `https://www.linkedin.com/company/stripe/`;
    - `Krause Rail Systems` → empty (the old path returned SRS Rail, which
      is wrong).
    For each, tell me the response, the credit change (exactly one charge,
    as today) and whether the history row was written.
12. Set the rollout back to `{{ Math.random() < 0.2 }}`, summarise every node
    you added or changed, and **ask me before activating**.
