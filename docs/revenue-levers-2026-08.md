# Where the next revenue comes from (not YouTube)

**Date:** 2026-08-26 · **Sources:** PostHog 263837, Supabase `snxhsboboatjywgwdeds`
Companion to `GROWTH-STRATEGY-REVIEW.md` and `FUNNEL-REVIEW.md`.

## CORRECTED 2026-08-26 — the offer is direct-to-call by design

An earlier version of this document judged the campaign by pageviews on
`/linkfinder-vip`. That was the wrong yardstick: **that page is retired**, the
focus is done-for-you outbound, and the campaign deliberately sends straight to
a Calendly booking rather than to a landing page. Pageviews are not the metric —
**booked calls are.** Measured on that basis, the finding is worse, not better.

### Every recorded open and click is flagged as automation

PostHog's bot detection classifies **100% of email engagement across every
campaign** as `$virt_is_bot: true`, `traffic_type: Automation`:

| Campaign | Bot-flagged open/click events |
| --- | --- |
| Does ChatGPT recommend you? | 108 |
| your LinkFinder account is ready | 44 |
| there's an API and an MCP server | 20 |
| stop doing these one at a time | 13 |
| you signed up but haven't run anything yet | 9 |
| did the upgrade break for you? | 8 |

There are no non-bot rows. **The 46% open rate is security scanners, not people.**

### The Calendly clicks are scanner prefetches

All five clicks on the booking link, from the 153-recipient send:

    email sent   11:40:40
    click 1      11:40:44   (+4 seconds)
    ...
    click 5      11:41:49   (+69 seconds)

Five clicks from four distinct "people", all inside 70 seconds, the first four
seconds after send. Nobody reads an email and books a call in four seconds.
That is a scanner sweep.

**Human clicks to the booking page: effectively zero. Calls booked: zero.**

*Caveat: PostHog may over-flag email-pixel traffic as automation generally, so
the open-rate reading is suggestive rather than proven. The click timing is
independent evidence and is not ambiguous.*

### And the machine that books calls cannot send

**All 38 Instantly sending accounts are `status: -1` with
`autofix_failed: true`**, many reporting
`EAUTH — can't create new access token for user`; one Gmail account hit
`550-5.4.5 daily user sending limit exceeded`. Warmup scores are 90-100 and the
domains pass MX/SPF/DKIM/DMARC. This is an OAuth reconnection, not a rebuild —
exactly as `OUTBOUND-CRM-AUDIT.md` recorded, and still unfixed.

Campaign statuses confirm nothing outbound has run:

| Campaign | Status |
| --- | --- |
| **Done-for-you outbound — B2B SaaS (G2-sourced)** | **Draft** |
| CRM audit — RevOps / Sales Ops, HubSpot (US/UK) | Draft |
| CA B2B SaaS — Lead Gen Guarantee Offer | Draft |
| SEO/AEO service — B2B SaaS (AI visibility opener) | Draft |
| AEO/SEO — AI visibility check | Draft |
| email marketing PAID credits USED | **Active** (product upsell, not outbound) |

**Five written offers that would book calls have never sent a single email.**
The one active campaign is a product-led upsell to existing users.

### So the call funnel is off at three levels at once

1. Zero send capacity — 38/38 mailboxes dead on OAuth.
2. The DFY campaign has never left draft.
3. The one thing that did go out was a tracked broadcast whose entire
   engagement signal is scanners.

"They are not biting" is not a message-market problem yet. **The offer has not
reached a human in a position to book.**

### Fix order

1. **Reconnect the 38 mailboxes.** Nothing else on this page matters until this
   is done. Capacity waiting on the other side, per `OUTBOUND-CRM-AUDIT.md`:
   9 senders x 20/day = 180/day, ~900 prospects/month on the agency campaign
   alone.
2. **Launch the done-for-you outbound draft.** It is written and sitting at
   status 0.
3. **Stop reading open and click rates.** `OUTBOUND-CRM-AUDIT.md` already sets
   `open_tracking: false, link_tracking: false` for Instantly — correct, and the
   bot data above is why. Measure **replies and booked calls only.**
4. **Instrument the booking.** A booked call is currently invisible: Calendly is
   off-site and nothing reports back. Either redirect Calendly's confirmation to
   a thank-you page on `linkfinderai.com` carrying the UTMs, or send a Calendly
   webhook into PostHog. Until then the call funnel cannot be judged at all.
