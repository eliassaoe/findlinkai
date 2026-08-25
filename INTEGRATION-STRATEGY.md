# Integration strategy — from "enrichment tool" to "enrichment layer"

**Date:** 2026-08-25 · **Sources:** PostHog 263837 (90–120d), Supabase, repo audit

---

## The thesis is correct, and the data is unusually clear about it

Cohort: everyone who ran an enrichment 30–120 days ago — i.e. everyone who had a
real chance to lapse. Split by whether they ever took an integration action
(`api_key_copied`, `mcp_url_copied`, `hubspot_connected`, `webhook_saved`,
`crm_sync_settings_saved`, `connect_to_claude/chatgpt_clicked`):

| | People | Still active at 30d | Retention | Avg enrichment runs | Avg active weeks |
| --- | --- | --- | --- | --- | --- |
| Never integrated | 934 | 13 | **1.4%** | 4.3 | 1.09 |
| Integrated | 62 | 5 | **8.1%** | 13.6 | 1.47 |

**5.8× retention. 3.2× usage.**

> Read it honestly: this is correlation, and self-selection explains part of it —
> people who reach for an API key were more committed before they touched it. n=62
> with 5 survivors is a small base. But the direction is unambiguous and the gap is
> far too large to be noise. Worth betting on; not worth quoting as "integration
> causes 5.8× retention" until an experiment says so.

---

## Where the leverage actually is (90-day unique users)

| Surface | Users | Verdict |
| --- | --- | --- |
| `api_key_copied` | **157** | The wedge. 25× everything else combined. |
| `docs_link_clicked` | 68 | Real demand for docs. |
| `mcp_tutorial_popup_shown` | 59 | → only **3** clicked through (5%). |
| `crm_sync_page_viewed` | 16 | → **1** saved settings. |
| `webhook_saved` | 9 | Thin. |
| `mcp_url_copied` | 4 | Thin. |
| `hubspot_connected` | **1** | One connection in 90 days. |
| `integrations_hub_viewed` | **1** | The hub is invisible. |

For scale: 1,581 signups and 1,229 activated users over the same window.

### What this changes about the plan

**Your instinct that API is the best bet is confirmed, hard.** 157 people found an
API key without being pushed there. Nothing else is close. Everything below follows
from that.

**Stop treating `integrations.html` as a destination.** One person viewed it in 90
days while 157 found the API key inside the app. People do not go looking for an
integrations hub — they hit the moment where a repeat job is obviously coming and
reach for a key. Put the integration offer *at that moment*, not on a page.

**Park CRM sync and HubSpot.** 16 page views, 1 settings save, 1 connection in 90
days — and per `CLAUDE.md` the HubSpot connection costs money every month. This is a
cost centre with one user. Finishing it now spends the most effort on the least
evidence. (It also directly contradicts "an API integration is our best bet" — CRM
sync is the opposite: heaviest to build, narrowest reach.)

**MCP stays a nice-to-have.** 5% click-through on the tutorial popup, 4 URL copies.
The recent commit that demoted MCP behind the bulk-upload video was the right call.

---

## The measurement gap to close before anything else

**There is no event for a first successful API call.** 157 people copied a key. How
many ever made a request? Unknown — the funnel's most important step is unmeasured.

Everything in this document is being decided on `api_key_copied`, which is *intent*,
not *adoption*. Fix this first; it is a day of work and it re-grades every priority
below.

Emit from the API edge worker, keyed to the same person:
- `api_first_call_succeeded` (once per user, with time-since-key-copied)
- `api_call_made` (daily rollup — do **not** fire per request)

Then the real metric becomes available: **`api_first_call_succeeded / api_key_copied`.**
That ratio is the integration funnel.

---

## OpenAPI first — five projects collapse into one

Current state of the machine-readable spec:

| Artifact | State |
| --- | --- |
| `api-documentation.html` | 76 KB, hand-written, updated 2026-08-23 |
| `openapi.json` | **2 paths** — `/` and `/status/{job_id}`. Effectively a stub. |
| `n8n-nodes-linkfinderai` | v0.1.0, built, hand-maintained |
| `nango-integrations` | HubSpot only |
| `mcp-server` | built |
| Zapier / Make | "coming soon" in `integrations.html` meta description |

Meanwhile the database shows **15 live enrichment types**, led by
`lead_full_name_to_linkedin_url` (348 users, 10,140 runs in 30 days).

