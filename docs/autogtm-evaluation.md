# AutoGTM evaluated against gtm-mcp

Evaluated 2026-09-06. Repo: https://github.com/cmn-labs/autogtm
Full clone inspected at `405b1d0`. Companion to `docs/gtm-mcp-swap-map.md`.

**Verdict: better architecture, better fit for our stack, one genuinely dangerous
flaw, and a licence that blocks the `docs/ai-sdr-offer.md` path.**

## What it is (verified from source)

A Next.js 15 web app, not an MCP server. You write company context and lead briefs in
plain English; AI turns those into search queries; Exa discovers leads; OpenAI enriches
and scores them; it drafts an Instantly campaign per lead; you approve, or Autopilot
sweeps daily and auto-adds the top N.

- **13,165 LOC** TypeScript, turborepo: `apps/autogtm` (UI + API routes) and
  `packages/autogtm-core` (the engine).
- **46 commits, 37 stars, 11 forks. Last commit 2026-07-16** — ~3 months fresher than
  gtm-mcp, but a third of the commit history.
- **AGPL-3.0, with a real LICENSE file.** (gtm-mcp declares MIT in `pyproject.toml`
  and ships no LICENSE at all.)
- Stack: Supabase (Postgres + auth), Inngest (jobs), Resend (digests), OpenAI
  (GPT-4.1 / GPT-5-mini), Exa Websets (discovery), Instantly (sending).

## Head to head

| | gtm-mcp | AutoGTM |
| --- | --- | --- |
| Form | MCP server, runs in Claude Code | Standalone web app you host |
| Sending | SmartLead | **Instantly — already ours** |
| Discovery | Apollo (filtered database) | Exa Websets (AI web search) |
| Email sourcing | Apollo `bulk_match`, filtered to `email_status == "verified"` | **LLM scrapes it out of text. No verification.** |
| Swap surface | `tools/apollo.py`, 555 LOC | `clients/exa.ts`, **185 LOC** |
| Human gates | 2 hard checkpoints, cost gate before spend | Approve per lead **or Autopilot auto-adds** |
| Licence | MIT declared, **no LICENSE file** | **AGPL-3.0** |
| Last commit | 2026-04-20 | 2026-07-16 |
| Commits | 138 | 46 |
| Ops burden | uv install, API keys | Supabase + Inngest + Resend + Next.js deploy |

### Where AutoGTM wins

1. **Instantly is already the sender.** `packages/autogtm-core/src/clients/instantly.ts`
   hits `api.instantly.ai/api/v2` directly — createCampaign, addLeadsToCampaign,
   activate, pause, analytics, listAccounts. The entire "Swap 1" scoped in
   `docs/gtm-mcp-swap-map.md` is **already done here**, including the
   `send_test_email` gap that had no clean answer.
2. **Supabase is already our database.** Schema ships as `schema.sql` + `migrations/`.
3. **Much smaller swap surface.** Provider clients are isolated in
   `packages/autogtm-core/src/clients/` — 185 lines for Exa vs 555 for Apollo, and no
   taxonomy files or embeddings to port.
4. **Fresher.**

## The flaw: there is no email verification anywhere

This is the finding that matters. `packages/autogtm-core/src/ai/extractEmail.ts` is
the entire email-acquisition layer:

```ts
// Quick AI-powered email extractor from arbitrary Exa enrichment data
model: 'gpt-4.1-nano'
content: 'Extract the most relevant contact email address from this data.
          Return JSON: { "email": "found@email.com" } or { "email": null } ...'
```

It asks a small model to pull an address out of whatever unstructured text Exa
returned. Then it sends to it.

A grep across the whole repo for `verif|bounce|deliverab|mx record|validate.*email`
returns **no pre-send check of any kind**. The only bounce handling is
`clients/instantly.ts:180` reading `bounced` back out of Instantly analytics — i.e.
observed *after* the damage, and a UI hint in `AutopilotTab.tsx` telling the operator
to "raise slowly while monitoring reply/bounce rates."

Combined with Autopilot — which auto-adds leads daily with no per-lead approval,
default 5/day — this is a domain-reputation hazard. An LLM guessing addresses from
scraped page text will produce plausible-looking wrong addresses, and hard bounces are
the fastest way to burn a sending domain. gtm-mcp's Apollo path, whatever else is
wrong with it, filters to `email_status == "verified"` and simply drops the rest.

**Do not run Autopilot on a domain we care about before fixing this.**

### Which is also the opportunity

That flaw is precisely our product. Replacing `extractEmailFromEnrichmentData()` with
a LinkFinder call is a ~50-line change against one file with one caller:

- Exa already returns a LinkedIn URL for most people-search results ->
  `find_email_from_linkedin_profile(linkedin_url)`.
- No LinkedIn URL but name + company -> `find_linkedin_url_from_name` then the above.
- Keep the LLM extractor as a last-resort fallback, but **flag those leads as
  unverified and exclude them from Autopilot.**

