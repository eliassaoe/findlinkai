# Campaign state — 9 Sep

## DRAFT — created 9 Sep, not enabled (the route campaigns and the idle-credits one)

Built by `route_workflows.py` from `variants.json`; the four-row skeleton is the
same one build_email.py patches, so the Monday loop sees them once enabled.
Background: `docs/next-step-routing.md`. **A draft never runs.** Open each one,
Test run it, then enable — that is a decision, not a default.

| # | Workflow | id | Fires | Exits on |
|---|---|---|---|---|
| 7 | Route: CSV — picked it, never uploaded | `01a084b0-2b74-0000-2123-b3365cace5f5` | `onboarding_route_picked` route=csv → +1h email, +3d email if still nothing | `csv_uploaded` |
| 8 | Route: Google Sheets — never opened the add-on | `01a084ae-e12b-0000-17bf-41cd27bb9d47` | route=sheets → +1h, +3d | `sheets_addon_clicked` |
| 9 | Route: API — no key copied, no call made | `01a084b1-6362-0000-cab5-f9ba8d0ca0e4` | route=api → +1h, +3d | `api_key_copied`, `api_first_call_succeeded` |
| 10 | Route: CRM — HubSpot never connected | `01a084b2-7854-0000-b403-c589239e1475` | route=crm → +1h, +3d (second mail offers the setup call) | `hubspot_connected` |
| 11 | Paid, then went quiet — credits sitting there | `01a084ad-4c2f-0000-222b-5f9f54819516` | `subscription_renewed` / `checkout_payment_success` → wait 20d for any `enrich_started` → email only if none | `enrich_started` |
| 12 | Monthly value receipt — what you found last month | `01a08515-b49a-0000-acba-bb887b5034e9` | `monthly_value_receipt`, captured on the 1st by `workers/monthly-receipt` for every account with something found in the last 30 days → one email, numbers from the event's properties (liquid), button to `/account#what-you-found`, link to `/history` | none (one email; masked 25d per person) |

All five carry the same audience guard as campaign 6 (`signup_method` = google,
`email_verified` is not false) because `email_verified` is not trustworthy for
email signups (`docs/email-verified-is-wrong.md`). Once per person per 30 days.

`onboarding_route_picked` only started firing on 9 Sep (the first-visit route
chooser in `app.html`), so 7–10 will show no volume until real signups pick a
route. 11 fires on renewals, so it has an audience from the day it is enabled.

**Before enabling 12:** deploy `workers/monthly-receipt` (secrets in its
README) and hit `/run?dry=1` once to see the counts — on 9 Sep it listed 600
active accounts, 536 with something found. Then **Test run** the workflow with a
real `monthly_value_receipt` event so the liquid (`{{ event.properties.* }}`,
including the subject) is seen rendering before anyone gets it. The worker
captures nothing until it is deployed, and the draft sends nothing until it is
enabled, so the order does not matter; both have to happen.

Workflow 9's first email was patched on 9 Sep (`text-2` and the plain text) with
one line offering auto top-up for scheduled jobs; `variants.json` matches.

**Before enabling 9:** `api_first_call_succeeded` is fired today by the
Run-it-now buttons only. If the API worker patch in `workers/api-first-call/`
is not deployed, someone who wires the API from their own code without ever
pressing the button will still get email 2. Acceptable but worth knowing.

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
| 5 | Pricing seen, no payment — offer a call | `01a02878-e5a4-0000-1d67-1ee8523b3bcd` | Ready. `pricing_modal_opened` → +3d → **1,000 credits for 15 minutes** on a call, booking at `calendly.com/hamoureliasse/linkfinder-ai`. Payers exit via the conversion goal. |
| 6 | Used it, never found the API or MCP | `01a0287a-3028-0000-63cb-6ab00b72bea6` | Ready. `enrich_started` → wait 48h for `api_key_copied` or `mcp_url_copied` → email only if neither happened. |

Both 5 and 6 have had the `html` re-render applied and their sender verified, and both
are now in `variants.json` with four variants each, so the Monday loop can see them.

**Campaign 5 deliberately mirrors the product.** `app.html` runs a sales-intercept modal
making the identical offer — "Book a quick 15-minute call... show up and we'll add 1,000
free credits". The email is the asynchronous version of that modal, so the duration, the
credit amount and the booking link must stay in step with it. All three currently do:
both book `calendly.com/hamoureliasse/linkfinder-ai`.

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
