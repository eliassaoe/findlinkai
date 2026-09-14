# dodo-checkout

The worker itself lives in Cloudflare (Workers & Pages -> `dodo-checkout`), not in
this repo. This folder holds what surrounds it.

## The two doors to a payment page

1. **Session** (primary): `app.html` `launchCheckout()` POSTs to the worker, which
   creates a Dodo checkout session and returns `checkout_url`; the browser
   navigates there. Telemetry brackets every step (`docs/checkout-leak.md`).
2. **Static payment link** (second door): if the worker is unreachable, slow,
   answers without a valid URL, or the navigation does not commit, `app.html`
   sends the buyer to Dodo's fixed per-product link instead
   (`DODO_DIRECT_PRODUCTS` / `buildDirectPaymentLink()`). It carries the same
   `email` and `metadata_user_token` the worker sends, so `dodo-webhook`
   attributes the payment identically. The link is also offered on the 5s
   stalled notice, the 20s watchdog, and the come-back rescue banner, next to a
   mailto so a human can take payment another way.

   Every checkout plan key has a second door: the nine live product ids were
   read from the Dodo dashboard on 14 September 2026 and
   `tests/checkout-second-door.test.mjs` pins all of them. If a product is ever
   recreated in Dodo, update `DODO_DIRECT_PRODUCTS` the same day.

Neither door can make Dodo's page charge a card. If a session is created, the
buyer lands on it, stays minutes and comes back unpaid, the fault is on Dodo's
side of the page: `DODO-SUPPORT-TICKET.md`.

## The canary

`.github/workflows/checkout-canary.yml` runs `canary.mjs` hourly: it creates one
live session through the worker exactly as a customer's click would, fetches
the returned page, and fetches the static link too. Creating a session moves no
money. A failure fails the run (GitHub emails the owner) and opens or refreshes
one issue labelled `checkout-canary`; a passing run closes it.

Arm it with a repository secret `LF_CANARY_USER_TOKEN` (a real account's token,
from /account). Without it the session path is skipped with a warning and only
the static link is checked.

The canary proves the doors open. Whether money arrives is the PostHog alert
"Revenue drought" (any money in 7 days), which has been firing daily since the
last real payment on 26 August 2026.

## Files

- `PATCH.md` - the three-line worker change that returns Dodo's raw session
  response to the browser. Not deployed as of 14 September 2026 (`dodo_raw` is
  null on every redirect event). Deploy it.
- `DODO-SUPPORT-TICKET.md` - the ticket, updated 14 September with session ids.
- `checkout-doctor.js` / `one-line-check.txt` - browser-console diagnostics.
- `canary.mjs` - the hourly proof above.