That is dramatically less work than the Apollo -> LinkFinder port scoped in
`docs/gtm-mcp-swap-map.md`, because Exa stays: it keeps doing discovery (which
LinkFinder cannot do — see the "no company-search-by-filter" gap in that doc), and
LinkFinder only takes over contact resolution, which is exactly what it is for.

**Cost note:** `linkedin_profile_to_email = 10` credits (CLAUDE.md, authoritative).
At Autopilot's default 5 leads/day that is 50 credits/day, ~1,500/month. Budget it
before switching Autopilot on. The 1-vs-10 discrepancy flagged in
`docs/gtm-mcp-swap-map.md` still needs resolving.

## Is Exa actually a good lead finder?

Asked separately; it decides whether the "keep Exa for discovery" half of the plan
holds. Short answer: **for people with a public web footprint, yes. For firmographic
B2B targeting, no — and AutoGTM's prompts make it worse.**

**What Exa structurally is.** Exa searches the **open web** and verifies hits against
natural-language criteria. Apollo and LinkFinder query a **structured contact
database**. That difference decides everything: Exa finds people who have published
something — a profile, a portfolio, a talk, a post. It cannot answer "VP Sales at a
150-300 person B2B SaaS in DACH" the way a firmographic filter can, because that
person's discoverability lives in a database, not on the open web.

**Pricing.** Websets Starter $49/mo, Pro $449/mo. Underlying API: Search ~$7/1K,
Deep Search ~$12-15/1K. Cheap relative to Apollo seats.

**Independent validation is thin.** One G2 review (4.5) despite $361M raised. The
strongest datapoint is HubSpot running 2.7M enrichments through Exa — real scale, but
vendor-cited. Nobody has published a hit-rate or accuracy benchmark worth quoting.

**The bigger problem is AutoGTM's own prompt, not Exa.**
`packages/autogtm-core/src/ai/generateQueries.ts` instructs the model to focus on:

> "Social media profiles (TikTok, Instagram, YouTube, LinkedIn), personal websites and
> portfolios, blog posts and articles" ... "Focus on finding micro-influencers, content
> creators, and active professionals in the relevant space."

And the enriched-lead schema agrees: `total_audience`, `content_types`,
`promotion_fit_score`, `promotion_fit_reason`, `category` — **and no company field at
all.**

**AutoGTM is an influencer/creator outreach engine wearing a B2B GTM name.** That is
not a criticism of the code, which is clean, but it is a different product from what
the README implies and from what `docs/ai-sdr-offer.md` describes. Using it for B2B
buyer outreach means rewriting `generateQueries.ts`, the enrichment schema and the fit
scoring — a much bigger job than the email patch.

**So:** keep Exa where the target has a public footprint (creators, indie founders,
people who write). Do not expect it to replace firmographic search. That is the same
gap `docs/gtm-mcp-swap-map.md` found on the LinkFinder side — **neither candidate
gives us company-search-by-filter, and that remains the unsolved piece.**

## The blocker: AGPL-3.0

AGPL is not MIT. Section 13 means that if we modify AutoGTM and let users interact
with it over a network, we must offer those users the modified source.

- **Running it for our own outbound, internally: fine.** No outside users.
- **Productising it as the AI SDR service in `docs/ai-sdr-offer.md`: not fine**
  without publishing our modifications — including the LinkFinder integration.

This is the reverse of the gtm-mcp situation. gtm-mcp *intends* MIT (permissive enough
to build on) but ships no LICENSE file, which is a fixable paperwork problem — ask the
author. AutoGTM's licence is unambiguous, properly filed, and copyleft. Nothing to fix.

## Recommendation

**Use AutoGTM internally. Do not build the productised offer on it.**

1. Stand it up against our own Supabase for our own outbound. The Instantly and
   Supabase integrations we would otherwise have written are already there.
2. **Before any send:** swap `extractEmail.ts` for LinkFinder and gate Autopilot on
   verified-only leads. **Written: `docs/patches/autogtm-linkfinder-email.patch`** —
   read its verification-status section, it has never made a live LinkFinder call.
3. Keep Exa for discovery. It solves the top-of-funnel gap that has no LinkFinder
   answer.
4. If the `ai-sdr-offer.md` product goes ahead, the architecture here is worth copying
   and the code is not — or ask cmn-labs about a separate licence.

## What I did not verify

- No `.env.example` in the repo, so the full required-env list is inferred from source
  (`EXA_API_KEY`, `OPENAI_API_KEY`, Instantly key, Supabase, Inngest, Resend). Enumerate
  properly before a deploy attempt.
- Did not run it. No install, no build, no test of the Exa or Instantly paths.
- Did not read `inngest/functions.ts` (the job scheduler) in full — that is where
  Autopilot's daily sweep and the hourly Instantly sync actually live, and it is the
  file to read before trusting the automation.
