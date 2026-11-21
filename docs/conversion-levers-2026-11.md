# Conversion x2, churn ÷2 — the three levers (21 Nov 2026)

Owner, 21 Nov: "double conversion and halve churn; everyone must understand we
do lists; keep every leaver". Decisions from that conversation:
- **No forced example lookup** after signup: people must enter their own data
  and pick their own search.
- **No invented leads** to manufacture a list need: lists come from people who
  have one; the job is that every user knows we do lists and that list-holders
  reach the list path.
- **Annual first** at the post-list paywall, **not** the lifetime deal (it would
  kill annual). Lifetime only for Black Friday and as a save offer to leavers.
- Country block at signup stays (owner: those countries don't pay).

## Funnel when this started (PostHog, 60 d, paying countries)

| Step | People |
| --- | --- |
| Signups | 300 (~35/week) |
| Tried a lookup or CSV | ~60% (75% in Sept) |
| Uploaded a list | 33 (11% of signups) |
| Checkout started | 8 |
| Paid | 6 |

First lookups of free accounts, 30 d (`enrichment_history`, rn=1): LinkedIn→email
55% found (29), email→LinkedIn 72% (18), name→LinkedIn 78% (18),
**LinkedIn→phone 18% (17)** — the US/CA profiles hit, the rest miss.
Single-result panel: shown to 63 people, CSV clicked by 3 (30 d).

## Shipped 21 Nov

| Lever | Change | Where |
| --- | --- | --- |
| Lists | Start screen: the grey "Have a list?" line became a card ("Got a list? Enrich every row at once" + Upload my list) under the search cards | `app.html` `.qs-list-card`, event `onboarding_route_picked {source: list_card}` |
| Lists | Single result: drop a CSV/Excel file straight on the result panel, same search pre-set | `nsHandlePanelFile`, event `next_step_clicked {route: csv_drop}` |
| Lists | Email 2 days after the first single result: "got the rest of the list?", exits on CSV upload or payment, once per person | PostHog workflow **31** (`01a1fd81-586f-0000-9eac-d7504b4d2e92`), active |
| Churn | List-stopped banner leads with annual (-40%, billed yearly), monthly and the pack as the other buttons | `lfGateButtonsHTML`, `bulk_gate_direct_checkout {choice: annual}` |
| Churn | Cancel flow step 3: pay-per-list (PAYG packs) and the BF lifetime deal (until 1 Dec, allowlists the leaver) | `account.html` `stayOffer`, RPC `ltd_allow_leaver`, see `docs/churn-pause.md` |

Already in place before: workflow 7 (bulk email 24 h after Google signup),
paste-a-list, sample list, onboarding checklist (+50 credits for a first list),
pause in the cancel flow.

## Worldwide phone: provider options (not integrated yet)

Current phone step finds US/CA numbers only. ColdIQ mobile-finder benchmark
(July 2026, 53 contacts, ±15 pts): Prospeo 93% EU / 98% US, $0.39 per found;
FullEnrich 96%/98%, $0.55 (async ~2 min); Kaspr 66% EU, $0.50; Datagma 55% EU,
$0.35; LeadMagic 14% EU ($0.12, US-only in practice). An Apify actor
(`code_crafter/mobile-finder`, $0.04 per found, source not stated) was not
tested: sending real users' searched profiles to an unvetted third party was
refused by the session's safety check.

Economics: a phone lookup is 50 credits = ~$0.49 on Starter monthly, ~$0.29
Starter annual, ~$0.25 Pro, ~$0.18 Scale, $1.25 on a $25 pack. A $0.39 fallback
is profitable on Starter and packs, about break-even on Pro, a loss on Scale and
annual. Owner decision needed: which provider (account + key in Supabase
secrets by the owner), and whether a non-US phone costs more credits.

## Still open (owner steps)

- Deploy `workers/dodo-webhook` (wrangler + two secrets): until then portal
  cancels and failed cards are invisible, so churn is measured blind.
- One-off email to existing free users in paying countries who never uploaded a
  list ("we enrich whole lists"): not sent; mass send needs the owner's go and
  should not collide with the Black Friday send on 27 Nov.

## Re-check on 21 Dec 2026

- `onboarding_route_picked` source `list_card`, `next_step_clicked` route
  `csv_drop`, `csv_uploaded` per week (was ~3–5/week from paying countries).
- Workflow 31: sends, opens, `csv_uploaded` within 14 d.
- `bulk_gate_direct_checkout` by choice; share of annual among new payments.
- `retention_offer_clicked`, `retention_pause`, cancels.
