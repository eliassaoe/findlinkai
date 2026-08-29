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

## 1. The API can report a provider failure as a success ⚠️

`leads_finder_ai` has been withdrawn from the product, so the specific outage that
surfaced this is gone. **The underlying problem is not**, and it is the one worth
keeping on this list.

A live call returned **HTTP 200, `"status": "success"`** — with this as the result:

```json
{ "result": [ { "error": {
    "message": "403 — \"error\": { \"type\": \"full-permission-actor-not-approved\",
      \"message\": \"This Actor requires full access to your account. You must approve
      its permissions before running it\" }",
    "status": 403 } } ] }
```

An upstream provider had refused the request, and the API passed that refusal through
as a successful-looking result. Any consumer reading `status` treats an error object as
data: a stack trace written into a CRM field, or pushed into a live email campaign as a
"lead".

Every integration here checks for that envelope and raises instead. **It would be
better fixed at the API**, which should return an error status rather than a
successful-looking result — and nothing about the failure was specific to the
withdrawn operation, so it can happen again on any lookup with an upstream dependency.

## 2. The Instagram operation — handled, not resolved

| Source | Says |
| --- | --- |
| `openapi.json` / `openapi.yaml` | `instagram_lookup` |
| `api-documentation.html` | `instagram_profile_to_instagram_info` |
| `app.html`, `mcp-server/`, `workers/` | no Instagram support at all |

Each name appears in exactly one place, and LinkFinder's MCP server exposes no
Instagram tool, so there was nothing to test it with. (The node's previous value is not
a tiebreaker: `n8n-nodes-linkfinderai` has never been published to npm, so that code
was never exercised against the live API either.)

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
The other eleven are written from published documentation, not live calls. The tests now
pin the exact request each builds — until 2026-08-28 that was claimed but not true: eight
of the twelve adapters had never had `addLead` executed by anything, so a wrong field name
would have shipped green. `outreach/test/destinations.test.mjs` covers all twelve and
fails on any that never reaches `fetch`. It still cannot check that the vendor accepts
the shape.

**Update, 2026-08-29:** all twelve reconciled against each vendor's current published
reference (still not a live call — this build environment has no network access to any
of them). Three were wrong and are now fixed:

- **lemlist** was calling a v1-shaped path (`/leads/{email}`, email in the URL) that
  the current API does not document; it is now `/leads` with `email` in the body.
- **JustCall** was posting to `/v2.1/contacts`, which does not exist; the real path is
  `/v2.1/sales_dialer/contacts`.
- **EmailBison** was sending raw lead data straight to the campaign-attach endpoint,
  which only accepts lead ids; it is now two calls — create the lead, then attach its
  id.

**To close properly:** run one lead through each destination for a live confirmation.
**Salesforge** and **EmailBison** have the least stable documentation, and EmailBison
is self-hosted so paths vary per deployment — those two deserve that live check before
Instantly and the rest.

## 6. Make's IML has not been run in Make

`repeat`, `condition` and `temp` follow Make's documented semantics but the app has not
been imported into Make's editor. Import it and run each module once before submitting.

The two name lookups now add an expression to that list. Make has nowhere to run code in
a module's request, so the four fields are joined with `trim`, `if` and string
concatenation:

```
{{trim(if(parameters.name, parameters.name, "")
     + if(parameters.company, " " + parameters.company, "")
     + if(parameters.location, " " + parameters.location, "")
     + if(parameters.job_title, " " + parameters.job_title, ""))}}
```

Those three are the same primitives the polling steps already use, so it should hold —
but **check the built input in Make's editor with two of the four fields blank** when you
import. A wrong expression here does not error; it sends a narrower lookup, which still
returns *a* result, just more often the wrong person, at the same price.

**Make also cannot flip "Doe, John" into "John Doe"** — there is no regex in IML. Every
other platform does it in code. The name field's help asks for "First Last" instead, and
`make/build.mjs` fails the build if the catalog's wording changes out from under that
rewrite, so the claim cannot come back by accident.

## 7. Before submitting to a marketplace

Zapier and Make both review sample output against real responses. Four of the five
result families now come from live calls; `linkedin_post_to_reactions` does not.
**To close:** call it once and reconcile `overlay.json`.
