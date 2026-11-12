# LinkedIn rescue nodes in n8n

## 12 Nov 2026: `LI rescue: LinkedIn search` runs once per request (app v4)

Owner: the harvest node was running several times on one name → LinkedIn
lookup (one Apify run per incoming item). `LI rescue: LinkedIn search` now has
**Execute Once** on (only the first item goes to Apify). Published as "LI rescue
LinkedIn search: execute once (owner 12 Nov)"; it was the only difference from
the live version. The free-tools workflow's `LinkedIn search` node was not
changed.

### 12 Nov 13:00: harvest never runs without a company LinkedIn page, in both workflows

Owner saw name-only harvest runs: "if we don't have the company LinkedIn don't even run
harvest".

- **App v4.** The gate (`LI rescue: company page found?`) was still a draft; the live version
  fell back to a name search. The draft holds only that change. **Owner must click
  Publish** (the dialog was left open; the agent's publish was blocked).
- **Free tools (`KmQzVWHBMOXOWXZD`).** Same chain added and **published 12 Nov 13:00**:
  1. `FT rescue: company page search` (Serper, `"<company>" site:linkedin.com/company`).
  2. `FT rescue: company URL` (page title words must all be in the typed company).
  3. `FT rescue: company page found?`.
     - No page goes to `Respond to Webhook80` with an empty link, and no harvest runs.
     - With a page, `FT rescue: LinkedIn search` runs with `currentCompanies` (Execute
       Once).
  4. `FT rescue: pick LinkedIn search` requires the first and last name. It no longer falls
     back to Google's first link.
  - When Google already found a link, it is still returned as before (`FT rescue: done?`
    unchanged).

### 12 Nov 01:55: no company page means no search, plus location and title (draft, owner publishes)

Owner: "si on ne trouve pas le LinkedIn de l'entreprise… je préfère rien retourner que
retourner un truc incertain", and use location and job title if harvest has them.

- **New gate.** `LI rescue: company page found?` sits between `LI rescue: company URL` and
  `LI rescue: LinkedIn search`.
  - No company page means `Respond to Webhook88`: empty answer and refund.
  - No name-only Apify run is made any more.
- **Company page rule.** A page is accepted when every word of its title (minus "Inc", "LLC"
  and the like) is in the typed company. The slug counts only if the title is empty.
  - Microsoft is accepted for "Microsoft Redmond CEO".
  - "Acme Corp Industries" is rejected for "Acme Widgets".
- **Separate fields.** The app now sends `input_data` as `name · company · location · job title`
  (`lfLiNameInput` in `app.html`, single lookup and CSV rows; test
  `tests/li-name-slots.test.mjs`).
  - The worker only forwards `input_data`, so this is the only channel.
  - Google ignores "·", so the original search step and `If35` see the same words as
    before.
  - Old clients and the API (plain space-joined) behave as before.
- **What harvest does with them.**
  - `locations: [location]` goes to harvest when a location is given.
  - The job title is **not** a harvest filter: the by-name actor's `currentJobTitles` is
    exact match ("VP of Sales" ≠ "Vice President, Sales") and would turn right people into
    misses.
  - Instead, when several same-name people work at that company, `LI rescue: pick match`
    takes the one whose headline shares the most title words.
- **Checked** in the browser on Gallimard, Microsoft + Redmond + CEO, US Foods + Chicago +
  Buyer and Cartiga. Not run live.

### Same night: the LinkedIn search now filters by company (draft, owner publishes)

Owner: "le harvest me sort des résultats… pas les bons… uniquement nom et prénom, ça va pas
le faire".

- **Before.** The `pick LinkedIn search` step (headline must name the company) had been
  replaced by an `If` that only checked first and last name, then answered with the first
  same-name stranger.
  - Example: execution 2075439, "Walter Keenan Cartiga, LLC" → "President at Retirement".
  - That success path also went through `Refund Calc (Not Found)21`.
- **Actor support.** `harvestapi/linkedin-profile-search-by-name` does take
  `currentCompanies`, but only as **LinkedIn company URLs**, not names.
  - Checked on Apify: Satya Nadella + `linkedin.com/company/microsoft` returns exactly
    1 profile.
  - Walter Keenan + `linkedin.com/company/cartiga` returns 0, which is now "not found"
    instead of a wrong person.

New chain after `LI rescue: has company?`:

1. `LI rescue: company page search`: Serper, `"<company>" site:linkedin.com/company`, or
   the domain when we have one.
2. `LI rescue: company URL`: first `/company/` result whose title or slug contains the
   company words.
3. `LI rescue: LinkedIn search`: adds `currentCompanies: [url]` when a URL was found.
   Always outputs data; HTTP errors don't stop it.
4. `LI rescue: pick match`:
   - The name must contain the first and last name.
   - Without a company URL, the headline must also name the company.
5. `If` (`linkedinUrl` not empty):
   - true → `LI rescue: respond found`, with no refund;
   - false → `Respond to Webhook88`, which answers "" and refunds.

`LI rescue: prepare` now also returns `company`, `companyKey` and `domain`. All new nodes
are Execute Once. The code was checked in the browser on 3 cases (Cartiga → none,
Microsoft → satyanadella, no company page → headline check). It has not run live.

Extra cost per rescue: one Serper search.

### Same evening: Execute Once on every paid call (draft saved, owner publishes)

Owner: "tous les nœuds Filtrat… tous les nœuds après des search Google… c'est de
l'argent pour moi". Measured on the last 100 executions of app v4:

- **`Switch1` received 2 items in 9 of 100 runs**, so the whole branch ran twice:
  2 Serper searches, 2 Apify runs, and so on.
  - Cause: `Postgres1-Reserve2` updates `WHERE token = …`, and **4 tokens are shared by
    2 accounts each** (8 rows, different emails). Each such lookup also deducts credits
    on both accounts.
  - The owner decides how to split those tokens.
- **The LinkedIn search returns up to 10 profiles**, so `If` → `Respond to Webhook88` →
  `Refund Calc (Not Found)21` got 10 items. The refund code runs once for all items, so
  it was not refunded 10 times.

Change: `executeOnce: true` on `Switch1` and on 54 paid nodes (Serper, Apify,
Filtrat, AI agent, the HTTP callbacks after Filtrat adapters), bringing the total from
13 to 68. Nothing else differs from the live version.

**Deliberately NOT Execute Once.** These verify each email candidate, one item per
candidate, up to 25; Execute Once would verify only the first and lower the find rate:

- `Verify Generic Emails [Email]1`
- `Verify Personal Emails [FullName]1`
- `HTTP Request8` (after `Extract Email (Domain-Scoped)`)

The fallbacks right after them (`Search Email (Domain-Scoped) [Email]1` and
`Name email backup: pattern + SMTP (Apify)`) did run once per unverified candidate, and are
now Execute Once.

The draft is saved. **Publishing was blocked for the agent**, so the owner clicks Publish
in n8n. The free-tools workflow was not touched.


## v4 (10 Nov 2026, app v4 only): Filtrat company → LinkedIn as the last step — ON (re-added 20:54 after a 17:10 removal)

**Back on at 20:54, owner: "ajoute si ça augmente le finding rate".** Published as
"Filtrat company backup on (owner confirmed 10 Nov 20:54)". Live check:
"VIS Suomen Kiskokalustotehdas Oy" → its company page in 9 s, and execution
2067858 shows `rescue: filtrat_company`. Expected effect: company → LinkedIn was
84.5% found over the last 30 days (2,592 / 3,067); Filtrat recovers ~28% of the
misses, so about 88-89%, ~130 more companies a month for ~20-23k Filtrat
credits a month.

History: **removed at 17:10 on the owner's call** (cost not settled), published as
"Remove Filtrat company backup": the three `Co filtrat:` nodes are deleted and
`Co rescue: found?` goes straight to Respond to Webhook65 again, as in v3. To put
it back, republish version "Filtrat company to LinkedIn as last backup" or redo
the wiring below. The test numbers stay valid.


`company_name_to_linkedin_url` in "linkfinder ai app v 4": when `Co rescue:
found?` still says "Not found", the lookup now goes to
`Co filtrat: company-to-linkedin` (POST `api.filtrat.io/v1/company-to-linkedin`,
credential "Filtrat api"; a bare domain is sent as `domain`, anything else as
`name`) → `Co filtrat: pick` (only `status: matched` counts) →
`Co filtrat: found?` → Respond to Webhook29 (hit) / Respond to Webhook65 (miss +
refund, unchanged). Published as version "Filtrat company to LinkedIn as last
backup". Not added to the free-tools workflow: every match costs Filtrat
credits, and free users would spend them.

**Test on our last 100 distinct misses** (from `enrichment_history`, mostly one
rail-industry list of 3 Nov, through a temporary n8n workflow since deactivated):

| Filtrat answer | Count | Read |
| --- | --- | --- |
| matched (all "likely") | 28 | Spot-checked names line up (ZOS Zvolen, V-Bahn AG, Telergon, Sirail…) |
| possible | 6 | Mixed: Teleste right, Vogel & Plötscher → "ROBEL Metrics" wrong. Not accepted |
| not_found | 66 | Free |

So about **28% of our company misses come back**. Cost: 150 Filtrat credits per
match by name (50 by domain); 33 of the 34 non-misses were billed 150, "possible"
included despite the docs saying it is free — 4,950 credits for the 100. Our
price for this lookup is 1 credit, so check what a Filtrat credit costs before
leaving it on for big lists. Live check through the app worker:
"Zastrova, a.s." → `linkedin.com/company/zastrova-a.s./` in 14 s.

## Current state (v2, published 7 Nov 2026 21:33): Apify backup ONLY

The owner's call: **keep the original Google step exactly as it was, and add
Apify only as a backup when that step finds nothing.** The v1 top-10 rescore
and extra Google queries were removed the same evening.

| Workflow | Branch | What runs after the original step says "not found" |
| --- | --- | --- |
| linkfinder ai app v 4 | name → LinkedIn (`If35` false) | `LI rescue: prepare` → `has company?` → `LinkedIn search` (Apify `harvestapi~linkedin-profile-search-by-name`) → `pick LinkedIn search` → `found by LinkedIn search?` → Respond86 / Respond88 + refund |
| same | company → LinkedIn (`If34` "Not found") | `Co rescue: LinkedIn company search` (Apify `harvestapi~linkedin-company`) → `Co rescue: pick` → `Co rescue: found?` → Respond29 / Respond65 + refund |
| Linkfinderai free tools | name → LinkedIn (`HTTP Request63`) | `FT rescue: prepare` → `done?` (Google returned a link, so it is returned as before) → else `LinkedIn search` → `pick LinkedIn search` → Respond80 |
| same | company → LinkedIn (`If5` false) | `Co rescue: …` as above |

A LinkedIn-search row is accepted only when its headline names the company
(person), or the name or website matches (company). A name with no company
skips Apify. Code for v2: `LI_PREP`, `FT_PREP`, `FT_LINKEDIN2` in
`build.mjs`; editor script in `inject-v2.mjs`.

Live checks after v2:
- Satya Nadella/Microsoft: unchanged.
- **Alicia Waineo/ANA Inc: found by the LinkedIn search step** (execution 2047759).
- Made-up name: Apify ran, not found, refunded, no errors (2047760).

Rollback: version history on each workflow. v2 is "LinkedIn rescue v2: Apify
backup only…"; v1 and the pre-change version are below it.

## Measured on 40 real misses (7 Nov 2026, 21:40) and v3

40 recent name → LinkedIn lookups the Google step had answered "not found"
(from `enrichment_history`, max 15 per account, junk inputs kept). Each was
run through the same LinkedIn people search the backup uses:

| Outcome (v2 rule) | Count |
| --- | --- |
| Right person, company in the headline | 9 (Monica Weaver/TGI Direct, Tom Bené/Breakthru Beverage, Jack Burton/Amalgamated Sugar, Katarína Vavreková/Tesena, Liv Williams/IMPALÈ, Devon Rice/Glazed Nuts, Matúš Krška/Blocshop, Sebastiano Gianello/Tempocasa, Goutam Ghosh/Amit) |
| Probably right, matched only on a job word ("software") | 3 |
| **Wrong person** | **4**: three on a country ("India", "Pakistan", "Indonesia"), one on "lead" inside "Leadership" |
| Still not found | 24 (junk inputs, or a headline without the company) |

**v3 (published 21:48, both workflows):** countries, cities and job words
never count as the company (`NOTCO`), and company words must match whole
(`hasWord`). Re-scored on the same 40: **9 right, 0 wrong.** That's about 22%
of misses recovered. Misses are 31% of name → LinkedIn lookups (8,254 of
26,813 in 90 days), so the overall find rate goes from about 69% to about
76%, at about $0.004 per miss.

Also fixed in v3: legal forms like "s.r.o." and tokens like "1.PF," were being
read as web domains, and initials were ending up in the surname ("t gallant").
Both made LinkedIn's strict name search fail.

---

## History: v1 (21:19–21:33, replaced)

Added straight into the two production workflows on
`primary-fie-production.up.railway.app` and published. **Purely additive**:
every lookup that answered before answers the same way. Only lookups that
ended "not found" get extra tries before the existing not-found reply and
refund.

| Workflow | Branch | Added nodes (all named `… rescue: …`) |
| --- | --- | --- |
| linkfinder ai app v 4 (`LntSghdJrXAAFYmr`) | `lead_full_name_to_linkedin_url` (after `If35` false) | `LI rescue: top 10` → `found in top 10?` → `has company?` → `Serper retry` → `pick retry` → `found by retry?` → `LinkedIn search` (Apify `harvestapi~linkedin-profile-search-by-name`) → `pick LinkedIn search` → `found by LinkedIn search?` → Respond86 (hit) / Respond88 (miss + refund, unchanged) |
| same | `company_name_to_linkedin_url` (after `If34` "Not found") | `Co rescue: LinkedIn company search` (Apify `harvestapi~linkedin-company`) → `Co rescue: pick` → `Co rescue: found?` → Respond29 (hit) / Respond65 (miss + refund, unchanged) |
| Linkfinderai free tools (`KmQzVWHBMOXOWXZD`) | `professional_profile_finder` (between `HTTP Request63` and Respond80) | `FT rescue: …` same chain. Google's first link is still returned as the last resort, as before, so nothing that answered goes blank |
| same | `company_name_to_linkedin_url` (after `If5` false) | `Co rescue: …` as above, reading `$('Webhook')` |

Rules:
- A rescue only accepts a profile whose title or snippet (Google) or
  headline (LinkedIn search) names the company, so no same-name strangers.
  A name with no company is not rescued.
- Company: the name must match (legal forms ignored; forms from two
  countries, like Srl and Pvt Ltd, mean two companies), or the website must
  equal the domain that was typed.
- Apify uses the existing `apify api key` credential; the Serper retry
  reuses the existing node's header. No secrets were added.
- Cost per rescued miss: up to 2 Serper calls plus about $0.004 (person) /
  $0.003 (company) on Apify.

Live checks on 7 Nov, via the API:
- Satya Nadella/Microsoft and Stripe: unchanged.
- **Alicia Waineo/ANA Inc**: found (was a miss).
- **D.R. Ferroviaria Italia Srl**: found (was a miss).
- A made-up name: empty, refunded, all rescue nodes ran with no errors.

Known, not changed: the *original* `If35` accepts any first result whose
title has the first two input words. "Alicia Carrasco Turning Point Brands"
returned "Alicia Berjano Carrasco" (wrong person) through the old path.
Tightening that would change existing answers; ask the owner first.

Rollback: n8n version history (clock icon) on each workflow, the version
before "LinkedIn rescue on misses (name + company)".

Code: `build.mjs` (node bodies), `test.mjs` (`node --test test.mjs`, 11
tests with a mini n8n runtime), `inject-v4.mjs` / `inject-free.mjs` (the
editor scripts that added them).
