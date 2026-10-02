# cancel-subscription-v2

Cancels a subscription from the user's **token**, whatever kind of id
`linkfinderai_users.subscription_id` holds. The account page calls it when the
original cancel worker rejects a cancellation.

## Why

The original worker (`cancel-subscription.hamoureliasse.workers.dev`, not in
this repo) forwards the id to Dodo as-is. On 2026-10-02, of 34 paying rows:

| `subscription_id` | Rows | What it is | Old worker | This worker |
| --- | --- | --- | --- | --- |
| `sub_0N…` (25 chars) | 9 | Dodo subscription | ✅ | ✅ cancels it |
| `cus_0N…` (25 chars) | 16 | Dodo **customer** id | ❌ | ✅ cancels the customer's active subscriptions |
| `sub_01…` (30 chars) | 5 | **Paddle** subscription (ULID) | ❌ `worker_rejected` | ✅ if `PADDLE_API_KEY` is set |
| `test`, `null`, `manual_test_…`, `cus_UZ…` | 4 | test rows / unknown | ❌ | ❌ `unsupported_id` |

Every case the worker cannot handle ends, on the page, in a **manual
cancellation request** sent to the feedback inbox, so nobody is ever left with
a live subscription after clicking cancel.

Cancellation is at the end of the billing period (`cancel_at_next_billing_date`
on Dodo, `effective_from: next_billing_period` on Paddle).

## Deploy

```bash
cd workers/cancel-subscription
npx wrangler deploy
npx wrangler secret put DODO_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put PADDLE_API_KEY   # optional, for the sub_01… rows
```

The URL must be `https://cancel-subscription-v2.hamoureliasse.workers.dev/`
(`CANCEL_FALLBACK_WORKER` in `account.html`). Until it is deployed, failed
cancellations still fall through to the manual request.

## Responses

`{ ok: true, kind, cancelled: [ids] }` or `{ ok: false, error, kind?, detail? }`
with `error` one of `missing_token`, `unknown_token`, `lookup_failed`,
`unsupported_id`, `provider_rejected`.
