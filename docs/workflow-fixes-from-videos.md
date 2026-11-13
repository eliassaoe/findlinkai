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
- 13 Nov: `company_name_to_phone` "RPM Living" → `+1 718 555 55 55`, a fake 555
  placeholder number returned as success. Reject numbers whose exchange is 555
  (and other obvious placeholders) in `Extract Phone (Domain-Scoped) [Phone]1`.
- 13 Nov: `linkedin_profile_to_linkedin_info` — `jobTitle` and `company` come from
  different experiences: Reid Hoffman → title "Member, World Economy Advisory Board"
  (Semafor) with company "Manas AI". Satya Nadella → `isCurrentlyEmployed: "false"`
  while his Microsoft "Chairman and CEO" role has `jobStillWorking: true`. Both
  should be derived from the same current experience (latest `jobStillWorking`).

Check after publishing: re-run Salesforce phone, HubSpot employee count
(`https://www.linkedin.com/company/hubspot/`), Microsoft company info, Moss Adams email.


## 13 Nov 2026 — 1,280 API lookups for the 360-video plan

`video_factory/data/lookups.json` (40 industries × 8 well-known US companies ×
website / phone / LinkedIn page / contact email, through the public API).
`video_factory/tools/gen360.py` checks every value before it is filmed;
**151 of 1,280 (11.8%) failed** — list with reasons in
`video_factory/data/rejected.json`. Grouped:

| Lookup | Failures | What comes back |
| --- | --- | --- |
| company email | 38 wrong inbox | `privacy@`, `legal@`, `ir@`, `press@`, `admin@`, `billingsupport@`, and garbage like `amgen@careers.pure`, `contact@anchorage.compress` |
| company email | 19 other domain | `sunnovasupport@goodleap.com`, `freedomforever@interdependence.com` (a vendor's / partner's domain) |
| company email | 11 named person | `brad.curry@benfranklinplumbing.com`, `john.smith@erickson.com` |
| company phone | 19 non-US, 8 malformed | Crowe `216 71 236`, BDO `+632) 8840-7000`, CrowdStrike `+44…`, Clark Construction `2000-2026` (a year range read as a phone) |
| website | 12 country site, 7 wrong company, 18 empty | `chipotle.ca`, `planetfitness.ca`, `webfx.co.uk`; Root Insurance → `autoinsurance.com`, Barry's → `barry.edu` |
| LinkedIn page | 5 wrong page | Skanska USA → `skansa-usa`, a franchise office page for Express Employment |

The phone and email ranking fixes are in the app v4 draft (not yet published,
see the table above). Re-run `video-data.yml` after publishing and compare.
Still missing in n8n: (1) reject a phone that is not 10 digits for a US
company, or whose country code differs from the company's HQ; (2) reject a
website whose domain does not carry the company name; (3) never return a named
person's address as the "company email"; (4) parse the email domain strictly
(`.compress`, `.pure` are scraping artefacts).

### Fixes saved 13 Nov 11:00 (draft 65ed0f17 — active is still e754fb7d until the owner publishes)

| Node(s) | Change |
| --- | --- |
| `Code in JavaScript19`, `Code in JavaScript4b (Fallback Score)1` (company website), `Extract Best Domain [Phone]1`, `Extract Best Domain [Email]1` | With 2+ name words the first one must be in the domain (Root Insurance no longer gets autoinsurance.com); country sites ×0.8 (chipotle.com beats chipotle.ca, us.sunpower.com loses to sunpower.com); `.edu` only for schools (Barry's no longer barry.edu) |
| `Extract Phone (Domain-Scoped) [Phone]1` | Drops 555 placeholders, year ranges (`2000-2026`), `+1` numbers with extra digits, unbalanced `+632)` fragments |
| `Extract Email (Domain-Scoped) [Email]1`, `Code40`, `Code53` | A company email is never a named person, a privacy/legal/IR/careers/billing/admin inbox, or a bad TLD (`.pure`, `.compress`); nothing left → not found → refund |

Not changed, owner's call: the name → LinkedIn original step (`HTTP Request64` → `If35`) still
returns whatever the first search hit is (Mark Cuban → jonhorbaly). A surname check there would
fix it but touches the step the owner chose to leave alone.

### 13 Nov ~12:10 UTC: the API answers 500 "text is not defined" to every company lookup

Found by the video-data runs: from about 12:10 UTC, `company_name_to_website`, `_phone`,
`_email` and `_linkedin_url` all return
`500 {"error":"Internal server error","message":"text is not defined"}` through the public
API (and the LinkFinder MCP; checked 15:45 on Poshmark). A JavaScript ReferenceError in the
code that answers the call (API worker or an n8n Code node). Not visible from a Claude session
(no browser, no Cloudflare connector), owner told 15:45. 840 lookups for 28 industries wait
on it; `run_lookups.py` now stops after 8 failures in a row instead of sleeping through the
job's timeout, and the commit step merges rows instead of losing them to a push race.

#### Root cause found 13 Nov 19:10 Paris: two problems stacked

1. **API worker bug (Cloudflare `linkedfinderapiaccess`, unchanged since 18 Aug).** When n8n
   answers 401 or 403, the worker logs `Upstream body: text.slice(0, 500)`, but `text` only
   exists inside the `try` above it. The log line throws, and the customer gets
   `500 {"message":"text is not defined"}` instead of the real 401/403. So **every bad,
   revoked or out-of-credit key has received a 500 since August**. `tools/api_smoke.py`
   proves it: a wrong key gets 500, while a missing key gets a clean 401.
   Fix, one token: in that `console.error`, replace `text.slice(0, 500)` with
   `JSON.stringify(data).slice(0, 500)`. Not deployed: a production deploy from the agent was refused,
   so the owner applies it (Cloudflare → Workers → linkedfinderapiaccess → Edit code).
2. **Since ~12:10 UTC, n8n answers 401/403 to the `LINKFINDER_API_KEY` used by the video
   factory and the LinkFinder MCP.** Its sha256 prefix is `cbdd5153d364`, and it matches no
   `token` in `linkfinderai_users` (all columns checked). So the key was rotated, or its
   account is gone, or it is out of credits. Once the worker fix is live, the API returns the
   real reason.

`.github/workflows/api-smoke.yml` runs one call per public operation plus the error cases;
run it after any change to the worker or the n8n API workflow.
