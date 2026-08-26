# What is verified, and what is not

Updated 2026-08-26, after calling the live API through LinkFinder's own MCP server.
Most of what was open has now been settled from real responses. What remains is listed
below with what it would take to close it.

---

## Settled by live calls

| Question | Answer |
| --- | --- |
| Scalar result shape | Confirmed: `{"status":"success","result":"tesla.com"}` |
| Async accept shape | Confirmed: `202` → `{status:"processing", job_id, poll_url, message}` |
| Job status shape | Confirmed: flat `{status, result}` — the `data` wrapper the wrappers also accept was not observed |
| Employee list fields | Captured. 26 fields, camelCase, **including `firstName`/`lastName`** and `department` as an **array** |
| Profile info fields | Captured. Note: **missing values are `""`, not `null`** |
| LinkedIn company fields | Captured. Mixes camelCase and snake_case (`employeeCount` beside `company_description`) |

`overlay.json` now carries these as real samples, and the outreach lead normaliser
prefers the real `firstName`/`lastName` over splitting a full name.

---

## 1. `leads_finder_ai` is broken in production ⚠️

A live call returned **HTTP 200, `"status": "success"`** — with this as the result:

```json
{ "result": [ { "error": {
    "message": "403 — \"error\": { \"type\": \"full-permission-actor-not-approved\",
      \"message\": \"This Actor requires full access to your account. You must approve
      its permissions before running it\" }",
    "status": 403 } } ] }
```

The upstream Apify actor (`IoSHqwTR9YGhzccez`) has not had its permissions approved, so
the AI lead search returns a provider error for every call — presented as a success.

**Two separate problems.** The outage itself is fixable in one click at
`https://console.apify.com/actors/IoSHqwTR9YGhzccez?approvePermissions=true`. The
deeper one is that the API reports a provider failure as `status: "success"`, so any
consumer treats an error object as data.

Every integration here now checks for that envelope and raises instead — otherwise a
stack trace would have been written into a CRM field, or pushed into a live email
campaign as a "lead". **It would be better fixed at the API**, which should return an
error status rather than a successful-looking result.

## 2. The Instagram operation — handled, not resolved

| Source | Says |
| --- | --- |
| `openapi.json` / `openapi.yaml` | `instagram_lookup` |
| `api-documentation.html` | `instagram_profile_to_instagram_info` |
| `app.html`, `mcp-server/`, `workers/` | no Instagram support at all |

Each name appears in exactly one place, and LinkFinder's MCP server exposes no
Instagram tool, so there was nothing to test it with.

Rather than guess, **every JavaScript wrapper sends `instagram_lookup` and retries
`instagram_profile_to_instagram_info` once if the API rejects the first as unknown**
(`altType` in the catalog). Instagram works whichever name is right, at the cost of one
wasted request the first time if the spec is wrong.

**To close it properly:** `POST /` with `{"type":"instagram_lookup","input_data":"@nasa"}`.
Whichever is wrong, fix that source and drop the `altType` from `overlay.json`.

Make is the exception — its modules are declarative JSON and cannot retry, so they send
the spec's name only.

## 3. Two operations still unexercised

`b2b_data_lookup` is in the spec and in `mcp-server/src/client.ts`, so it is real, but
was not called. `company_name_to_employees` and `lead_full_name_to_email` are in the
spec and `app.html` but have no MCP tool, so they were not called either.

**To close:** one call each.

## 4. Cost claims that disagree

`app.html`'s `creditCosts` and `openapi.json` agree with each other, and
`api-documentation.html` has been corrected to match. One inconsistency is left:
**LinkFinder's own MCP server tool descriptions** say `get_linkedin_company_info` and
`get_linkedin_profile_info` cost 1 credit; the spec says 6 and 10.

**To close:** fix the tool descriptions in `mcp-server/src/server.ts`.

## 5. Destination adapters, other than Instantly

Instantly's field names are confirmed against its endpoint spec (its campaign field is
sent as `campaign`, which its own tooling calls `campaign_id` — the one thing to watch).
The other eleven are written from published documentation, not live calls. The tests pin
the exact request each builds, but cannot check that the vendor accepts it.

**To close:** run one lead through each. **Salesforge** and **EmailBison** have the
least stable documentation, and EmailBison is self-hosted so paths vary per deployment.

## 6. Make's IML has not been run in Make

`repeat`, `condition` and `temp` follow Make's documented semantics but the app has not
been imported into Make's editor. Import it and run each module once before submitting.

## 7. Before submitting to a marketplace

Zapier and Make both review sample output against real responses. Four of the five
result families now come from live calls; `linkedin_post_to_reactions` does not.
**To close:** call it once and reconcile `overlay.json`.
