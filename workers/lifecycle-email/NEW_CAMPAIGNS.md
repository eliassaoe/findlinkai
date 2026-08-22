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

## BUILT, NOT ENABLED

| # | Workflow | id | Why it is still a draft |
|---|---|---|---|
| 4 | Win-back broadcast | `01a0257d-5b54-0000-42a7-fcd74f8a0a1d` | A batch of 147 people in one go. Batch triggers do not fire on enable — dispatch is a separate deliberate `workflows-run-batch`. Needs an explicit go, and wave A should be checked for bounces before B and C. |
| 5 | Pricing seen, no payment — offer a call | `01a02878-e5a4-0000-1d67-1ee8523b3bcd` | Ready. `pricing_modal_opened` → +3d → **1,000 credits for 15 minutes** on a call, booking at `calendly.com/hamoureliasse/compensated-interview-unlimited-leads-clone`. Payers exit via the conversion goal. |
| 6 | Used it, never found the API or MCP | `01a0287a-3028-0000-63cb-6ab00b72bea6` | Ready. `enrich_started` → wait 48h for `api_key_copied` or `mcp_url_copied` → email only if neither happened. |

Both 5 and 6 have had the `html` re-render applied and their sender verified, and both
are now in `variants.json` with four variants each, so the Monday loop can see them.

**Campaign 5 deliberately mirrors the product.** `app.html` already runs a sales-intercept
modal making the identical offer — "Book a quick 15-minute call... show up and we'll add
1,000 free credits" — pointing at the same Calendly event. The email is the asynchronous
version of that modal, so the duration, the credit amount and the link must stay in step
with it. They were briefly out of step (the email said 20 minutes and used the generic
`intro-call` link) and that is fixed.

Note the site uses **two** Calendly events: `intro-call` on 188 marketing and blog pages,
and `compensated-interview-unlimited-leads-clone` on the 5 in-product pages
(`app.html`, `account.html`, `account-beta.html`, `crm-sync.html`, `linkfinder-vip.html`).
Lifecycle email talks to people who already have accounts, so it uses the second one.

## STILL TO BUILD

- **7. Power user — 3+ enrichments, never upgraded.** Needs a behavioural cohort as
  a trigger filter, because `three_enrichments_milestone` is misnamed: it fires at
  TEN enrichments, not three (`app.html:4211`). 51 people hit it in 90 days.
- **8. Churn.** Trigger `cancellation_reason_selected`, branch on the reason.
  Deliberately small — see the volume note below.
- **A 4th email in workflow 3**, an education step at +3d, between the rescue and
  the upgrade ask.

## Volumes that set the priorities (90 days)

| Event | People |
|---|---|
| signup_success | 1546 |
| enrich_started | 1213 |
| **pricing_modal_opened** | **347** — and 21 paid |
| api_key_copied | 160 |
| three_enrichments_milestone | 51 (fires at ten) |
| **mcp_url_copied** | **4** |
| cancellation_reason_selected | 14 |
| **subscription_cancelled** | **3** |

Two things fall out of this table. The pricing modal is the biggest single pool of
warm intent in the product and 94% of it goes nowhere, which is why campaign 5
leads. And churn, as a subscription event, barely exists — a churn campaign sends
about one email a month and can never be A/B tested, so it is worth having but is
not worth optimising. The audience that actually *behaves* like churn is the 913
dormant users in the win-back cohorts.

## Every new email step still needs

1. A no-op `update_body` op via `workflows-patch-action-email` — PostHog does not
   render `html` on create, and an email with empty html fails at send time.
2. An entry in `variants.json` with 3-5 variants, so the Monday loop can test it.
   Campaigns 5 and 6 are done: `pricing_call` and `api_mcp`, four variants each.
