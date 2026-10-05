# Lifetime deal campaign — October 2026

A one-week lifetime deal (LTD), sold by email only to free accounts that have
never paid, in high-income countries. Built 5 Oct 2026.

**Nothing has been sent yet.** The workflow is a draft and the page is not on
`main`. The launch checklist at the bottom is the full list of what is left.

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
- **14-day refund.** A refund ends the plan: set `ltd_monthly_credits` back
  to null on the user (refills stop). Remove the granted credits by hand.
- **Never sold to someone who has paid** — except churned customers invited
  back on purpose (`ltd_allowlist`). The audience excludes payers, and the page
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

## How a payment becomes a lifetime account

The LTD state lives **on the user row**, `linkfinderai_users.ltd_monthly_credits`.
There is no separate fulfilment service.

1. The page sends the buyer to Dodo's static payment link for the tier, with
   `metadata_user_token` when they are logged in on that browser.
2. **The existing Dodo flow (`dodo-webhook-handler`) credits the payment** like
   any other, and for the two LTD products also sets `ltd_monthly_credits` =
   2500 (Tier 1) or 7500 (Tier 2) on the user. That one column is the only
   thing it has to know about.
3. Supabase does the rest:
   - trigger `ltd_on_grant` stamps `ltd_topup_at` and captures
     `ltd_purchased` (with revenue) to PostHog, which stops workflow 28 for the
     buyer and feeds the scoreboard;
   - cron `ltd-monthly-topup` (daily, 03:17 UTC) raises the balance up to the
     allotment once a month (`ltd_monthly_topup`);
   - `ltd_public_state()` counts seats from the column, `ltd_eligibility()`
     reads it.

```
workflow 28 ──email──▶ /lifetime-deal ──▶ Dodo payment link
                          │ ltd_public_state(), ltd_eligibility(token)
                          ▼
            Dodo ──▶ dodo-webhook-handler (existing) ──▶ credits += N, ltd_monthly_credits = N
                                                             │ trigger ltd_on_grant → PostHog ltd_purchased
                                                             ▼
                                         pg_cron ltd-monthly-topup → refill monthly
```

| Piece | Where |
|---|---|
| Audience table + rebuild function | `supabase/migrations/20261005210000_ltd_campaign_audience.sql` |
| Tiers, settings, cron | `supabase/migrations/20261005211000_ltd_fulfillment.sql` |
| **The final shape**: user-row columns, trigger, top-up, seats, eligibility, allowlist | `supabase/migrations/20261005230000_ltd_on_users_table.sql` |
| Sales page | `lifetime-deal.html` (noindex, `NOINDEX_ONLY` in `gen_sitemap.py`, linked from nowhere) |
| Emails | PostHog workflow **28** `01a10e05-0773-0000-3299-8f139fd83adf` (draft) |
| Cohorts | `616268` wave A, `616269` wave B (static, 5 Oct) |
| Warehouse table | `postgres_ltd_campaign_audience` (PostHog Postgres source, 6-hourly) |
| Scoreboard | PostHog insight `sIZUtCst` "LTD launch — scoreboard" |

Tested on the live database inside rolled-back transactions: setting the
column stamps the refill clock and takes a seat, the page sees `has_ltd`, no
double refill the same month, a balance of 100 is refilled to 2,500 after a
month, and clearing the column stops refills.

**Superseded, left unused:** an earlier version fulfilled through its own
edge function (`ltd-webhook`, never given a secret, answers 503), a
`ltd_purchases` table and claim codes (`ltd_fulfill`, `ltd_reverse`,
`ltd_claim`, workflow 29 archived). None of it ever took a payment. The
earlier migrations stay as the record of what was applied.

## Win-back: churned subscribers

The same deal, offered to people who cancelled a subscription. From Dodo's
subscription list (5 Oct): 8 "Annulé". Excluded the founder's own account,
`t80635019@gmail.com` (still on auto top-up, so still a customer) and
`gdloi619g1@dayingjischool.org` (throwaway domain, failed annual attempts).
"Échoué" and "En attente" never paid and are not churn.

