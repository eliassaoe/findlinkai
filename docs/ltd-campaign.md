# Lifetime deal campaign — October 2026

A one-week lifetime deal (LTD), sold by email only to free accounts that have
never paid, in high-income countries. Built 5 Oct 2026.

**Nothing has been sent and nobody can buy yet.** The workflow is a draft, the
tiers have no Dodo product ids, and the page is not on `main`. The launch
checklist at the bottom is the full list of what is left.

## The offer

| Tier | Price | Credits | Dodo product |
|---|---|---|---|
| Lifetime Core (`ltd_core`) | $149 once | 2,500 / month, for life | `pdt_0Np6hfk426N6l9EhVrFYO` ("Lifetime Deal Tier 1") |
| Lifetime Plus (`ltd_plus`) | $299 once | 7,500 / month, for life | `pdt_0Np6hjktXBH06Wqf5OT5o` ("Lifetime Deal Tier 2") |

- **Monthly refill, no rollover.** Each month the balance is raised *up to* the
  allotment (`greatest(credits, allotment)`). Unused lifetime credits never
  stack, and credits bought separately are never taken away.
- **Capped at 150 seats** (`ltd_settings.seat_cap`), closes on
  `ltd_settings.ends_at`. Both are real: the page reads them live, and Email 3
  says "capped at 150".
- **14-day refund.** A refund or dispute ends the plan and takes back the
  current month's grant (`ltd_reverse`).
- **Never sold to someone who has paid.** The audience excludes them, and the page
  checks the visitor's own token (`ltd_eligibility`) and hides the buy
  buttons for any account that has ever paid or already holds an LTD. A
  forwarded email cannot turn into a refund request from a subscriber.

Prices, credits, the cap and the deadline all live in Supabase tables, so
changing them is an `UPDATE`, never a deploy.

## Who gets it, and why the list is small

| Step | People |
|---|---|
| `linkfinderai_users` | 32,561 |
| never paid (no sub, no pack, no customer id, no plan) | 32,430 |
| **confirmed in `auth.users`** (the only real signal, `docs/email-verified-is-wrong.md`) | 2,654 |
| minus balances above the free grant, legacy payers, payers' colleagues, us | **2,617** → `ltd_campaign_audience` |
| in PostHog with a high-income-country geo, no payment event ever | **552** |
| — wave A: ran at least one lookup (cohort `616268`) | 350 |
| — wave B: never ran a lookup (cohort `616269`) | 202 |
| of the 552, US + UK | 244 |

High-income list: US, GB, CA, AU, NZ, IE, DE, FR, NL, BE, LU, CH, AT, SE, NO,
DK, FI, IS, IT, ES, PT, JP, SG, HK, IL, AE, KR, QA.

The first back-of-envelope ($10k–$60k) counted the 32k accounts. ~70% of them
were never verified and many are signup farms, so they were never a sendable
list. **Revised estimate:**

| | wave A conv. | wave B conv. | buyers | cash (avg ~$186) |
|---|---|---|---|---|
| Low | 2% | 0.5% | ~8 | ~$1.5k |
| Base | 3.5% | 1% | ~14 | **~$2.6k** |
| High | 6% | 2% | ~25 | ~$4.6k |

Before Dodo's fees. Opens and clicks measure nothing here: PostHog flags
email opens and clicks as bot traffic (`docs/revenue-levers-2026-08.md`).
**`ltd_purchased` is the metric.**

## Who gets the plan

Nobody has to be logged in to pay. The purchase lands on an account in one
of three ways, in this order:

1. **Logged in on this browser** — the page passes the account token to Dodo
   (`metadata_user_token`), so the plan attaches instantly.
2. **Not logged in, paid with the account's email** — `ltd_fulfill` matches
   the Dodo customer email to `linkfinderai_users.email`. Instant.
3. **Email matches no account** — the purchase is stored `unmatched` with a
   one-time code (`LTD-` + 10 characters). PostHog workflow **29** emails it
   to the payer. They log in (or sign up), open
   `/lifetime-deal?code=…#claim` and press Claim; `ltd_claim` attaches it to
   the logged-in account. The code works once, and not after a refund.

