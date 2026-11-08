# Find rate: what a lookup actually returns (Nov 2026)

Source: Supabase `enrichment_history`. "Found" means a non-empty `result`, a
profile with a `name`, or an employee row with a `name`. Measured 7 Nov 2026.

## The headline

The product works for people who pay and mostly fails for people deciding
whether to pay.

| Lookup | Subscribers (120 d) | Free signed-up accounts | A free account's **first** lookup |
| --- | --- | --- | --- |
| LinkedIn profile → email | **87–89%** | 51% | **40%** |
| LinkedIn profile → phone | **83%** | 19% | **24%** |
| Name + domain → email | **1.4%** | ~10% | 0% (n=3) |
| Name + company → LinkedIn URL | 77% | — | — |
| Email → LinkedIn URL | 63% | 56–96% | 56% |
| LinkedIn profile → full profile | 99.7% | — | — |

A new user's first email search comes back empty 6 times in 10, and the
first phone search 3 times in 4. They don't conclude "this person isn't
covered"; they conclude "the tool doesn't work".

Input format is **not** the cause. Misses are clean `linkedin.com/in/` URLs,
mostly non-US (`in.`, `mx.`, `au.`) and junior profiles. It is provider
coverage.

## Misses are charged, and the app doesn't say so

Comparing balances with history: a missed profile → email costs **2.5
credits** server-side (25% of 10). The app deducts nothing on a miss
client-side, so the balance shown drifts until the next refresh.

## Employee search — fixed 7 Nov 2026 (was broken 19 Oct – 7 Nov)

**Why it broke:** n8n called `build_matrix/company-employees-scraper`. Since
19 Oct it needs "full access" to the Apify account; without that it wrote one
promo row ("❤️ We improve the Actor everyday…") and nothing else. The braveleads
fallback behind it was broken too (it now refuses `maxResults` < 100, and its
seniority/department values had changed), so every lookup returned blank rows,
and the refund counted the blank rows as found (0.5 credit each).

**Now (n8n "linkfinder ai app v 4", published 7 Nov):** a waterfall.
1. `b2bsearch/company-employees` — domain in; name, title, LinkedIn, work email,
   sometimes phone. Low-signal (fake) profiles excluded. Tested: aak.com 100
   people, 84 with an email (63 @aak.com); 3tech.net 69 people.
2. If it finds nobody → `braveleads` (Apollo-style), input fixed, trimmed to the
   paid limit.
3. Still nobody → full refund (tested with a made-up domain).

New nodes: `Employees: normalize b2bsearch`, `…1`, `…2` (map b2bsearch rows to
the old snake_case shape so nothing downstream changed; one company label per
list). Changed: `Code in JavaScript13/14/17/18`, `HTTP Request20/35/39`,
`Code55/57`, `Precheck Credits1`, `Refund Calc (Not Found)24/25/26/28`, `Code98`.
Rollback: n8n version history, the version before "Employees: b2bsearch first…".

**Price: 2 credits per employee (was 0.5),** owner's call 7 Nov. b2bsearch with
contacts costs ~$0.0072 per person; 0.5 credit was under cost on every plan.
Changed in n8n (precheck, refunds, Code98), `app.html`, the employee tool pages,
`openapi.json`, the integrations catalog (rebuilt), the MCP server text.
The live Google Sheets add-on in Drive still says 0.5 until it is re-pushed.

**Found while testing:** API/MCP calls send no `output_type`, so `Precheck
Credits1` billed an employee list as one flat 1-credit lookup and ignored
`employee_count` (100 people for 1 credit). Fixed and published 8 Nov:
`Precheck Credits1` derives `employees` from a `*_to_employees` type. Checked
through the MCP: 3tech.net with employee_count 3 returned 3 people.

The app also still treats blank rows as a miss (`lfRealEmployees`).

## Shipped 7 Nov 2026 (app.html)

