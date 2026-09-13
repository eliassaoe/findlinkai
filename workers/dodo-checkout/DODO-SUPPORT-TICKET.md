# Ticket to send to Dodo Payments support

Send to their support channel (dashboard chat, or support@dodopayments.com).
Everything below is evidence already confirmed from our own analytics — no guesses.

---

**Subject: Checkout sessions create successfully (HTTP 200) but the hosted page refuses them — zero payments since 26 Aug, live mode**

Hi,

Our last completed payment was on **26 August 2026**. Since **27 August** we have
created **10 checkout sessions and taken zero payments**. Payments were completing
normally right up to that date — 23, 24 and 26 August all had successful payments —
and nothing was deployed on our side that touches checkout: our checkout worker has
not changed at all.

**Two sessions on the same account, one that paid and one that did not**

- Working: `sub_0Nm6PkMITtarm7xu7bgEo` — paid on 24 August.
- Failing: `cks_0NnSyw0WXQO3Az3HMOZE8` — created 12 September, HTTP 200, valid
  `checkout_url`, customer redirected, customer back on our site within seconds
  having typed nothing.

Same account, same worker, same request shape, same products. Whatever differs
between those two is the fault, and it is only visible on your side.

**The measurement**

Of every visitor who picked a plan and was handed a `checkout_url`:

| Window | Picked a plan | Paid | Bounced back without typing |
| --- | --- | --- | --- |
| 22 Jun – 26 Aug | 73 | 19 (26%) | 17 (23%) |
| Since 27 Aug | 12 | 0 | 11 (92%) |

A jump from 23% to 92% bouncing straight back off the hosted page is not noise
(z = 4.7, p < 0.00001). It happens *after* the browser has left our domain for
yours, so it is not our code, our card form or our customers' cards.

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
- Last successful payment: **26 August 2026**
- Failing attempts since: 10 sessions created 27 August – 12 September, none paid,
  from several countries — so it is not region or card specific
- Example failing session: `cks_0NnSyw0WXQO3Az3HMOZE8` (12 September)
- Example working session, same account: `sub_0Nm6PkMITtarm7xu7bgEo` (24 August)

**What we are asking**

Please check, for our account:

1. Is the account restricted, under review, or otherwise unable to accept live
   payments since 26–27 August? Nothing changed on our side on that date.
2. Are these products active and payable in live mode?
3. Compare `cks_0NnSyw0WXQO3Az3HMOZE8` (failing) with `sub_0Nm6PkMITtarm7xu7bgEo`
   (paid on 24 August) and tell us why the first did not proceed to payment. The API
   reports success, so the reason is only visible on your side.

If there is an account action we need to complete (verification, KYC, payout setup),
please tell us exactly what — this is currently costing us all of our revenue.

Thank you,
Eliasse — LinkFinder AI

---

## Before you send

The two session ids above are the strongest thing support can be handed: a working
and a broken session on the same account. If you have deployed the worker patch
(PATCH.md), also paste the `dodo_raw` body from one fresh attempt so they can see
exactly what their API answered.