This is deliberately separate from the old `/redeem-code` page and its
`linkfinder-redeem` worker. It also doesn't use `upgrade-intent`: that worker
only *reads* subscriber status for the app, and the app keeps working
for LTD buyers because they carry `is_unlimited = true` like pack buyers.

## How it fits together

```
PostHog workflow 28 (draft) ──email──▶ /lifetime-deal?utm_source=email&utm_campaign=ltd_launch&utm_content=eN
                                          │  reads ltd_public_state()  (tiers, seats, deadline, product ids)
                                          │  reads ltd_eligibility(token)  (hide buy for payers)
                                          ▼
                       Dodo static payment link  checkout.dodopayments.com/buy/<pdt>
                         metadata_user_token, metadata_attribution_source/campaign
                                          │
                       Dodo webhook ──────▼─────────────────────────────
                       supabase/functions/ltd-webhook (verify_jwt off, Standard Webhooks signature)
                         payment.succeeded → ltd_fulfill()  → credits + is_unlimited + ltd_purchases row
                         refund/dispute    → ltd_reverse()
                         → PostHog: ltd_purchased / ltd_purchase_unmatched / ltd_refunded (with revenue)
                                          │
                       pg_cron 'ltd-monthly-topup' daily 03:17 UTC → ltd_monthly_topup()
```

| Piece | Where |
|---|---|
| Audience table + rebuild function | `supabase/migrations/20261005210000_ltd_campaign_audience.sql` |
| Tiers, settings, purchases, fulfil/reverse/top-up, public RPCs, cron | `supabase/migrations/20261005211000_ltd_fulfillment.sql` |
| Claim codes for unmatched buyers (`ltd_claim`) | `supabase/migrations/20261005220000_ltd_claim_codes.sql` |
| Webhook | `supabase/functions/ltd-webhook/index.ts` → `https://snxhsboboatjywgwdeds.supabase.co/functions/v1/ltd-webhook` |
| Sales page | `lifetime-deal.html` (noindex, `NOINDEX_ONLY` in `gen_sitemap.py`, linked from nowhere) |
| Emails | PostHog workflow **28** `01a10e05-0773-0000-3299-8f139fd83adf` (campaign, draft) and **29** `01a10e12-6019-0000-a90a-d9186bdd40d9` (claim code, draft) |
| Cohorts | `616268` wave A, `616269` wave B (static, 5 Oct) |
| Warehouse table | `postgres_ltd_campaign_audience` (PostHog Postgres source, 6-hourly) |
| Scoreboard | PostHog insight `sIZUtCst` "LTD launch — scoreboard" |

All of it was tested before commit: fulfil, duplicate delivery, unmatched
email, non-LTD product, monthly top-up and refund ran inside a rolled-back
transaction on the live database; the signature check was verified against a
reference HMAC (good / tampered / stale); the page was rendered in Chromium at
1280 px and 390 px in all four states (soon, open, already paid, closed).

### Why its own webhook

The live `dodo-webhook-handler` (Cloudflare, not in this repo) grants pack
credits. The LTD needs a monthly allotment, a seat count and a refund
reversal, none of which that handler knows. `ltd_fulfill` ignores every
product not in `ltd_tiers`, so the two can share Dodo's event stream. **Check
the other way round too** — see step 2 of the checklist.

### The emails

Five plain founder-style emails from `support@linkfinderai.com`, message
category *marketing* (one-click unsubscribe), paced at 200/hour, exit on
`ltd_purchased`, `ltd_purchase_unmatched` or `checkout_payment_success`.

| # | When | Subject |
|---|---|---|
| 1 | day 0 | a lifetime LinkFinder account (this week only) |
| 2 | day 2 | the math on the lifetime deal |
| 3 | day 4 | before you buy the lifetime deal |
| 4 | day 6 | lifetime deal closes tomorrow |
| 5 | day 6.75 | last few hours |