- **Name → email goes through LinkedIn.** The smart-start box and a one-click
  rescue on a name → email miss run name + company → LinkedIn URL (77%), then
  LinkedIn URL → email (50–88%). The cost is shown as "up to 11 credits".
  Mechanism: `lfChain` + `lfContinueChain()` after a successful lookup.
- **Every miss offers the next best search** (`missRescueHTML`):
  - phone miss → "Get their work email instead";
  - email miss → "Get their full profile instead" (99.7% found).
- **Blank employee rows count as a miss.**

Events: `miss_rescue_clicked` {kind, from}, `miss_rescue_chained`.
`tests/find-rate.test.mjs` pins all three.

## The bigger levers (owner decisions: n8n / provider / money)

1. **Waterfall on the server.** On a miss, try a second email provider before
   answering. This is the only thing that moves the 40% first-lookup number
   for everyone, including the API and CSV. It costs a second provider fee
   per miss.
2. **Don't charge misses, or say so.** Either refund the 2.5 credits or put
   "misses cost 2.5 credits" on the result. A silent charge on an empty result
   is the worst of both.
3. **Fix the employee scraper in n8n.**
4. **Name → email in the API and CSV.** Route `lead_full_name_to_email`
   through LinkedIn server-side too. Today only the app does it.

## Name → LinkedIn URL, looked at closely (7 Nov 2026)

"Found" was 69–77%, but the right number is lower:

| Input | Who | Found | Last name in the returned URL |
| --- | --- | --- | --- |
| name + company (3–6 words) | subscribers | 79–83% | 75–77% |
| name + company (4–7 words) | free accounts | 15–35% | ~30% |
| name only | free accounts | 66% | **38%**: about half are the wrong person |
| name only | subscribers | 8% | 1% |

**Legal suffixes looked like the cause and aren't.** Over 150 days, inputs with
Inc/LLC/GmbH/Corp found 40% against 67% without, and country codes 23% against
56%. Re-running 9 past misses on the live API, with the raw company and then
with the cleaned company, gave 3/9 both ways (different people). The raw "Katie
Jones" hit was probably the wrong profile. The suffix tracks *who* is being
searched (long-tail US mid-market and non-US firms from CSV lists), not the
search failing. The app now strips suffixes and country codes anyway
(`lfSearchCompany`, single lookups only: the CSV input must stay byte-identical to the server runner, see `tests/csv-export-parity.test.mjs`), because it costs nothing, but **don't
quote it as a lift**.

**The real ceiling.** Web searches for the 6 people who missed both ways found
no public LinkedIn profile for any of them. The lookup is one Serper query,
`<input> site:linkedin.com/in`, accepting only `organic[0]`. A profile Google
hasn't indexed can't be found that way, however clean the query.

What would move it, in order:
1. **Deploy `workers/enrich-name-to-linkedin`** (written, tested, never
   switched on). It scores the top 10 results instead of the first, rejects
   non-profile URLs, handles accents and middle names, and doesn't charge
   input with no name. It recovers people Google *does* know about.
2. **A second source on a miss.** A people database queried by name +
   company, or by name + company domain. This is the only fix for people
   Google doesn't index. It costs a provider fee per miss.
3. **Name only should ask for the company.** Without one, half the "hits" are
   the wrong person, which is worse than a blank because they email the wrong
   person. The app already requires a company; the free tool page and the API
   don't.

## 7 Nov 2026, later: #2 and #3 decided

- **#3 (company required).** Already enforced on the free tool page
  (`linkedin-url-finder.html`) and in the app, both the single form and the
  CSV mapper (`lfCompanyRequired`). The leftover name-only traffic was CSVs from
  June–Sept with the wrong column mapped (emails, URLs and company names in the
  name column, about 1% found) and 13 rows in October. The API is the
  remaining gap: the worker now refuses a name without a company (422, free).
- **#2 (second source).** Filtrat has no name → LinkedIn endpoint. Its API
  covers `POST /v1/finder/search` (first + last + domain → email, about
  $0.01 per email found, nothing when not found), verification and domain
  lookups. So the second source for name → LinkedIn is two more Google passes
  in the worker. **Filtrat fits name → email instead**, today's worst lookup
  (1–15%).
