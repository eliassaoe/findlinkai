# gtm-mcp with LinkFinder + Instantly swapped in

Evaluated 2026-09-06. Repo: https://github.com/impecablemee/gtm-mcp
Clone inspected at commit `9c280e1` (shallow clone, `--depth 1`).

The question this answers: gtm-mcp is an open-source Claude Code pipeline that does
what MentionAgent / AI-SDR tools charge $99-$899/mo for. It wraps **Apollo** (data)
and **SmartLead** (sending). We already own the equivalent of both. How much work is
the swap?

**Answer: the sending swap is nearly free. The data swap is the real work, and it is
a semantic mismatch, not a plumbing job.**

## What the repo actually is (verified, not from the README)

| Claim | Reality |
| --- | --- |
| "49 tools" (README) | **54** `@mcp.tool()` registrations in `src/gtm_mcp/server.py` |
| Language | **Python 3.11+ / uv / fastmcp** — not Node |
| Size | ~6,000 LOC across 14 modules; 19 MB clone |
| License | `license = "MIT"` in `pyproject.toml`, but **NO LICENSE FILE in the repo** |
| "Actively developed" | **Last commit 2026-04-20** — ~4.5 months stale as of this eval |

Two of those matter. See Risks below.

### Layout

```
src/gtm_mcp/
  server.py            857 LOC   54 MCP tool registrations
  tools/apollo.py      555       <- SWAP TARGET (data)
  tools/smartlead.py   872       <- SWAP TARGET (sending)
  tools/pipeline.py   1715       orchestration, blacklists, run state
  tools/getsales.py    251       LinkedIn outreach (optional, ignore)
  tools/scraping.py    283       website scrape for classification
  tools/sheets.py      401       Google Sheets export (optional)
  tools/assignment.py  455       campaign->project assignment
  workspace.py         309       local state in ~/.gtm-mcp/
.claude/
  commands/            launch, outreach, qualify, replies
  skills/              14 skills (quality-gate, email-sequence, deep-personalization, ...)
  agents/              company-qualifier, personalization-researcher, reply-handler
```

The `.claude/` directory is the actual value. The Python is thin API wrappers; the
skills and commands encode the outreach judgement. Those are provider-agnostic and
survive any swap.

## Swap 1: SmartLead -> Instantly (easy, and it deletes code)

Every SmartLead tool has a named Instantly MCP counterpart.

| gtm-mcp (`tools/smartlead.py`) | Instantly MCP tool | Note |
| --- | --- | --- |
| `smartlead_list_campaigns` | `list_campaigns` | |
| `smartlead_get_campaign` | `get_campaign` | |
| `smartlead_create_campaign` | `create_campaign` | |
| `smartlead_set_sequence` | `update_campaign` (`sequences`) | see win below |
| `smartlead_add_leads` | `add_leads_to_campaign_or_list_bulk` | field remap needed |
| `smartlead_list_accounts` | `list_accounts` | |
| `smartlead_search_accounts` | `list_accounts` + local filter | no server-side search |
| `smartlead_sync_replies` | `list_emails` / `count_unread_emails` | |
| `smartlead_get_lead_messages` | `list_emails` (thread) / `get_email` | |
| `smartlead_send_reply` | `reply_to_email` | |
| `smartlead_activate_campaign` | `activate_campaign` | |
| `smartlead_pause_campaign` | `pause_campaign` | |
| `smartlead_export_leads` | `list_leads` | |
| `smartlead_send_test_email` | **NO EQUIVALENT** | see gap below |

### The win: A/B variants get simpler

`smartlead_set_sequence` (smartlead.py:534) has to make a **second API call** per step
to attach A/B variants, with the inline comment:

> `# A/B variants via separate API call (SmartLead doesn't accept inline variants)`

Instantly's `create_campaign` / `update_campaign` take variants **inline**:

```json
[{"steps":[{"type":"email","delay":0,
  "variants":[{"subject":"...","body":"<div>...</div>"}]}]}]
```

So the swap removes that whole second-pass loop.

### Gaps and frictions

1. **`smartlead_send_test_email` has no Instantly equivalent.** This is load-bearing:
   it powers the second human approval gate (test email lands in your inbox before
   the campaign activates). Options: send via the sending account directly, or add
   your own address as a one-lead campaign and activate briefly. **Do not silently
   drop the gate** — it is the main safety property of the whole pipeline.
2. **Campaign ID type change.** SmartLead uses `int`; Instantly uses a **UUID
   string**. `campaign_id: int` appears in ~15 signatures across `server.py`,
   `smartlead.py`, `pipeline.py` and `campaign_push.py`. Mechanical but wide.
3. **Lead field remap.** `smartlead_add_leads` (smartlead.py:603) maps to SmartLead
   default fields `linkedin_profile`, `phone_number`, `company_url`, plus
   `custom_fields`. Instantly's bulk add takes freeform lead objects requiring only
   `email`, so this mostly *relaxes* — but the sequence templates reference those
   field names as merge variables and must be renamed in lockstep.
4. Keep `WorkspaceManager.normalize_company_name()` — strips Inc/LLC/Ltd/Corp/GmbH.
   Provider-independent, still wanted.

## Swap 2: Apollo -> LinkFinder AI (the real work)

Not a like-for-like. Apollo is a **filtered database**; LinkFinder is a
**resolver + AI search**. The pipeline is built around the former.

