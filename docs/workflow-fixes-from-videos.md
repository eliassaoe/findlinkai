# Workflow fixes found while filming (video factory)

Owner rule (13 Nov 2026): every wrong result met while making a video is fixed in
the n8n workflow, so the videos double as product testing. Log each fix here.

## 13 Nov 2026 — app v4 (`LntSghdJrXAAFYmr`), saved as draft, **owner must publish**

Seven nodes changed, connections untouched (checked against the active version).

| Lookup | Wrong result seen | Cause | Fix (node) |
| --- | --- | --- | --- |
| `company_name_to_phone` | Salesforce → +49 (Germany), Microsoft / Atlassian → +61 (Australia), Stripe → +33 | `site:domain` search returns country pages first (`/de/`, `au.`) and the first number found wins | `Extract Phone (Domain-Scoped) [Phone]1`: results on a country/language page (2-letter subdomain, or `/xx/`, `/xx-yy/` path other than `en`/`en-us`) are only used if nothing else has a number |
| `company_name_to_email` (and the email inside company info) | `dustin.birashk@mossadams.com`, `privacyoffice@rsmus.com`, `usrecruiting@gt.com` | sorting put free-mail addresses FIRST, then shortest; nothing preferred a company inbox | `Extract Email (Domain-Scoped) [Email]1`, `Code40`, `Code53`: rank = role inbox (info, contact, sales, hello, support…) first; privacy / recruiting / IR / billing / admin later; first.last personal addresses after that; free-mail last |
| `linkedin_company_to_employee_count` | HubSpot → "2-10" | Serper query asked for **page 5** and the code took the first number in **any** LinkedIn page | `HTTP Request56`: `"<slug>" employees site:linkedin.com/company`, page 1. `Code19`: only results on the input company's own page; "N employees" / "Company size" wording first; nothing found → empty → refund path |
| `linkedin_company_to_linkedin_info` | Microsoft city = Bratislava, range "10001-null" | HQ flag read as `isHq`; the actor returns `headquarter: true` | `Code in JavaScript12`: `headquarter === true` (or `isHq`), open range shown as `10001+` |

Not fixed yet (seen, needs a decision or more data):
- Company phone still uses the first number on the page; hotel chains returned
  call-centre numbers from Asia. A "country of the company" input would solve it.
- `company_name_to_website` returned `casper.ca`, `ca.abbott`, `colorado.permanente.org`,
  `modernadirect.com` for big brands: same country/sub-site problem as phones.
- `lead_full_name_to_linkedin_url` found nobody for Tobi Lutke (Shopify) and
  Whitney Wolfe Herd (Bumble).
- 13 Nov (shorts batch): `lead_full_name_to_linkedin_url` "Mark Cuban" + "Cost Plus Drugs"
  → `linkedin.com/in/jonhorbaly` — **a different person**, returned as success. Worse
  than a miss: the user pays and gets a wrong profile. Needs a name check on the
  result (slug or title must contain the surname) before returning it.
- 13 Nov: `company_name_to_employee_count` (MCP `find_company_employee_count`) →
  **500 "Workflow execution failed"** for Netflix and OpenAI; Tesla and Nvidia
  returned only the LinkedIn range "10001+". Not filmable as a "how many employees"
  short until it returns a number. Look at the n8n execution log for those two inputs.
- 13 Nov: `linkedin_profile_to_linkedin_info` — `jobTitle` and `company` come from
  different experiences: Reid Hoffman → title "Member, World Economy Advisory Board"
  (Semafor) with company "Manas AI". Satya Nadella → `isCurrentlyEmployed: "false"`
  while his Microsoft "Chairman and CEO" role has `jobStillWorking: true`. Both
  should be derived from the same current experience (latest `jobStillWorking`).

Check after publishing: re-run Salesforce phone, HubSpot employee count
(`https://www.linkedin.com/company/hubspot/`), Microsoft company info, Moss Adams email.
