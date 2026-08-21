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
  - `pdt_0Nfl5YPolhxfkTEMxOJYp` — Professional monthly (subscription)
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
