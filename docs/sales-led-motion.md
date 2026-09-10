# The sales-led motion — Enterprise, Done For You, and where the CTA goes

**Date:** 2026-09-10 · **Sources:** PostHog 263837, Supabase `snxhsboboatjywgwdeds`,
`docs/traffic-capture-verdict.md`, `docs/ai-sdr-offer.md`, `docs/next-step-routing.md`

## The problem, in one number

The most any account could pay LinkFinder AI was **$149/month**. That was the
whole ceiling: three self-serve plans, the largest of them $149, and above it a
`mailto:support@` in the pricing modal's footer.

With 31 subscribers and 89 credit-pack buyers, ARPU cannot be moved far by
conversion-rate work at those prices. It moves by having somewhere above $149
to go, and by having a way to sell it that is not a link to an inbox.

## What shipped

### 1. A fourth tier that is a call, not a checkout

The tier that was called **Enterprise** at $149/mo is now called **Scale**, and
**Enterprise** is a new, quoted tier: no price on the card, `Custom`, "from
$999/month", 250,000+ credits, contracted allocation, 99.9% uptime SLA,
dedicated rate limits, named engineer, invoicing/PO/MSA/DPA/security review.
Its button books a call.

**The plan KEY did not change.** `enterprise` is still the key in `plans[]`
(`app.html`), still the `plan_number` in the database, still the Dodo product,
and still the `?plan=enterprise` sitting in every abandoned-checkout email
already delivered. Only the display name moved. `PLAN_PARAM_ALIASES` now
resolves both `enterprise` and `scale` to the same key, so old links and new
ones both work. Renaming the key would have broken billing to rename a word.

Surfaces:

| Where | What |
| --- | --- |
| `pricing.html` | Scale card renamed, fourth `.sales-led` Enterprise card added, FAQ + JSON-LD updated |
| `app.html` pricing modal | `renderEnterpriseCard()` appends a fourth column; `openEnterpriseCall()` routes to `/talk-to-sales`. The modal's footer `mailto:` is now that call. |
| `talk-to-sales.html` | new — the qualification form both offers land on |

The modal's plans grid went from `repeat(3,1fr)` to `auto-fit`, so four
subscription cards and three PAYG packs both lay out without a hole.

### 2. `/talk-to-sales`, and why it is a form and not a Calendly link

Two offers on one page, switched by `?offer=` — `enterprise` (default) and
`dfy`. Four fields, then the calendar.

**The row is written before the redirect.** This is the same rule as
`ai_sdr_request()` (`docs/ai-sdr-offer.md`): whoever fills in a qualification
form and never books is the warmest untouched lead there is, and capturing on
booking alone makes them invisible. A failed write therefore never blocks the
redirect — the booking is worth more than the row.

New table and RPC: `supabase/migrations/20260910120000_sales_leads.sql`.
`sales_leads` + `sales_lead_request(...)` + `sales_lead_inbox`. It is
anon-callable because the pages that call it are public, so it length-caps every
input, requires an email that looks like one, and allows 5 rows per email per
day. Read it with:

    select * from sales_lead_inbox;

If the visitor happens to be signed in, the function snapshots their segment
(`subscriber, active` · `pack buyer, never activated` · …) plus credits and
enrichment count, so a call can open with the account rather than with a form.

### 3. Done-For-You had no way to book a call

`done-for-you-outbound.html` is the highest-ticket page on the site and it
contained **no booking link at all**, and its sample-list form had
`FORM_ENDPOINT = ""` — so every submission opened the visitor's mail client
with a pre-filled draft that most people never send. Both fixed: the form now
writes to `sales_leads` first and only falls back to `mailto:`, and there is a
"Book the call instead" path in the nav and under the form.

### 4. The CTA on 176 pages, routed by intent

`js/lf-highticket-cta.js`, injected before `</body>` on every marketing page by
`add_highticket_cta.py`. It decides per page:

| Tier | Pages | What it shows |
| --- | --- | --- |
| `sales` | 118 | book-a-call band: Enterprise + "have us run it" + self-serve link |
| `self` | 58 | one quiet line: upload a CSV, free credits, no card |
| `off` | 38 | nothing — pages with their own converting CTA |

**This is the part of the brief that the repo's own data argues against, and
the routing is the compromise.** `docs/traffic-capture-verdict.md` measured
this site's search traffic: the top pages are `/linkedin-email-finder`,
`/linkedin-phone-number-finder`, `/linkedin-search-by-email` and
`/instagram-profile-url-finder` — 7,922 visitors a month whose intent is "do
this myself, cheaply, now". That doc's conclusion, unchanged by anything here:
you cannot sell "don't do it yourself" to an audience defined by wanting to do
it themselves, and volume scales a wrong-audience problem rather than fixing it.

