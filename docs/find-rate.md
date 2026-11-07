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

## Broken: employee search (since 19 Oct 2026)

`company_domain_to_employees` has returned only rows of nulls since 19 Oct
(766 rows in the week of 2 Nov). One row's `firstName` is the scraper
vendor's banner ("We improve the Actor everyday…"), so the scraper's output
format changed. The fix is in n8n and is not in this repo. Until then the app
treats blank rows as a miss (`lfRealEmployees`) instead of showing an empty
table and deducting 0.5 per blank row.

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
