# UPDATE 14 September 2026 - read this first

The verdict table in `docs/checkout-leak.md` now points at its last row. The
premise this ticket needed is established, and the facts below supersede the
"since 13 August" numbers further down.

**Last real customer payments: 23-26 August** (two customers, both via the
normal flow). **Since 27 August: zero.** Renewals of existing subscriptions
still land, so the account is not fully disabled; it is new checkouts that fail.

Every attempt since 27 August, real traffic, looks identical in our analytics:

1. `checkout_worker_request_started` -> `checkout_session_created`
   (`has_checkout_url: true`, `worker_env: live`, host
   `checkout.dodopayments.com`) -> `checkout_redirect_started`. Zero
   `checkout_error`, zero `checkout_stuck_watchdog`. The session is created and
   the browser navigates to it, every time.
2. The customer stays on the Dodo page for a long time - median 87 to 136
   seconds, max 318 - and comes back to `/app` with **no `status` parameter**
   in the URL. So they are not being returned by Dodo's own redirect; they are
   leaving the page themselves after minutes on it.
3. `checkout_abandoned` and the rescue banner fire, and `checkout_payment_page_opened`
   has fired zero times since 27 August.

Before 27 August the failures were different: median 4 seconds on the Dodo
page, i.e. the session was refused on load. Now the page loads and holds a
customer for minutes and still produces no payment. That pattern is a payment
form that renders but cannot complete: a card form that errors on submit, a
missing payment method for the customer's country, or an account-side block
that only surfaces at charge time.

Most recent session ids (all live, all with a valid `checkout_url`, none paid):

    cks_0NnZa5k61rWEcLNfrLIpn
    cks_0NnWkiMB2NHkBTt0aDD7M
    cks_0NnSyw0WXQO3Az3HMOZE8
    cks_0NnShJV4QaVKlh5chILJC
    cks_0NnS9wmVefVjLafcbEpDx

Ask Dodo to open any of these and state, for each: was a payment attempted, and
if so why did it fail (decline code, 3DS outcome, account restriction).

Note: the worker patch in `PATCH.md` was never deployed - `dodo_raw` is `null`
on every redirect event - so we still have nothing from Dodo's side of the
session in our own data. Deploy it before sending if you can; it costs nothing.

---

# Ticket to send to Dodo Payments support

Send to their support channel (dashboard chat, or support@dodopayments.com).
Everything below is evidence already confirmed from our own analytics — no guesses.

---

**Subject: Checkout sessions create successfully (HTTP 200) but no payment has completed since 13 Aug — live mode**

Hi,

Since **13 August 2026, 18:05 UTC** we have taken **zero** payments. Before that date
payments completed normally — 13 August alone had 4 successful payments. Nothing was
deployed on our side that touches checkout: the only change to our app that day was an
unrelated navigation label, and our checkout worker has not changed at all.

**What still works**

`POST https://live.dodopayments.com/checkouts` returns **HTTP 200 with a valid
`checkout_url`** on every single attempt. We know this precisely, because our worker
returns a 502 to the browser on any non-2xx from your API and our frontend raises a
`checkout_error` analytics event on any failure. We have logged **zero** such errors
since 10 August. So:

- the API key authenticates (a bad key would 401)
- the product IDs resolve (an unknown product would 400)
- there are no timeouts or network failures

**What fails**

Customers are redirected to the `checkout_url` you return, and come back to our site
within **2–12 seconds having typed nothing**. For comparison, our last three genuinely
completed payments took 104s, 106s and 500s from redirect to confirmation, and the
browser recorded 92 keystrokes in the paying session versus 12 in a recent failing one.
Nobody is reaching a working card form.

This is consistent with a session that is valid to *create* but not valid to *pay*.

**Details**

- Mode: **live** (`live.dodopayments.com`)
- Integration: Checkout Sessions API, redirect pattern
- Request body: `product_cart: [{ product_id, quantity: 1 }]`, `return_url`,
  `customer: { email }`, plus `metadata`
- Affected products (all of them, subscription and one-time alike):
  - `pdt_0Nfl5LZfppnjJBM2mvons` — Starter monthly (subscription)
  - `pdt_0NnrQ671IEcqUSHaPJDi3` — Professional monthly (subscription)
  - `pdt_0Nj62gByZ53OzYoz3bCBr` — PAYG Small (one-time)
  - `pdt_0Nj62kQhG7EzZWogTmjfE` — PAYG Medium (one-time)
- Last successful payment: **2026-08-13 18:05:32 UTC**
- Failing attempts since: ~30 across 14–21 August, from US, France, Pakistan, India,
  Japan — so it is not region or card specific

**What we are asking**

Please check, for our account:

1. Is the account restricted, under review, or otherwise unable to accept live
   payments? Our highest-ever payment day was 13 August (4 payments) immediately
   before this started, which looks like it could have triggered an automated review.
2. Are these products active and payable in live mode?
3. Can you look at any recent checkout session we created and tell us why it did not
   proceed to payment? The API reports success, so the reason is only visible on your
   side.

If there is an account action we need to complete (verification, KYC, payout setup),
please tell us exactly what — this is currently costing us all of our revenue.

Thank you,
Eliasse — LinkFinder AI

---

## Before you send

Add a session id if you have one to hand: after deploying the worker patch, click buy
once and copy `session_id` from the response. It lets them look up the exact session
instead of searching. Not required — the timestamp and product ids are enough to start.
