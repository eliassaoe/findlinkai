# Auto top-up — the worker that charges the card

`worker.js` here is the source for the deployed `auto-topup-charge` Cloudflare
Worker. It was not in this repo until the pricing was fixed; it is here now
because it is the only place that decides what a customer's saved card gets
charged, and that does not belong somewhere nobody can review it.

## What was wrong

The pack table was not the pack table. Auto top-up charged:

| Pack | Credits | Price | Per credit |
| --- | --- | --- | --- |
| small | 5,000 | $19 | $0.0038 |
| medium | 25,000 | $79 | $0.0032 |
| large | 60,000 | $149 | $0.0025 |

The pay-as-you-go packs sold everywhere else are:

| Pack | Credits | Price | Per credit |
| --- | --- | --- | --- |
| payg_small | 1,000 | $25 | $0.0250 |
| payg_medium | 3,500 | $75 | $0.0214 |
| payg_large | 10,000 | $200 | $0.0200 |

Auto top-up was **6.6× to 8× cheaper per credit than the same credits bought any
other way**. The large pack was worse than that: $149 bought 60,000 credits,
while Enterprise charges **$149 a month for 50,000**. A one-time auto top-up beat
the top subscription tier outright, so the rational move for any heavy customer
was to cancel their plan and let auto top-up run.

Nothing was misconfigured. The frontend, this worker and the summary line all
agreed with each other — they just all disagreed with the product's real prices,
because auto top-up was given its own price list and nothing ever compared the
two.

## What changed

`TOPUP_PACKS` now holds the PAYG figures, and the keys are `payg_small` /
`payg_medium` / `payg_large` — the same keys `dodo-checkout` already uses.

Renaming the keys is deliberate. A settings record written under the old scheme
carries `pack_key: "small"`, which is now absent from the table, and the worker
returns `Invalid pack_key` and charges nothing. It fails closed: nobody is
charged an amount they did not agree to. (At the time of the change there were no
enrolled users, so this is belt-and-braces.)

No Dodo product needs to change. The charge posts `product_price` as a custom
amount, and `dodo-webhook-handler` grants `metadata.credits_to_grant` on
`payment.succeeded` — so credits follow this table directly.

## Deploying

**This worker is not deployed by anything in this repo, and the pricing fix is
not live until someone deploys it.** Cloudflare Workers cannot be deployed from
the agent tooling here.

```bash
cd workers/auto-topup-charge
npx wrangler deploy
```

Until that runs, `api-access.html` offers the new packs under the new keys and
the deployed worker rejects them — so auto top-up charges nothing at all rather
than charging the old prices. That is the intended failure mode, but it does mean
**auto top-up is inert until the deploy happens**.

Secrets are already set on the deployed worker (`DODO_API_KEY`, `DODO_API_BASE`)
and the `SETTINGS_WORKER` service binding already exists; `wrangler deploy` keeps
both. Only `worker.js` differs from what is live — diff it before deploying if
the live version has moved on.

## The guard against this happening again

`tests/auto-topup-pricing.test.mjs` reads the pack figures out of this file,
`app.html`, `account.html` and `api-access.html` and fails if any two disagree.
The bug was a second price list drifting from the first; the test makes a second
price list impossible to leave inconsistent.

## Unrelated, but found while reading this: `list_enabled` is public

`auto-topup-settings` is reachable from the internet with
`Access-Control-Allow-Origin: *` and no shared secret. Its `list_enabled` action
returns **every enrolled user's token**, and a token is this app's whole
credential — it is what `?token=` in the app URLs uses to read credits, history
and account data.

The `auto-topup-poller` reaches the settings worker over a service binding, not
over the public internet (`env.SETTINGS_WORKER.fetch`), so the internal-only
actions do not need to be publicly reachable at all. The fix is to require a
shared secret header on `list_enabled`, `acquire_lock` and `release_lock`, and
reject them when the request did not arrive over the service binding.

Not changed here — it is a separate worker and a separate deploy, and it is worth
doing on its own rather than folded into a pricing fix.