- **None of this is live until the worker is deployed** and the n8n branch
  routes to it (README in `workers/enrich-name-to-linkedin/`).

## 7 Nov 2026: LinkedIn people search (Apify) as the second source

Google can't return a profile it hasn't indexed. LinkedIn's own people search
(Apify `harvestapi/linkedin-profile-search-by-name`, about $0.004 a search,
about 4 s) has no such gap. Tested on the 6 people every Google query missed:

| Person (company searched) | LinkedIn search |
| --- | --- |
| Alicia Carrasco (Turning Point Brands) | found, headline names the company |
| Alicia Waineo (ANA, Inc.) | found, headline names the company |
| Brent Hanston (A. Duda & Sons) | one result, CFO elsewhere: probably him after a job change |
| Hendrik Stel (Agro-K, Minneapolis) | Minneapolis accountant: probably him |
| Pierce Pondi | nothing |
| Katie Jones (JM Family) | 10 strangers; with the company filter, 1 JM Family Katie with another surname |

The worker calls it last, only on a miss, and accepts a row only when the
headline names the company. That keeps precision over recall: the two
"probable" job-changers are rejected. Cost at today's volume is about
$10–15/month. Enabled by the `APIFY_TOKEN` secret.

A later improvement for common names: resolve the company's LinkedIn URL
(company_name → linkedin_url, 1 credit, 84%) and pass it as
`currentCompanies`. Not done yet: it doubles the calls on the hardest rows.

## Company name → LinkedIn company page (7 Nov 2026)

77% "found" (4,700 runs in 150 days), but the n8n branch takes Google's first
result unchecked. About 3% of all results are another company (Krause Rail →
SRS Rail, Nihon Yamamura Glass → San Miguel Yamamura Australasia). A domain
typed as the company finds 2.9%, against 85% for a plain name. Legal suffixes
barely matter here (82% against 85%).

Stripping suffixes in the Google query is double-edged: it found MZA Makas
Fabrikası (correct) but also returned an Indian Meta-Tronix for an Italian
Metatronix Srl. So the fix is checking the match, not rewriting the query.
`workers/enrich-company-to-linkedin`: checks the Google top 10 by name, rejects
legal forms from two different countries, searches domains as domains, and
falls back to LinkedIn company search (Apify, ~$0.003). On 10 of the hardest
names, LinkedIn company search found 3, all right, 2 of them never found by
Google, and guessed none. Rollout prompt: `N8N-SETUP-PROMPT.md` in that folder.

## 7 Nov 2026, evening: shipped in n8n, not in the workers

The owner asked for the n8n workflows to be changed directly, so the rescue
logic went into **linkfinder ai app v 4** and **Linkfinderai free tools** as
added nodes, live and published, additive only. See
`workers/n8n-linkedin-rescue/README.md`. The two Cloudflare workers
(`enrich-name-to-linkedin`, `enrich-company-to-linkedin`) are **not
deployed** and not needed for this; keep them as reference.


## Company LinkedIn data misses were wrong URLs (8 Nov 2026)

`linkedin_company_to_linkedin_info` showed 11% found over 30 days, but every
miss was a person's `/in/` URL pasted into the company search; real company
pages all came back. `app.html` now switches the search as soon as the URL is
recognised (`lfLinkedInUrlKind`, `lfAutoSwitchLinkedInKind`): person URL in
company data → person profile data (10 credits), company URL in person data →
company data (6). If it only notices at submit, it switches and asks for a
second click, because the price changed. PostHog: `linkedin_kind_autoswitched`.


## Email backups in n8n (8 Nov 2026)

Both email lookups already run Filtrat. A backup actor now runs only after every
existing step missed, and a backup hit is charged like any other hit (misses are
still refunded by the existing refund path).