No first names (most accounts have none) and no `email=` in links: an
`email=` parameter puts the visitor into the agency segment
(`js/lf-attribution.js`).

## Launch checklist

1. ✅ *Done 5 Oct, ids written to `ltd_tiers`.* **Dodo → Products:** create two one-time products, "LinkFinder Lifetime
   Core" $149 and "LinkFinder Lifetime Plus" $299. Then:
   ```sql
   update ltd_tiers set dodo_product_id = 'pdt_…' where tier_key = 'ltd_core';
   update ltd_tiers set dodo_product_id = 'pdt_…' where tier_key = 'ltd_plus';
   ```
2. **Check `dodo-webhook-handler`** in Cloudflare grants nothing for an
   unknown product id. If it has a default branch (e.g. treats any payment as
   a pack), an LTD buyer would be credited twice.
3. **Dodo → Webhooks → Add endpoint**
   `https://snxhsboboatjywgwdeds.supabase.co/functions/v1/ltd-webhook`,
   events `payment.succeeded`, `refund.succeeded`, `dispute.opened`,
   `payment.cancelled`. Copy its `whsec_…`.
4. **Supabase → Edge Functions → Secrets:** `DODO_LTD_WEBHOOK_SECRET` = that
   `whsec_…`. Until it is set the function answers 503, so Dodo keeps
   retrying instead of losing a payment.
5. **Merge this branch to `main`** so `/lifetime-deal` goes live.
6. **Buy it yourself** on a free test account (or a 100% Dodo discount code):
   confirm `ltd_purchases` has a row, credits went up by 2,500, the scoreboard
   shows a purchase. Refund it in Dodo and confirm the row says `refunded`.
   Then `delete from ltd_purchases where payment_id = '…'` so it does not
   take a seat.
7. **Refresh the audience** if more than a day has passed:
   `select refresh_ltd_campaign_audience();`, reload the PostHog schema, and
   re-create both cohorts from their queries (they are static snapshots).
8. **Set the deadline** right before dispatching wave A:
   ```sql
   update ltd_settings set ends_at = now() + interval '7 days 12 hours';
   ```
9. **PostHog → workflow 29** (claim code email): enable it. It only fires on a real unmatched purchase.
10. **PostHog → workflow 28:** test-run, enable, dispatch (wave A).
11. A few hours later, if bounces < 2% and no spam complaints: change the
    trigger cohort to `616269` and dispatch again — **within 6 hours of wave
    A**, so email 5 ("last few hours") still lands before `ends_at`.

## Running it

- **Unmatched buyer** (`unmatched_to_fix` on the scoreboard): workflow 29
  has already emailed them a claim code. Only if they write in instead, attach
  it by hand:
  ```sql
  update ltd_purchases set user_token = '<their token>', status = 'active', last_topup_at = now()
   where payment_id = '…';
  update linkfinderai_users set credits = coalesce(credits,0) + <monthly_credits>, is_unlimited = true
   where token = '<their token>';
  ```
- **Close early / extend:** `update ltd_settings set ends_at = …` or
  `seat_cap = …`. The page follows immediately.
- **After the week:** archive workflow 28. `/lifetime-deal` shows "closed" on
  its own once `ends_at` passes. Leave the cron running: it is what honours
  the lifetime promise.

## Known gaps

- **Most of the safe list has no country.** ~2,000 of the 2,617 safe addresses are
  in PostHog; the rest have never been identified there, so they are left
  out rather than guessed.
- **Credit cost per lookup is not known here.** If a credit costs more than
  ~$0.005 in data spend, a fully-used Plus seat stops paying for itself in
  under a year. Check before raising the seat cap.
- **Lifetime credits sit in the same `credits` column as everything else.**
  The refund reversal subtracts the monthly allotment from the whole balance,
  so a buyer who also bought a pack and then refunds the LTD can lose up to
  one allotment of pack credits. Rare; fix by hand if it happens.
