# $10 / 300-credit "Pay As You Go Mini" (8 Nov 2026) — DROPPED

**Owner dropped it the same day** ("focus on what can really impact conversion
meaningfully"). Code stays in `app.html` behind `LF_MINI_ENABLED = false`; the Dodo
product exists but nothing links to it. See `docs/paste-a-list.md` for what was
done instead.

**Why:** the first purchase is the hard one. Cheapest option was $25. Owner agreed
to a $10 pack on condition it can't pull buyers down from the bigger packs.

**Correction to the reasoning at the time:** the "599 people hit the free limit"
figure is `free_limit_modal_shown` on the public tool pages (`js/lf-gate.js`) —
that is the *sign-up* gate for logged-out visitors, not a paywall. Inside the app,
new free accounts start with ~50 credits; of 166 matched new accounts in 30 days,
45 were under 10 credits (can't afford a 10-credit email lookup). That is the
real audience for the Mini pack — smaller than first said.

**Guardrails (owner's condition):**
- Shown only to accounts that never paid (`lfMiniEligible()` in `app.html`):
  the credits worker's `is_unlimited`/`has_paid` when sent, else
  `startingCredits < 200` and not a subscriber.
- Only in the out-of-credits popup (`#cimTiers`, tier index 3), preselected
  for eligible accounts. Not on the pricing page.
- A lookup blocked for lack of credits now opens that popup (it used to be an
  alert only): trigger `not_enough_for_lookup`.
- Events: `payg_mini_shown`, then the usual `plan_selected` with
  `plan_key: payg_mini`.

**Dodo:** product `pdt_0NrUVU7FcbHe2odqgY1WA`, "Pay As You Go Mini", $10
one-time, SaaS tax category (tax added on top, like the other products).

**Switched off** (`LF_MINI_ENABLED = false`) until all of this is true:
1. `dodo-checkout` worker (live, Cloudflare) has `payg_mini` in `PRODUCT_IDS`
   and `PACK_CREDITS: 300` — repo copy updated in the same commit, live copy
   must be deployed.
2. The credit grant on payment. Dodo's only active webhook goes to
   `https://scalelinkfinderai-production.up.railway.app/webhook/9ffa2c7e-…`
   — a **second n8n instance** (not `primary-fie`). That workflow must grant 300
   for this product. Check whether it trusts `metadata.credits` (spoofable on a
   direct payment link) or maps the product id.
3. A real $10 test purchase grants exactly 300 credits.

Re-check after 4 weeks: first purchases per month before vs after, and whether
any account that bought Mini later bought a $25+ pack.
