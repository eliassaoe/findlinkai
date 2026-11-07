# LinkedIn rescue nodes in n8n

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