5. **Ask for a reply, not a click** in email 1 — as the audit already specifies
   ("Want the link?"). Scanners eat clicks; they do not write replies.

## Attribution trap — do not trust the workflow conversion count

PostHog reports 7 `$workflows_conversion` events of type
`checkout_payment_success`. **Six of those seven people paid before they were
ever emailed** — one on 2026-06-08, eleven weeks before the first send.

| First email | First payment | Ordering |
| --- | --- | --- |
| 2026-08-25 | 2026-06-08 | BEFORE |
| 2026-08-25 | 2026-08-03 | BEFORE |
| 2026-08-25 | 2026-08-12 | BEFORE |
| 2026-08-25 | 2026-08-13 | BEFORE |
| 2026-08-25 | 2026-08-13 | BEFORE |
| 2026-08-25 | 2026-08-24 | BEFORE |
| 2026-08-22 | 2026-08-23 | **after** |

Email has driven **one** payment, not seven. The workflow counts any enrolled
person who has ever fired the conversion event.

## Email campaign scoreboard (2026-08-22 to 08-26, 4 days)

| Campaign | Sent | Opens (people) | Real clicks | Conversion |
| --- | --- | --- | --- | --- |
| Does ChatGPT recommend you? | 153 | 68 (46%) | 4 -> calendly | 0 sales |
| account ready / haven't run anything | 152 | 27 | 4 -> /app | activation |
| **stop doing these one at a time** | **54** | **12** | — | **6 `csv_uploaded`** |
| API and MCP server | 46 | 11 | — | 1 `api_key_copied` |
| 1,000 free credits for 15 minutes | 3 | 2 | — | (interview) |

Also: 20 bounces, 4 unsubscribes across all sends.

## The ranked list

### 1. Save the 22 dormant subscribers — highest value, zero new traffic

| Subscribers | Count |
| --- | --- |
| Total | 31 |
| **Active in last 30d** | **8** |
| Dormant 30d+ | 22 |
| Never ran anything | 1 |

**74% of paying subscribers have not used the product in 30 days.** At $62.50
ARPU that is roughly **$1,438/mo of the ~$1,939 MRR sitting on accounts that are
next quarter's cancellations.** Churn is already ~6.5%/mo (~$125 MRR lost per
month). Nothing else on this list protects revenue that already exists.

### 2. Scale "stop doing these one at a time" — the one proven campaign

It produced **6 `csv_uploaded` from 54 sends (11%)** — and CSV/bulk is the
behaviour that predicts payment (bulk users pay at 8.3% vs ~1% baseline, per
`FUNNEL-REVIEW.md`).

**1,319 users have run an enrichment since 2026-05-01 and never uploaded a CSV.**

    1,319 x 11% ~= 145 CSV uploads x 8.3% ~= 12 payers ~= $750 MRR

The email already exists and already works. It has been sent to 54 of 1,319.

*Caveat: 11% comes from 54 sends — a small sample that will regress. Send the
next 200 before trusting the projection.*

### 3. Fix checkout

Since 2026-07-01: `checkout_error` 11, `checkout_page_load_timeout` 11,
`checkout_redirect_stalled` 10, `checkout_abandoned` 13. One user opened **six**
checkout sessions and never paid.

August had **8 payments total**. Recovering two or three is a ~30% month.

### 4. Give the VIP offer distribution, or retire it

The warmest list on the property is people who have already paid: 22 dormant
subscribers + 88 credit-pack buyers. None of them has been sent to the VIP page.
Either link it from a campaign aimed at those 110 people, or stop maintaining it.

### 5. The 88 credit-pack buyers are the most under-worked asset

| | Count |
| --- | --- |
| Credit-pack buyers (`is_unlimited`, no subscription) | 88 |
| **Active in last 30d** | **5** |

They are **~3x the subscriber count** and have already proven they will pay.
Converting 10% to subscriptions is ~9 subs ~= **$560 MRR**.

(Consistent with `CLAUDE.md`: move pack buyers toward subscriptions, never the
reverse.)

## What this adds up to

Levers 1, 2 and 5 together are worth roughly **$1,300/mo in new MRR plus ~$1,400
in protected MRR** — against a current base of ~$1,939. None of them requires a
single additional visitor.

That is the case for fixing the funnel before buying more traffic, restated with
the specific numbers rather than as a principle.
