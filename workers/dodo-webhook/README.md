# Dodo → PostHog webhook bridge

Captures payments into PostHog from Dodo's webhooks instead of from the browser.

## Why

`checkout_payment_success` fires in the browser, and only when the customer lands
back on `/app` with `?status=succeeded`. Every one of these is invisible to it:

- customer pays, then closes the tab
- customer pays on their phone, opens the app on a laptop
- the return redirect drops, times out, or is blocked
- the payment succeeds asynchronously after the customer has gone

The money still arrives. The funnel still reads zero. Until this worker is
deployed, a "no sales in N days" reading is **not** evidence that no sales
happened — check Dodo before believing it.

## Deploy

```bash
cd workers/dodo-webhook
npx wrangler deploy
```

`wrangler.toml` is included. Set the two secrets first:

```bash
npx wrangler secret put DODO_WEBHOOK_SECRET   # from Dodo dashboard → Webhooks
npx wrangler secret put POSTHOG_API_KEY       # phc_... project key
```

Then add the deployed URL as a webhook endpoint in the Dodo dashboard and
subscribe it to `payment.succeeded`, `payment.failed`, `subscription.active`,
`subscription.renewed`, `subscription.cancelled`, `subscription.failed`.

## One change needed in the checkout worker

Attribution only works if the payment carries the user token. When
`dodo-checkout.hamoureliasse.workers.dev` creates the Dodo checkout session, it
must pass the token it already receives through as metadata:

```js
metadata: {
    user_token: body.user_token,             // required — the posthog.identify() id
    attempt_id: body.request_id,             // optional — joins to checkout_redirect_started
    attribution_source: body.attribution_source,   // optional
    attribution_campaign: body.attribution_campaign // optional
}
```

Without `user_token`, this worker still records the payment, but as
`payment_unattributed_server` against a placeholder person — the revenue is
visible, but not joined to that customer's browsing history. A run of those
events means the checkout worker stopped forwarding metadata.

## Events it produces

| Dodo event | PostHog event |
|---|---|
| `payment.succeeded` | `payment_succeeded_server` |
| `payment.failed` | `payment_failed_server` |
| `subscription.active` | `subscription_active_server` |
| `subscription.renewed` | `subscription_renewed_server` |
| `subscription.cancelled` | `subscription_cancelled_server` |
| anything else | ignored, acknowledged with 200 |

They are deliberately suffixed `_server` so they sit alongside the existing
client-side events rather than overwriting them. Once you have a week of both,
compare `payment_succeeded_server` against `checkout_payment_success` — the gap
is how much revenue the browser-side tracking has been missing all along.

## Security

Signatures are verified against the [Standard Webhooks](https://www.standardwebhooks.com/)
spec that Dodo implements: HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}`,
compared in constant time, with a 5-minute timestamp tolerance to reject replays.
An unsigned or stale request gets a 401 and is never captured.
