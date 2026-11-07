# LinkedIn rescue nodes in n8n (live since 7 Nov 2026)

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
