# Unverified points in the operation catalog

The integrations were built against `openapi.json`. The build environment has **no
network access to `api.linkfinderai.com`** (the sandbox blocks it), so nothing below
could be settled by making a call. Each needs one live request to resolve.

Ordered by how much damage a wrong guess does.

---

## 1. The Instagram operation has two names, and the sources disagree

| Source | Says | Last touched |
| --- | --- | --- |
| `openapi.json` / `openapi.yaml` (v1.1.0) | `instagram_lookup` | current |
| `api-documentation.html` | `instagram_profile_to_instagram_info` | 2026-08-23 |
| `n8n-nodes-linkfinderai` v0.1.0 (before this change) | `instagram_profile_to_instagram_info` | published |
| `app.html`, `mcp-server/`, `workers/` | no Instagram support at all | — |

Two sources say one thing, one says the other, and the app itself is silent. **The
whole integration stack currently sends `instagram_lookup`**, because the catalog is
generated from the spec.

This is a behaviour change for the published n8n node, which previously sent the other
name. If the docs page is the one that is right, the Instagram operation is now broken
in every integration and was working before.

**To resolve:** `POST /` with `{"type": "instagram_lookup", "input_data": "@nasa"}`.
A `422` means the spec is wrong — fix `openapi.json`, rerun `node integrations/catalog/build.mjs`
and the three platform builds, and everything corrects itself.

## 2. Three operations exist only in the spec

`leads_finder_ai`, `b2b_data_lookup` and `instagram_lookup` appear in `openapi.json`
but in **neither** `app.html`'s `creditCosts` **nor** `api-documentation.html`. They are
exposed by every integration built here, at 1 credit each (the `||1` fallback in
`app.html` would charge that if they are real).

**To resolve:** call each once and confirm it is accepted and priced as expected.

## 3. Result field names are inferred, not observed

`overlay.json` carries a sample output per operation, used for Zapier's field picker,
Make's `interface.imljson`, and the outreach lead normaliser. Those samples come from
`api-documentation.html` and from `app.html`'s own result renderers — **not** from live
responses.

What is known well: results are often a **bare scalar** (`"result": "tesla.com"`), and
employee lists are **camelCase** objects (`name`, `headline`, `email`, `linkedinUrl`,
`company`, `companyWebsite`, …). What is inferred: the exact keys on the two `*_info`
object operations.

`integrations/outreach/lead.mjs` reads both casings for every field, so the outreach
path degrades gracefully. Zapier and Make samples do not — a wrong key shows an empty
field in the Zap editor.

**To resolve:** run one call per operation, then reconcile `overlay.json` and rebuild.
Do this **before submitting to the Zapier or Make marketplaces** — both review sample
output against real responses.

## 4. Instantly's campaign field

`integrations/outreach/destinations/instantly.mjs` sends `campaign`, per Instantly's v2
request body. Instantly's own tooling exposes the same field as `campaign_id`. The rest
of the field names (`email`, `first_name`, `last_name`, `company_name`, `phone`,
`website`) are confirmed against Instantly's endpoint spec.

**To resolve:** push one lead and see whether it lands in the campaign.

## 5. Everything else in `integrations/outreach/destinations/`

Nine of the ten destination adapters are written from each vendor's published API
documentation, not from a live call. The test suite pins the exact request each one
builds, but cannot check that the vendor accepts it. Run one lead through each before
pointing a real campaign at it — **Salesforge** and **EmailBison** most of all.

## 6. Make's IML has not been run in Make

`repeat`, `condition` and `temp` are used per Make's documented semantics, but the app
has never been imported into Make's editor. Import it and run each module once before
submitting.
