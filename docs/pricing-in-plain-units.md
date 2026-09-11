# Pricing in plain units, and a Talk-to-sales door on the homepage

**Date:** 2026-09-11 · **Sources:** PostHog 263837, Supabase `snxhsboboatjywgwdeds`,
`app.html` `creditCosts`, `docs/sales-led-motion.md`, `docs/10k-mrr-plan.md`
(scalelinkfinderai)

## The complaint, verbatim

> people come to me asking questions like "how much for 100 phone"

That is a pricing page failing at its one job. The plan cards said
"5,000 credits/mo ≈ $0.0098/credit", and nowhere on the card did it say that a
phone number costs 50 of those credits. So the person had to find the credit
table, do the division, and most did not: in the last 60 days **293 people
opened the pricing modal and 65 picked a plan (22%)**. The step that leaks is
the card explaining itself.

Worse, the site disagreed with itself:

| Surface | What it said | Truth |
| --- | --- | --- |
| Pricing page FAQ "What counts as 1 credit?" | phone = 1 credit, 2 credits per lead, Starter ≈ 2,500 leads | phone = 50, email = 10 |
| Pricing page explainer, three lines up | phone = 50 credits, 20 per lead, Starter ≈ 250 leads | correct |
| Out-of-credits modal | "Starter gives 60,000 credits/mo for $49 — 24× cheaper per credit" | 5,000/mo (60,000 is the annual grant); ~2× cheaper |
| Account page plan grid | top tier called "Enterprise" | renamed Scale everywhere else on 2026-09-10 |

## The numbers, once

Credit costs as charged by the app (`creditCosts` in `app.html`): phone 50,
email 10, profile enrichment 10, LinkedIn URL from email 5, LinkedIn URL from
name 1, company lookups 1.

| Plan | Price | Credits / mo | Phone numbers | Emails | LinkedIn URLs |
| --- | --- | ---: | ---: | ---: | ---: |
| Starter | $49 ($29 annual) | 5,000 | **100** | 500 | 5,000 |
| Professional | $89 ($53 annual) | 20,000 | **400** | 2,000 | 20,000 |
| Scale | $149 ($89 annual) | 50,000 | **1,000** | 5,000 | 50,000 |
| Enterprise | from $999, quoted | 250,000+ | 5,000+ | 25,000+ | — |
| Pack Small | $25 once | 1,000 | 20 | 100 | 1,000 |
| Pack Medium | $75 once | 3,500 | 70 | 350 | 3,500 |
| Pack Large | $200 once | 10,000 | 200 | 1,000 | 10,000 |

So "how much for 100 phone numbers a month?" is **Starter, $49**, about 49¢ a
number (29¢ on annual). That sentence is now the first FAQ on the pricing page
and in its JSON-LD, so the answer boxes and AI assistants that read the page
get it too.

## What shipped

**`js/lf-plan-value.js`** — one module that owns the conversions. Loaded by
`pricing.html`, `app.html` and `account.html` so all three say the same thing.
`allowance(credits)`, `recommend({phones, emails, linkedin})`,
`allowanceHTML(...)` for the card block, `mountCalculator(el, opts)` for the
three-input calculator. If a credit cost changes in `app.html`, change it here
or the card stops matching the meter.

**Pricing modal (`app.html`, `account.html`)** — every card now carries an
"Enough for, each month" block: 📞 100 phone numbers *or* ✉️ 500 emails *or* 🔗
5,000 LinkedIn URLs. Credits and price-per-credit drop to a footnote. Packs get
the same block. Above the grid, the calculator: type 100 phones, get "Starter —
$29/mo billed annually · $49 monthly · about 29¢ per phone number", a Get
Starter button that goes straight to the existing checkout, a one-off pack
alternative, and a Talk-to-sales link. It opens by default when someone is
browsing plans, and stays collapsed behind a toggle when a gate already knows
the list size (`bulk_credits_gated`, `export_gated`) or for existing
subscribers. Header gets a **Talk to sales** button next to the toggle. The
account page footer `mailto:` is replaced by the calculator toggle and the
sales form.

**Pricing page** — same blocks on the cards and packs, the calculator above the
explainer, the contradictory FAQ rewritten, the "How much for 100 phone
numbers?" question first, a Talk-to-sales button in the header and a pill in
the hero routes.

**Homepage** — sales-led on the buyer's path, self-serve everywhere else:
- **Talk to sales** as a secondary hero CTA, in the header (hidden under
  1240px where it does not fit), in the final CTA band with "Buying for a
  team? A 15-minute call covers volume pricing, invoicing and setup with your
  CRM."
- A new **"What $49 a month actually buys"** section before "Up and running in
  minutes": four cards (Starter / Professional / Scale / Enterprise) in phone
  numbers, emails and LinkedIn URLs, with Enterprise going to the sales form.
  Nobody has to open the pricing page to learn what a plan is.
- The header at 1024–1280px used to overflow horizontally with the nav; the
  nav gap now tightens under 1400px and again under 1100px, and the mobile
  header buttons no longer push the page 48px wider than the screen (that one
  was pre-existing).

All sales CTAs go to `/talk-to-sales`, which writes the lead row before the
Calendly redirect (`docs/sales-led-motion.md`). They carry
`data-lf-sales-cta` so `lf-highticket-cta.js` and PostHog see them as one
family.

## Events added

- `pricing_calculator_used` — `source` (`pricing_page` / `app_modal` /
  `account_modal`), `phones`, `emails`, `linkedin`, `credits`, `recommended`
  (plan key or `enterprise`). Fires once per distinct input triple.
- `pricing_calculator_cta_clicked` — `source`, `action` (`plan` / `pack` /
  `enterprise`), `recommended`, `credits`.
- `pricing_calculator_toggled` — `open`, `page`.
- `sales_cta_clicked` — `source` (`home_header`, `home_hero`, `home_glance`,
  `home_final`).
- `home_glance_plan_clicked` — `plan`.
- `enterprise_cta_clicked` gains sources `pricing_modal_header`,
  `pricing_calculator` (app and account) and `pricing_calculator` on the
  pricing page.

## What to watch

The funnel that matters is `pricing_modal_opened → plan_selected` (22% over
the last 60 days). If the calculator is doing its job that number moves in the
first two weeks, and `pricing_calculator_used` with `recommended = enterprise`
becomes a lead list: anyone typing more than 1,000 phone numbers a month has
told you their volume before the call.

## Why this is not the whole answer

`docs/10k-mrr-plan.md` (scalelinkfinderai repo) already has the rest of the
diagnosis and it still holds: checkout stalls (`plan_selected →
checkout_session_created` was 65 → 16 in the same window), 24 of 31
subscribers dormant, and 69% of signups from countries that produced 3 payers
in total. Clearer pricing raises the ceiling on the step it touches. It does
not fix a checkout that times out.