**A complete OpenAPI 3.1 spec is the highest-leverage artifact in this whole plan**,
because every other item on the list is generated from it rather than built beside it:

- Reference docs (Scalar/Redoc render it — replaces hand-maintaining 76 KB of HTML)
- The Zapier app (Zapier ingests OpenAPI)
- The Make app (same)
- The n8n node (regenerate rather than hand-patch)
- The MCP server tool list (regenerate)
- Client SDK snippets in every language, free
- And LLM tooling reads it directly — which is the actual AEO play, better than prose

This is what "finish those features once and for all" looks like mechanically. Five
hand-built integrations drift apart the moment an endpoint changes. One spec plus five
thin generated wrappers does not.

---

## Google Sheets is the second bet, and the data suggests why

Top enrichment type by a wide margin is `lead_full_name_to_linkedin_url` — 348 users,
10,140 runs in 30 days. **That is a spreadsheet-shaped job**: a column goes in, a
column comes out, repeatedly, forever.

The people running it are sales ops, not engineers — they will never copy an API key.
A Sheets add-on with a `=LINKFINDER()` formula is the same continuous-enrichment
dependency, reachable by the population the API can't touch.

> Flagged as a **hypothesis**, not a finding: there is no Sheets telemetry at all
> today. The reasoning is from job-shape, not observed behaviour. Ship it behind an
> event and let it prove itself.

---

## Positioning — what to change and where

The "enrichment layer" idea appears nowhere on the site today.

| Page | Today | Problem |
| --- | --- | --- |
| `integrations.html` | "Connect LinkFinder AI to your stack… plus official Zapier, Make and n8n apps **coming soon**" | "Coming soon" on a page nobody visits. Announcing unbuilt things costs trust and buys nothing. |
| `crm-sync.html` | title: "CRM Data Health **Audit**" | Titled as a one-off audit — the exact one-shot framing to move away from. |
| `api-documentation.html` | "B2B contact data enrichment… at scale" | Describes volume, not continuity. |

The message to install, in the product and on these pages:

> **You already got the data once. Now stop asking for it.**
> LinkFinder keeps finding it — in your CRM, your sheet, your workflow, your assistant.

The distinction that matters to a buyer is **one-time vs. standing**: not "we have an
API" but "your list stays enriched without you opening a tab."

### Put the moment in the product, not on a page

The natural trigger already exists in the event stream and is unused. After a user's
**second** bulk run of the same enrichment type — proof of a repeating job — show one
thing:

> "You've run this twice. Want it to run itself?" → one-click key + a 6-line
> copy-paste snippet for their most-used enrichment type, pre-filled.

Not a menu of six integrations. One next step, matched to what they already do. Gate
it on `enrich_started` count and type, and fire `integration_offer_shown` /
`integration_offer_accepted` so it can be measured.

---

## Sequence

| # | Work | Why now | Size |
| --- | --- | --- | --- |
| 1 | API telemetry (`api_first_call_succeeded`) | Everything else is being prioritised blind without it | 1 day |
| 2 | Complete OpenAPI 3.1 spec, all 15 types | Generates items 3–6; stops drift permanently | 3–5 days |
| 3 | Regenerate docs from the spec (Scalar/Redoc) | Retires 76 KB of hand-maintained HTML | 2 days |
| 4 | In-app "run it twice → automate it" trigger | Puts the offer where the 157 already are | 3 days |
| 5 | Google Sheets add-on | Reaches the non-technical majority; test the hypothesis | 1–2 weeks |
| 6 | Regenerate n8n node + publish Zapier/Make from spec | Now near-free; removes "coming soon" | 3 days |
| 7 | Rewrite `integrations.html` + `crm-sync.html` to standing-enrichment framing | Only worth doing once 1–6 make it true | 2 days |
| — | ~~CRM sync / HubSpot~~ | 1 user, monthly cost. Revisit when the spec makes it cheap. | parked |

---

## Open questions

- **Do the 157 key-copiers actually call the API?** Blocks honest prioritisation. Item 1.
- **Is Sheets demand real?** No telemetry. Ship behind an event.
- **Does integration cause retention, or select for it?** Test properly: offer the
  item-4 trigger to a random half of eligible users and compare 30-day retention.
  With ~150 eligible/quarter this is slow but it is the only way to know.
