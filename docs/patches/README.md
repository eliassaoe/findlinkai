# autogtm-linkfinder-email.patch

Replaces AutoGTM's LLM email-guessing with LinkFinder resolution, and gates Autopilot
on verified addresses. Written 2026-09-06 against `cmn-labs/autogtm` @ `405b1d0`.

Context and the decision behind it: `docs/autogtm-evaluation.md`.

## Apply

```sh
git clone https://github.com/cmn-labs/autogtm.git && cd autogtm
git checkout 405b1d0            # the commit this was written against
git apply ../docs/patches/autogtm-linkfinder-email.patch
```

Then run `migrations/20260906_email_provenance.sql` and set `LINKFINDER_API_KEY`.

## What it changes

| File | Change |
| --- | --- |
| `packages/autogtm-core/src/clients/linkfinder.ts` | **new** — LinkFinder API client: single POST with a `type` discriminator, 429 backoff (1s/2s/4s), async job polling, upstream-error detection |
| `packages/autogtm-core/src/ai/resolveEmail.ts` | **new** — resolution chain with provenance |
| `packages/autogtm-core/src/db/autogtmDbCalls.ts` | **the gate** — `getEligibleLeadsForAutoAdd()` now requires `email_verified = true` |
| `apps/autogtm/src/inngest/functions.ts` | call site swapped; provenance persisted; log line carries source/verified/credits |
| `migrations/20260906_email_provenance.sql` | **new** — `email_source`, `email_verified`, `email_credits_spent` + sweep index |

`ai/extractEmail.ts` is kept, not deleted — it becomes the last-resort fallback and its
output is always marked `verified: false`.

## Resolution order

| Step | Source | Credits | `verified` |
| --- | --- | --- | --- |
| 1 | address already on the lead | 0 | **false** |
| 2 | LinkedIn URL -> `linkedin_profile_to_email` | **10** | true |
| 3 | name (+title) -> `lead_full_name_to_email` | **7** | true |
| 4 | LLM scrape of Exa data (upstream path) | 0 | **false** |

Step 1 is deliberately unverified: an address that arrived with the lead has never
been checked either, so it gets the same human review as a guess.

A non-retryable LinkFinder error (401 bad key, 402 out of credits) **throws** rather
than falling through to step 4. Silently degrading to a guess is the exact failure
this patch exists to prevent.

## Cost

Worst case per lead is **17 credits** (LinkedIn lookup misses, name lookup runs).
Typical is 10. At Autopilot's default 5 leads/day: ~50-85 credits/day, 1,500-2,550/month.
Credit figures come from `integrations/catalog/operations.json`, which is authoritative
and confirms CLAUDE.md — see the discrepancy note in `docs/gtm-mcp-swap-map.md`.

## Known limitation: no company name

AutoGTM's enriched-lead schema has **no company field** — it is creator-shaped
(`total_audience`, `content_types`, `promotion_fit_score`). So step 3 passes name and
job title but not company, and company is "much the strongest signal after the name"
per the operations catalog. Step 3 will underperform its normal hit rate until a
company field is added to the schema and the enrichment prompt.

## Verification status — read this before trusting it

- Both new files **typecheck clean** under `tsc --strict` in isolation.
- **Not built and not run.** `npm install` is blocked in this sandbox, so there is no
  full-project typecheck, no lint, and no test.
- **No LinkFinder call was ever made.** The request/response shape is derived from
  `integrations/zapier/lib/linkfinder.js` and `integrations/catalog/operations.json`,
  not from a live call. The async-poll branch in particular is inferred — the Zapier
  client polls `GET /status/{job_id}` and reads `status` / `result`, and
  `readScalar()` assumes the same envelope.
- Verify against one real lead with a known-good LinkedIn URL before enabling
  Autopilot.