The 7 left are in `ltd_allowlist`, which is what lets the page sell to them
despite their payment history. Only 2 are PostHog persons
(`jmichaud@endhunger.com`, `j.plakhotniuk@devotedstudios.com`, both already in
workflow 27), and `richard@verisq.ai` / `jimmy@brightmove.com` have no account
under that email. So this is a **personal send from the founder's inbox**, the
same call as `docs/dfy-activation-campaign.md`: seven people who paid once
deserve a person, not a broadcast.

> **Subject:** a way back to LinkFinder, without a subscription
>
> Hi,
>
> You had a LinkFinder subscription and cancelled it. Fair enough. Paying
> every month for a tool you need in bursts is hard to justify.
>
> So this week I'm offering past customers something I have never sold
> before: LinkFinder for life, paid once.
>
> - $149 once: 2,500 credits refilled every month, forever
> - $299 once: 7,500 credits every month
>
> Nothing renews and nothing expires. When you're not prospecting it costs you
> nothing; when a campaign comes around, the credits are there. And if a month
> needs more, pay-as-you-go packs go on top, also one-off.
>
> https://linkfinderai.com/lifetime-deal?utm_source=email&utm_campaign=ltd_winback
>
> It closes in 7 days. If you'd rather tell me why you left, I read every reply.
>
> Eliasse

Log in to LinkFinder with the address you have on file first: the page reads
your account to unlock the offer. For Richard and Jimmy, whose account email
differs, ask them to reply so the purchase can be attached by hand.

### The emails

Five plain founder-style emails from `support@linkfinderai.com`, message
category *marketing* (one-click unsubscribe), paced at 200/hour, exit on
`ltd_purchased` (from the trigger) or `checkout_payment_success`.

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

1. ✅ Dodo products created (`pdt_0Np6hfk426N6l9EhVrFYO`, `pdt_0Np6hjktXBH06Wqf5OT5o`), ids in `ltd_tiers`.
2. ✅ (per the founder) `dodo-webhook-handler` credits both products. **Confirm
   it also sets `ltd_monthly_credits`** (2500 / 7500) — without it nothing
   refills and no seat is counted.
3. **Merge this branch to `main`** so `/lifetime-deal` goes live.
4. **Buy it yourself** on a free test account: credits +2,500,
   `ltd_monthly_credits = 2500`, `ltd_topup_at` set, scoreboard shows a
   purchase. Then reset that account (`ltd_monthly_credits = null`, credits back).
5. **Refresh the audience** if more than a day has passed:
   `select refresh_ltd_campaign_audience();`, reload the PostHog schema, and
   re-create both cohorts from their queries (they are static snapshots).
6. **Set the deadline** right before dispatching wave A:
   ```sql
   update ltd_settings set ends_at = now() + interval '7 days 12 hours';
   ```
7. **PostHog → workflow 28:** test-run, enable, dispatch (wave A).
8. A few hours later, if bounces < 2% and no spam complaints: change the
   trigger cohort to `616269` and dispatch again — **within 6 hours of wave
   A**, so email 5 ("last few hours") still lands before `ends_at`.
9. Send the win-back email above to the 7 churned customers, the same day.

## Running it

- **Buyer paid with an email that has no account:** they reply or write to
  support. Set it by hand on the right account:
  ```sql
  update linkfinderai_users set credits = coalesce(credits,0) + 2500, is_unlimited = true,
         ltd_monthly_credits = 2500 where token = '<their token>';
  ```
- **Refund:** `update linkfinderai_users set ltd_monthly_credits = null where token = '…';`
  and take back the credits if appropriate.
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
  The refill raises the balance *up to* the allotment, so pack credits on top
  are never taken, but a refund has to be sorted out by hand.