**LinkedIn → email** (`linkedin_profile_to_email`): anchor actor → Filtrat
`linkedin-search` → **new:** `harvestapi/linkedin-profile-scraper` with email
search ($0.01 a profile). Keeps `status: valid`, not catch-all, not a free
mailbox. Nodes: `LPE backup: LinkedIn profile + email (Apify)`, `… pick valid
email`, `… found?` (between `If48` false and `Respond to Webhook55`; a hit goes
to `Respond to Webhook60`).
- Offline test on 14 misses from the last 3 weeks: 3 valid emails (+2 catch-all
  "risky", not kept).
- Live 8 Nov: 4 of those misses re-run. Filtrat itself now found 2
  (camilla-capasso, bandaradnan), the backup found mario-skoric@allianz.com,
  and one miss was refunded after the backup ran. So Filtrat is helping now;
  the backup catches part of what is left.

**Name + domain → email** (`lead_full_name_to_email`): Filtrat finder → pattern
guess + Filtrat verify → **new:** `clearpath/email-finder-api` (patterns checked
by SMTP, ~$0.008 a pattern, `optimized` = up to 4). Keeps `validationStatus:
safe` only, no catch-all. Nodes: `Name email backup: pattern + SMTP (Apify)`,
`… pick safe email`, `… found?` (between `If Verified Personal Email Found
[FullName]1` false and `Wait1`; a hit goes to `Respond Verified Personal Email
[FullName]1`).
- Offline test on 12 people: 9 found; among real October misses it found
  marco.ligabue@01s.it and g.ottati@qcore.it.
- Not tested live: the MCP has no name → email tool. Re-check in
  `enrichment_history` after the next real lookups.
- The 16% in October was mostly one CSV with wrong inputs (French Viatris staff
  with `viatris.it`, `linkedin.com` as the domain, company names instead of
  domains). No provider fixes that; the app could warn on a domain like
  `linkedin.com` or a value with no dot.

Rejected: `snipercoder/email-finder-by-name-and-domain` (it says it solves
Cloudflare captchas on another site), `bovi/email-finder` (12 lookups were still
running after 3 minutes).
Rollback: n8n version history, the version before "Email backups: harvestapi
after LinkedIn->email miss, clearpath after name->email miss".

## LinkedIn → email accuracy test, 100 people (8 Nov 2026)

Live lookups through the MCP (the real n8n pipeline: anchor → Filtrat → harvestapi).
Known answers came from `b2bsearch/company-employees` (46 people at HubSpot,
Allianz, Freshworks, Zendesk, current-employer work emails) and 54 AAK staff
whose @aak.com email was known. Where our answer was at another company, the
person's current LinkedIn headline was checked (harvestapi, short mode).

