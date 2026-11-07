# Smart start: one box instead of two dropdowns

**Date:** 2026-11-07 · **Sources:** Supabase `snxhsboboatjywgwdeds`, PostHog 263837 · **Code:** `app.html`
(`#smartStart`, `smartStartClassify`, `smartStartRun`, `smartStartRoute`)

## Why

October 2026 signups (sample joined to `enrichment_history` by token, 173 accounts):

| | share |
| --- | --- |
| never ran a lookup | ~50% |
| median lookups per active user | 2 |
| ran 10+ lookups | 5 people |
| paid | 1 |

Last 30 days, all app traffic: 136 `linkedin_profile_to_email` and 48 `linkedin_profile_to_phone` lookups, against
~3,000 cheap 1-credit lookups (company → LinkedIn, email → LinkedIn). The product people pay for is the email and
phone result; almost nobody reached it.

The landing view asked for two decisions before any result: a route chooser ("where is your data?") and then the
"I have / I want to find" pair of dropdowns (7 inputs × up to 4 outputs). Three of the four quick-start cards do not
auto-run, they ask for a LinkedIn URL the person may not have open.

## What changed

1. **`#smartStart`, first thing on the enrichment page.** One input: paste a LinkedIn profile URL, an email, a name or
   a company. `smartStartClassify()` picks the pair; the button label and a one-line hint follow what was pasted
   (with the credit cost). Then `quickStart()` runs it, so the lookup, the credit deduction, the result and the
   next-step panel are exactly the existing code.

   | pasted | pair | auto-run |
   | --- | --- | --- |
   | `linkedin.com/in/…` | profile → **email** (alt: phone, full profile) | yes |
   | `linkedin.com/company/…` | company page → data (alt: employee count) | yes |
   | `linkedin.com/posts|feed/…` | post → reactions | yes |
   | `x@y.z` | email → LinkedIn URL | yes |
   | `stripe.com` | domain → employees | no (shows the form) |
   | two+ words | full name → **email** (alt: LinkedIn URL) | no (company field focused) |
   | one word | company → website (alt: LinkedIn, phone, email) | yes |

   A LinkedIn URL defaults to the **email**, not the profile data: that is the result people pay for.
2. **Credits line**: "You have N credits, enough for about N/10 work emails."
3. **List routes in the same box** (CSV, Google Sheets, API / n8n, HubSpot) via `pickRoute(route, 'smart_start')`.
4. **The big first-visit route chooser no longer shows** under the box (same four routes, one line). `?intent=` and
   `?route_test=1` still work; `maybeShowRouteChooser` returns early when `#smartStart` exists.
5. **`confirmation-signup.html`: new `signup_google_result` {success, error}.** `signup_success` fell from ~170/week to
   ~40/week from the week of 20 Sep 2026 while `signup_google_clicked` stayed ~210/week and `auth.users` kept rising
   (655 Aug, 743 Sep, 817 Oct). PostHog therefore under-counts signups by ~3/4 since then; this event shows what the
   signup worker answers.

## Events

`smart_start_used` {input_type, output_type, auto_run, override}, `smart_start_empty`, `smart_start_list_clicked`
{route}, `signup_google_result`.

## What to watch (re-check 2026-11-21)

- **Activation:** share of new accounts with ≥1 lookup in 7 days (Supabase join above). Baseline ~50% in the sample
  (PostHog said 68% single-default in Aug-Oct, on a different denominator). Target 65%+.
- **Value reached:** `linkedin_profile_to_email` + `_to_phone` lookups per 100 signups. Baseline ~17/100 (136+48 over
  ~1,100 signups in 30 days, rough). Target 2×.
- **Paid conversion** is too thin to read in two weeks (≈5 payers/month); judge on the two above.
- Guardrail: if activation drops, revert `#smartStart` (it is one block plus four functions).

## Not done, and why

- **Free grant (50 credits) vs phone (50 credits).** A free phone lookup eats the whole grant. Changing the grant needs
  `workers/signup/worker.js` **and** n8n together (`docs/credit-grant.md`); not touched here. Option to decide: give
  new accounts one free phone lookup on top of the grant.
- **Pricing modal.** Opening on Annual for everyone is a recorded decision (comment in `showPricingModal`); 41 opens →
  9 plans → 1 payment in 30 days is too few to justify flipping it without a test.
- **`enrichment_history.credits_used` is 1 on every row**, whatever the type. Balances still drop to 0 for 50-credit
  accounts, so it looks like a logging bug, not under-billing — but some 50-credit accounts show 4-7 email/phone rows.
  Check in n8n whether lookups past a zero balance return data.

## Addendum: annual default kept (owner decision, 7 Nov 2026)

The Monthly default above was reverted the same day. The owner keeps Annual as the default tab for everyone. The
120-day split (Monthly 61, Pay as you go 48, Annual 13 people picking) is left here as data, not as a pending change:
do not flip the default again without asking.

## Addendum: "Popular searches" cards removed (7 Nov 2026, owner's call)

The four quick-start cards under the box are gone; the box covers the same four lookups from whatever is pasted.
The one-line list shortcuts (`qs-list-line`, `quickStartBulk`) stay. `quickStart()` is still the function every
single lookup goes through. `tests/default-mode.test.mjs` pins the new shape.

## Addendum: the two dropdowns are replaced by a card per search (7 Nov 2026, owner's call)

`#searchPicker` ("Or pick a search") lists every pair as a card, grouped People / Companies / LinkedIn posts, with
the credit cost from `creditCosts` (e.g. `LinkedIn profile → Work email · 10 credits`). `pickSearch(input, output)`
sets the hidden `#inputType` / `#outputType` selects and fires their `change` events, so `configureEnrichment`, bulk,
saved searches and the API panel are untouched; `syncSearchPicker()` highlights the card whatever set the selects.
The `.form-grid` with the selects is kept in the DOM with `display:none`. New event: `search_picked`
{input_type, output_type, mode}. Also fixed: a pasted name going to email now fills first / last name
(`#leadFirstName`, `#leadLastName`) and focuses the domain field. `tests/smart-start.test.mjs` pins the picker.

Same day: the picker is grouped **by what the person wants to find** (Find an email / phone / LinkedIn profile / Get
company data / Get profile data), each card naming the starting input, instead of grouping by input type.

## Addendum, 7 Nov 2026: the box itself got clearer

The owner said the "paste what you have" box could be better. It was one button
plus small text links for the other outputs, and a name sent you down into the
form to type the company. Now:

- **Empty box shows example chips** (LinkedIn profile, name, email, company).
  A click fills the box and shows the choices; it does not run or spend credits.
- **What was pasted is named** ("LinkedIn profile detected").
- **Every possible result is a button with its credit cost** — e.g. for a
  LinkedIn URL: *Find work email · 10*, *Find phone number · 50*, *Get full
  profile · 10*. The first is the default and is what Enter runs. Costs are read
  from `creditCosts`, never typed in.
- **A name asks for the company in the box** and runs from there: first/last
  name go to `#leadFirstName`/`#leadLastName`, the company (stripped to a domain)
  to `#leadDomain` for the email, or to `#leadCompany` for the LinkedIn URL.
  Without a company it refuses to run and highlights the field.

Events: `smart_start_used` now carries `override` (true when a non-default button
was clicked); new `smart_start_example_clicked` and `smart_start_empty`.
`tests/smart-start.test.mjs` checks every offered choice exists in `creditCosts`.