| gtm-mcp Apollo call | LinkFinder equivalent | Fit |
| --- | --- | --- |
| `apollo_search_companies(filters)` | none | **GAP** |
| `apollo_search_people(domain, seniorities)` | `find_company_employees(company_domain, seniority, department)` | good |
| `apollo_enrich_people(person_ids)` -> verified email | `find_email_from_linkedin_profile(linkedin_url)` | good, different key |
| `apollo_enrich_companies(domains)` | `get_linkedin_company_info` + `find_company_*` | partial |
| `apollo_get_taxonomy()` | none | **GAP** |
| `apollo_estimate_cost()` | rewrite against LinkFinder credit table | must rewrite |
| — | `find_leads_ai(query, fetch_count)` | **no Apollo analogue** |

### The three real problems

**1. No company-search-by-filter.** `apollo_search_companies` is the top of the
funnel: keyword tags OR industry tag IDs, plus location / employee range / funding
stage, paginated. LinkFinder has no equivalent. Two ways out:

- **(a) Invert the funnel with `find_leads_ai`.** It takes a natural-language ICP and
  returns full profiles (name, title, email, LinkedIn, company) in one call. That
  collapses search -> people-search -> enrich into a single step. Much simpler — but it
  bypasses the *company classification* stage, which is where gtm-mcp's
  `company-qualifier` agent and website-scrape step add their value.
- **(b) Keep the company stage, feed it differently.** Source domains from somewhere
  else (existing lists, the `ai_keywords` work, SEO traffic) and start the pipeline at
  `apollo_search_people`. Preserves the qualification logic.

Option (b) preserves more of what makes the repo worth using. Option (a) is a
weekend. They are different products — decide before writing code.

**2. Person identity key differs.** Apollo's flow is `search -> person_id -> bulk_match
-> verified email`. LinkFinder's is `linkedin_url -> email`. `find_company_employees`
does return LinkedIn URLs, so the chain holds — but every place carrying `person_ids`
must carry `linkedin_url` instead, and `apollo_enrich_people`'s batching (chunks of 10,
Apollo's `bulk_match` limit) becomes N individual calls.

**3. The `org_data` block shrinks.** `apollo_enrich_people` returns a rich org payload
consumed downstream by the qualifier and personalization skills:

```
industry, industry_tag_id, country, city, state, employee_count,
short_description, keywords[], funding_stage, revenue, founded_year,
linkedin_url, headcount_6m_growth, headcount_12m_growth
```

LinkFinder covers employee_count, website, LinkedIn URL, and some company info.
**Funding stage, revenue, founded year and headcount growth have no LinkFinder
source.** Those feed the qualification prompts. Either drop those signals (and
re-tune `company-qualification/SKILL.md`) or add a third provider.

### Credit cost: rewrite `apollo_estimate_cost` and check the numbers

The pipeline's cost gate (Checkpoint 1 — "the ONLY approval before spending Apollo
credits") is denominated in Apollo credits. LinkFinder's economics are different and
the estimator must be rewritten against `app.html` `creditCosts`.

**Discrepancy found — resolve before trusting any estimate.** The LinkFinder MCP tool
description for `find_email_from_linkedin_profile` says *"Costs 1 credit."*
`CLAUDE.md` (authoritative, from `app.html`) says `linkedin_profile_to_email = 10`.
**Assume 10 and fix the tool description**, or verify against `app.html` directly. A
10x error in the cost gate is exactly the failure the gate exists to prevent —
`launch.md:220` already records a past run that wasted significant credits on a bad
geo assumption.

`find_leads_ai` (1 credit/lead per its description) and `find_company_employees`
(1 credit/employee) are **not in the CLAUDE.md table at all** and need confirming.

## Risks

- **No LICENSE file.** `pyproject.toml` declares MIT but the repo ships no license
  text. Metadata alone is weak. Open an issue asking the author to add `LICENSE`
  before any of this code goes into a LinkFinder product. Fine for internal
  evaluation now.
- **Stale.** Last commit 2026-04-20. Treat as a fork-and-own, not a dependency to
  track upstream.
- **Apollo semantics are baked into the skills**, not just the Python.
  `apollo-filter-mapping/SKILL.md` and the shipped `apollo_taxonomy.json` /
  `apollo_embeddings.npz` reference files exist purely to translate an ICP into
  Apollo's tag vocabulary. On the LinkFinder path that skill is deleted, not ported.
- **Sending infrastructure is still yours to run.** The README requires 5+ lookalike
  domains, a Gmail account per domain, and a 2-week warmup. This repo does *not*
  bundle sending infra — which is precisely the piece MentionAgent charges $99/mo for
  and the reason its price looks low.

## Recommended order

1. **SmartLead -> Instantly first.** Self-contained, ~1 file plus the ID-type sweep,
   testable against a paused campaign, and it deletes the A/B second-pass. Solve
   `send_test_email` before touching anything else — the approval gate depends on it.
2. **Decide funnel shape (a) vs (b) before writing data code.** This is a product
   decision, not an engineering one.
3. **Rewrite the cost gate against verified LinkFinder credit costs.** Reconcile the
   1-vs-10 discrepancy first.
4. Only then port the Apollo call sites.

Step 1 is genuinely a weekend. Step 4 under option (b) is not.

## Open questions

- Is the goal an internal outbound engine, or the productised thing sketched in
  `docs/ai-sdr-offer.md`? Under option (a), `find_leads_ai` + Instantly + these skills
  is close to a shippable product surface.
- Does `find_leads_ai` accept enough ICP nuance to replace keyword+industry+geo+size
  filtering, or does recall collapse? One test call against a known segment answers it.