| Outcome | Count |
| --- | --- |
| Email returned | **87 / 100** |
| Exactly the known email | 62 |
| Known to be right (person moved; we returned the new employer's email: Atlassian, SmartBear, Esker, MongoDB, Arborea) | 5 |
| Probably right: same company, other address form (`kevin.devine@` vs `kd@aak.com`, `milica.ilic@` vs `ilic.milica@allianz.com`…) or a plausible new job (Veeam, CarGurus, wati.io) | 13 |
| Doubtful: initials only at a big catch-all company (`aa@allianz.com`, `rh@allianz.com`) | 2 |
| **Wrong**: `jason@ov.beer` for Zendesk's CTO, `lucas@bnpparibas.com` and `jason@bnpparibas.com` for AAK staff, `rodrigo.guardini@aak.com` for Rodrigo Miyake | 4 |
| Personal mailbox returned (`…@aol.com`) | 1 |
| Nothing found (refunded) | 13 |

So of 87 answers: 67 confirmed right (77%), ~80 right or very likely right
(~92%), 4 wrong (5%), 3 doubtful.

Not yet known: which step produced the 4 wrong ones (Chrome disconnected before
the n8n executions could be read). Cheap guard to add whichever step it is: reject
an email whose local part contains neither the first nor the last name (nor the
initials) of the profile's name, and never return a free mailbox (aol/gmail…).
Async note: under parallel load the API answered 14 of the 100 with a job_id
whose result never arrived (still "processing" after 5+ minutes, then expired);
re-running them one by one worked. Worth checking the async path in the API worker.

## Company name → LinkedIn page (checked 8 Nov 2026)

**How it works** (app v4, `company_name_to_linkedin_url`): Serper Google search
`"<name> site:linkedin.com/company"` (`HTTP Request6`) → scorer
`Code in JavaScript9` picks a page → if "Not found", the Apify
`harvestapi/linkedin-company` search rescue (`Co rescue: …`) → refund on a miss.

**Live test, 26 companies:** every well-known name right (Microsoft, Tesla →
`tesla-motors`, Salesforce, Doctolib, Qonto, Lemlist, Notion → `notionhq`, Mistral
AI, Back Market, Pennylane SAS → `pennylaneaccounting`, Siemens Healthineers GmbH,
Meta, Spendesk, Société Générale, Škoda Auto, Hermès, Ledger → `ledgerhq`,
Captain Data, Lemon Learning). Problems found:

| Input | Got | Why |
| --- | --- | --- |
| La Fourche | `lafourche-parish-government` | **Fixed.** Six results tied at 6.5 and the tie went to Google's order; the real `lafourche` (16.9K followers) was 6th |
| Zöllner Signal GmbH | `zollner-uk-ltd` | Partial-name match accepted; still open |
| Waalaxy | not found | Its page is not in Google's `site:` results, and the Apify search returns nothing for it either |

**The fix (published 8 Nov, n8n version history has the previous code):** in
the scorer's sort, equal scores now go to the page whose LinkedIn **title** is
exactly the company name, then — only among those — the bigger page (follower
count Google shows), then Google's order. A title is not "exact" when its legal
form is from another country than the input's (`Inc.` vs `Private Limited`).
Replayed on all 136 company lookups still in n8n's history (~4 hours kept): only
La Fourche changed, find count identical (73/136). An earlier version that used
followers for every tie moved 5 other picks, 2 of them for the worse — that is
why followers only break ties between exact titles.

**Why it "struggles" today:** most of the day's 217 company lookups were one list
of **investment-fund legal entities** ("Cyrus Opportunities Master Fund II,
Ltd.", "LifeSci Venture SPV 18, LLC", "Imperial Diversification Fund L.P.").
Those vehicles almost never have their own LinkedIn page. Google found 73 of 136;
the rescue ran 63 times, got pages back 10 times and accepted 5. That is the input,
not a broken lookup. If funds are a real use case, the honest option is a
separate "find the fund manager's page" step, which returns a different entity
and must say so.

## API / MCP lookups that took over ~25 s never returned (fixed 8 Nov 2026)

The API waits about 25 s for n8n, then hands the caller a `job_id` and waits for
n8n to POST the result to `callback_url`. In app v4, the LinkedIn → email endings
added this week — the Apify backup's found (`Respond to Webhook60`) and not-found
(`Respond to Webhook55`), and the Filtrat hit (`Respond to Webhook75`) — answered
the webhook but never called back. The backup takes 30–40 s, so for API and MCP
users its finds were always lost and the job stayed "processing" forever.

Fix (published): after each of those three, `Callback? · …` (copy of
`If callback (not found)1`) → `Callback · …` (copy of `HTTP Request52`, same URL
and secret header, body `{http_status: 200, data: {result}}`). Checked live: the
9 lookups that had hung now return, and two backup finds (glenn@av.vc,
grace.beverley@wearetala.com) came back through the callback.

**Rule:** any new ending in app v4 needs both a Respond node and the callback
pair, or it works in the app and silently fails on the API and the connector.

**Rerun in progress:** the LinkedIn → email inputs from the last 30 days are
being re-run on the current pipeline (89 of 120 done; results kept outside the
repo). Phone is not re-run until it changes.
