# LinkedIn rescue nodes in n8n

## 12 Nov 2026: `LI rescue: LinkedIn search` runs once per request (app v4)

Owner: the harvest node was running several times on one name → LinkedIn
lookup (one Apify run per incoming item). `LI rescue: LinkedIn search` now has
**Execute Once** on (only the first item goes to Apify). Published as "LI rescue
LinkedIn search: execute once (owner 12 Nov)"; it was the only difference from
the live version. The free-tools workflow's `LinkedIn search` node was not
changed.


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
