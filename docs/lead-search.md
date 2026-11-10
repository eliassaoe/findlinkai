# Lead search — `/lead-search` (10 Nov 2026)

**17:10, owner's call: no Lead Search tab in the app for now.** The page and
the backend stay live but unlinked. The search starts as an *input* instead:
"no list? describe who you want" on `/liste-gratuite`, and "no URLs? search
LinkedIn" for LinkedIn profile enrichment in the app (sections below).

A separate tool next to `/app` (nav tab "Lead Search"): the user describes who
they want (search words, current job titles, cities, seniority, company size,
10/25/50/100 leads) and gets each person's full LinkedIn profile and email,
with a CSV export. Built because recruiters on calls (Atelier Du Sourcing)
wanted "développeur java à Paris" → a list, and lists are where payment comes
from (`docs/paste-a-list.md`).

This is NOT the AI lead finder removed on 23–27 Aug (`docs/lead-search-bugs.md`):
that one ran an unapproved Apify actor that 403'd for everyone. This one runs
the same vendor as the profile + email enrichment.

## Provider

`harvestapi/linkedin-profile-search` on Apify — no LinkedIn account or cookies.
Mode "Full + email search". Cost to us (Silver tier): $0.08 per search page of
25 + $0.009 per profile with email search ≈ **$0.012 per lead**.

Test on 10 Nov, "développeur java", Paris, 25 leads: 25 relevant profiles in
109 s, $0.30. 14 of 25 with an email (8 work, 6 personal gmail-type; 12 marked
valid). Personal emails matter for recruiters, so they are a separate column.

## Billing

- 15 credits per lead with an email (same as `linkedin_profile_to_profile_email`),
  5 per lead without one.
- The maximum (15 × leads asked) is reserved at start; the difference comes back
  when the run ends. A run that fails to start or to return gives everything back.
- One `enrichment_history` row per search, type `linkedin_people_search`.

## Pieces

| Piece | Where |
| --- | --- |
| Page | `lead-search.html` (noindex, out of the sitemap). Token from `?token=` or `localStorage.linkFinderToken`. |
| Server | Supabase edge function `lead-search` (`supabase/functions/lead-search/`), `verify_jwt: false`, auth = app token. Actions `start`, `status`, `list`. `map.js` is shared with the test. |
| Tables | `lead_finder_runs` (one row per search, leads stored as jsonb), `lead_finder_config` (proxy URL + secret). RLS on, no policies: service role only. |
| Apify access | The production Apify key is only in n8n (credential "apify api key"), so the function calls an n8n workflow **"LF · lead search proxy"** that checks the `x-lf-secret` header and allows three calls only: start a run of this one actor (with a `maxTotalChargeUsd` cap), read a run, read a dataset. Its URL and secret are in `lead_finder_config`, never in this repo. |
| Tests | `tests/lead-search.test.mjs` (synthetic rows only — public repo). |

A search left running when the tab closes is settled the next time the user
opens the page (`list` checks up to 3 running searches), which also returns the
unused credits.

## As an input (10 Nov 2026, evening) — the owner's scope for now

Two places, same function (`kind` in `map.js` `KINDS`), both in "Full" mode
without email search (~$0.0036 a profile + $0.10 a page of 25):

| Where | What | Cost to the user |
| --- | --- | --- |
| `/liste-gratuite`, "ou pas de liste ? décrivez qui vous cherchez" | poste/mots-clés + ville + 25/50 → action `preview` (no account) → up to 50 full profiles go straight into the page's usual run; only the email is looked up per person (`it.pre` skips the profile call). Events `fr_list_query_started/done/empty/failed` | Free. Capped at **2 searches per IP per 24 h** and **60 anonymous searches a day** in total (`PREVIEW_PER_IP_PER_DAY`, `PREVIEW_PER_DAY` in `index.ts`) |
| App, bulk card, input = LinkedIn profile: "No LinkedIn URLs? Search LinkedIn" (`#lfLiSearch`, `lfLiSearchRun`) | query + location + 25/50/100/200 → action `start` with `kind: 'urls'` → the found profiles become a CSV (`linkedin url, full name, job title, company, location`) passed to `parseCSV`, then the user runs their chosen lookup as for an uploaded file. Events `li_search_input_started/done/empty` | 1 credit per profile found (reserved up front, the rest returned); history type `linkedin_search_to_linkedin_url` |

Live, same evening: preview "chargé de recrutement", Lyon, 25 → 25 profiles
(vanity URLs, 25 with experience, 22 with a photo), 0 credits. `urls` "data
engineer", Bordeaux, 25 → 25 profiles, 25 credits. The free list page was run in
Playwright with both services mocked: 6 profiles from the search, 0 profile
calls, 6 email calls, popup shown.

## Live check, 10 Nov

Through the deployed function with an internal test account: "head of sales",
Lyon, 10 leads -> 10 leads, 10 work emails, 150 credits charged, history row
written. Two earlier starts failed (wrong proxy host) and gave the 150 credits
back. Proxy URL must be the **webhook-processor** host
(`webhook-processor-production-a61c...`), not the editor host: n8n runs in queue
mode and the editor host answers 404 for production webhooks.

## Not yet

- **Phone numbers.** Harvest returns none. Candidates and prices are in the
  "Phone providers" section below; nothing is wired.
- Company filter takes LinkedIn company URLs only (the actor's format).

## Phone providers (researched 10 Nov 2026)

Our phone lookup sells for 50 credits: ~$0.49 on Starter, ~$0.25 on
Professional, ~$0.18 on Scale. A provider that charges more than that per
number found loses money on the bigger plans.

| Provider | Price per mobile found | France | API | Notes |
| --- | --- | --- | --- | --- |
| FullEnrich | ~$0.35–0.55 (10 credits, $0.035–0.058/credit) | Strong (waterfall, French team) | Yes, Pro plan | Charged only when a mobile is found |
| Kaspr | ~€0.40 effective | Best known for FR mobiles (66% in one FR benchmark) | Basic / Business (60 req/min) | Per-licence plans, built around the Chrome extension |
| Prospeo | ~€0.09–0.21 (10 credits) | Not published | Yes | Cheapest on paper; test FR hit rate first |
| Datagma | n/a | French company | Yes (phone finder) | Was an agency client |
| LinkUp | ~$0.25 | 25% EU coverage in a ColdIQ test (with outages) | Via marketplaces | Fast, weak coverage |

Sources: fullenrich.com/pricing.md, help.kaspr.io (pricing article),
basile.cc/blog/phone-finder, coldiq.com/benchmarks/fullenrich-vs-linkup.
