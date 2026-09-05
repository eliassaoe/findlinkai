# Campaign state — 22 Aug

## LIVE (sending to real users now)

| # | Workflow | id | Fires |
|---|---|---|---|
| 1 | Checkout recovery — picked a plan, never paid | `01a02578-9f9e-0000-d4c0-f57a811dca80` | `plan_selected` / `checkout_redirect_started` → +2h, then +3d |
| 2 | Credit wall — ran out, never saw pricing | `01a02579-2580-0000-52d3-689a36d8390d` | `credits_exhausted` / `bulk_results_gated_shown` → +30m |
| 3 | New user activation — welcome, rescue, upgrade | `01a0257a-401d-0000-e2a2-4138ca3d4e4c` | `signup_success` → +20m, +1d if no lookup, +6d upgrade |

All three are **forward-only**: they fire on events from now on, not on history. No
blast went out to the existing 1,546 accounts. Blast radius on day one is roughly
17 signups/day plus whoever hits a credit wall or abandons a checkout.

Engagement events were switched on at the same time
(`workflows_config.capture_workflows_engagement_events: true`, consent mode
`opt_out`), so `$workflows_email_*` starts accumulating from today. It does not
backfill — today is day zero for the optimisation loop.

## LIVE — the rest

| # | Workflow | id | Notes |
|---|---|---|---|
| 4 | Win-back broadcast | `01a0257d-5b54-0000-42a7-fcd74f8a0a1d` | **Enabled but NOT dispatched.** Batch triggers do not fire on enable. Gated on bounce data — see DELIVERABILITY.md. |
| 5 | Pricing seen, no payment — offer a call | `01a02878-e5a4-0000-1d67-1ee8523b3bcd` | Ready. `pricing_modal_opened` → +3d → **a 15-minute call, no credits granted** (see below), booking at `calendly.com/hamoureliasse/linkfinder-ai`. Payers exit via the conversion goal. |
| 6 | Used it, never found the API or MCP | `01a0287a-3028-0000-63cb-6ab00b72bea6` | Ready. `enrich_started` → wait 48h for `api_key_copied` or `mcp_url_copied` → email only if neither happened. |

Both 5 and 6 have had the `html` re-render applied and their sender verified, and both
are now in `variants.json` with four variants each, so the Monday loop can see them.

**Campaign 5 deliberately mirrors the product.** `app.html` runs a sales-intercept modal
making the identical offer, so the duration, what is promised, and the booking link must
stay in step with it. Both currently book `calendly.com/hamoureliasse/linkfinder-ai`.

**The call grants no credits — changed 2026-09-05.** It used to pay 1,000 credits for
showing up, in both the modal and these emails. Handing out credits to fill a calendar
devalues the credit, which is the unit the whole product is priced in, so the offer is
now the call on its own merits: fifteen minutes, no pitch, bring a real list and we run
it together. **The G2 review still pays 1,000 credits** (`user_task_completions`) — that
one buys a durable asset, not an hour.

If you reinstate a credit grant here, change `app.html` in the same commit or the modal
and the email will contradict each other. The sites in `app.html` are the
sales-intercept modal, the `cimRescuePick` branches, `cimPriceFallbackHtml`, and the
`first_success` / `bulk_halfway` call prompts.

### Calendly link state — verified 2026-09-02 against live PostHog

**One booking link for calls: `calendly.com/hamoureliasse/linkfinder-ai`.** 204 links in
this repo, everywhere a human is asked to book time. Do not introduce a second one.

Two events were retired into it on 2026-09-02:

| Retired event | Was used by | Links moved |
| --- | --- | --- |
| `intro-call` | The "Book a Call" footer item on every marketing and blog page, the enterprise CTA in `pricing.html`, the JS-assigned CTA in `best-enrichment-api.html`, and `FOUNDER_CALL_CALENDLY` in `app.html` (the "Can I steal 15 minutes?" corner card) | 183 |
| `compensated-interview-unlimited-leads-clone` | `app.html` sales-intercept modal + `CIM_CALL_URL`, `account.html`, `account-beta.html`, `crm-sync.html`, `linkfinder-vip.html` (7), `support-worker/worker.js`, `replace_footer.py`, `tests/credit-wall.test.mjs`, and the `pricing_call` / `credit_wall_2` / `crm_audit` variants in `variants.json` (6) | 21 |

The one link deliberately left alone is `AI_SDR_CALENDLY` in `app.html` — the AI SDR
request form still books `offre-linkfinder-ai-clone`. That is a separate flow, kept
separate on purpose; the VIP *campaigns* moved off that event on 2026-08-30 but the
in-app form did not.

**Every PostHog email campaign books `linkfinder-ai`.** Verified by reading the live
workflow bodies: VIP arm A, VIP round 2, VIP one-off (draft), VIP continuous (draft),
campaign 5, and the archived AEO listicle campaign. No other campaign carries a Calendly
link at all.

⚠️ **The archived AEO campaign `01a038b0-a39c-0000-6829-912e9f901270` has an unpublished
draft (staged 2026-08-26) whose four emails still book
`compensated-interview-unlimited-leads-clone`.** Its live version is correct and it is
archived, so nothing sends — but publishing that draft would reintroduce the retired link.
Discard the draft or repoint it before ever un-archiving.

The 2026-08-30 "CALENDLY CONSOLIDATED" note in the PostHog workflow descriptions claimed
this was already true of "the product, the marketing site and every campaign". It was only
ever true of the campaigns; the repo carried 204 links to the two retired events until
2026-09-02.
