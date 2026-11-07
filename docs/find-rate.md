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