So the high-ticket band goes on the 118 pages read by someone choosing a vendor
or wiring this into a system — API pages, enrichment pages, competitor
comparisons, CRM pages, agency and bulk pages — and the single-lookup tool
pages get the free-trial line instead. `/pricing` is different from either: a
visitor there is already evaluating, which is why the Enterprise card belongs on
it while the Done-For-You *service* stays out of the app's pricing modal.

Placement follows `docs/next-step-routing.md`: an inline band at the end of the
document, never a popup, never sticky. Every interrupt-style prompt measured on
this site converted at ~1%; every surface shown after a result converted at
18–34%.

To move a page: add a pattern to `SALES_PAGES` / `SELF_SERVE_PAGES`, or put
`data-lf-cta="sales" | "self" | "off"` on that page's `<body>`. The attribute
wins, so one page can be flipped without touching the routing.

### 5. Three lifecycle emails, on behaviour rather than on content

Copy in `workers/lifecycle-email/variants.json`, shapes in
`highticket_workflows.py`, created in PostHog as **drafts** (a draft never
runs):

| # | Workflow | Trigger | Offer |
| --- | --- | --- | --- |
| 13 | `01a08a8c-8ec1-0000-cb47-c515a7ed4f10` | checkout started on Scale (`plan_key` `enterprise_monthly`/`enterprise_annual`), +14d | Enterprise |
| 14 | `01a08a8d-6775-0000-9132-f7c9e6035766` | `api_first_call_succeeded`, +7d | Enterprise (the SLA, not the credits) |
| 15 | `01a08a8e-3be5-0000-d891-0dc78ea7f279` | credit pack bought (`payg_medium`/`payg_large`), then 21 days with no `enrich_started` | Done For You |

All three exit on `sales_lead_submitted`, so nobody who books gets the mail.

Two constraints shaped these. PostHog triggers **cannot** express "did event X
N times in M days", and this project has **no `plan` person property** — so
"is on the top plan" is not filterable, and `checkout_redirect_started.plan_key`
is the closest observable proxy for volume there is.

They also do **not** inherit `route_workflows.PERSON_FILTERS`, which narrows to
`signup_method = google`. That guard exists because `email_verified` is
backfilled and untrustworthy (`docs/email-verified-is-wrong.md`). But every one
of these three triggers on an act that verifies an address better than a signup
method does — a completed card payment, or an authenticated API call — and
keeping the guard would have excluded most of the paying base from the only
emails aimed at the paying base.

`sales_lead_submitted` has never fired: `talk-to-sales.html` ships with this
change. Until the page is live the conversion goal simply never matches.

## Before enabling any of it

1. **Settings → Workflows → Engagement events is still off** and does not
   backfill (`workers/lifecycle-email/README.md`). Opens and clicks are not
   recorded for any day it is off, and the Monday optimisation loop reads
   nothing else.
2. **Create the two message categories** — Product & onboarding, Offers &
   upgrades — and put 13/14/15 in Offers. Without categories, unsubscribing
   from an upgrade email silences the welcome email too.
3. **Test-run each workflow** (`workflows-test-run` sends nothing to real
   people), then enable deliberately.
4. **Nothing outbound is staged in Instantly**, by instruction. All 38 sending
   accounts are `status: -1` with `autofix_failed: true`
   (`docs/revenue-levers-2026-08.md`) — an OAuth reconnection, not a rebuild —
   so cold sending cannot run regardless.

## What this is worth, and what would disprove it

The arithmetic is the argument: one Enterprise agreement at the $999/month floor
is worth **6.7 Scale subscriptions**, and one Done-For-You client at the
five-meeting floor is worth **8.4** of them. Against 31 subscribers, two
Enterprise agreements would be a larger line than the entire self-serve base.

That is also the risk. The offers now exist in the funnel; whether anyone buys
them is unproven, and the pricing-modal-mismatch finding in
`docs/traffic-capture-verdict.md` is a real prior against the page-CTA half of
this. What to watch, in order:

| Signal | Read |
| --- | --- |
| `sales_lead_submitted` by `src` | which surface actually produces qualified leads |
| `highticket_cta_shown` → `_clicked` by `tier` | whether the sales band earns its place on the 118 pages |
| `select count(*) from sales_leads where booked` | forms filled vs calls held — the gap is the follow-up list |
| bounce rate on the 118 sales-tier pages | the cost side of the band; if it moves, narrow the list |

If the sales-tier band converts at tool-page rates (~1%) after a few thousand
impressions, the honest move is to cut it back to `/pricing`, the API pages and
the comparison pages, and leave the rest self-serve. The config is one file.
