# discount-code

Mints a single-use, 24-hour, 40%-off code for one account, restricted to
subscription plans. This is the last-resort offer on the credit wall.

## Why it is built to fail closed

This endpoint creates real money-off codes. Four guards run before Dodo is ever
called, and any one of them failing means no code:

| guard | why |
|---|---|
| account exists in Supabase | otherwise anyone can POST random tokens in a loop |
| account is not already a subscriber | 40% to someone paying full price is a refund |
| one code per account | the offer, as specified |
| one code per IP | as specified; shared offices will collide, deliberately |

The last two are **idempotent, not refusing** — asking twice returns the same
code with its original expiry, so someone who closes the modal and reopens it
sees their code again rather than being told off.

If `DISCOUNT_PRODUCT_IDS` is empty the worker refuses to issue at all, because an
unrestricted 40% code would also apply to the pay-as-you-go packs.

## Deploy

```
cd workers/discount-code
wrangler secret put DODO_API_KEY          # same live key the checkout worker uses
wrangler secret put SUPABASE_URL          # https://snxhsboboatjywgwdeds.supabase.co
wrangler secret put SUPABASE_SERVICE_KEY  # service_role, reads plan_type
wrangler deploy
```

**Before it will issue anything**, set `DISCOUNT_PRODUCT_IDS` in `wrangler.toml`
to your subscription product ids, comma-separated. Two are already known from
the checkout worker:

```
pdt_0Nfl5LZfppnjJBM2mvons   Starter monthly
pdt_0Nfl5YPolhxfkTEMxOJYp   Professional monthly
```

Add the Enterprise and annual ids too, or those plans will silently reject the
code. Do **not** add `pdt_0Nj62gByZ53OzYoz3bCBr` or `pdt_0Nj62kQhG7EzZWogTmjfE` —
those are the PAYG packs, which this offer excludes.

Then set `CIM_DISCOUNT_WORKER` in `app.html` to the deployed URL if it differs
from `https://discount-code.hamoureliasse.workers.dev`.

## The one number to decide

`DISCOUNT_SUBSCRIPTION_CYCLES` defaults to **1** — the discount applies to the
first billing period only. Dodo's default when the field is absent is *forever*.
40% off a $149/mo plan in perpetuity is a permanent margin cut, so this errs
conservative. Raise it deliberately, not by accident.

## API

```
POST /   {"user_token": "..."}   -> {code, expires_at, percent_off, reused}
GET  /?user_token=...            -> {code: null} or the existing code
```

`GET` never mints. Only an explicit `POST` spends money.

Failure modes are distinct on purpose: `401 sign_in_required`,
`403 unknown_account`, `409 already_subscribed`, `429 already_issued_for_network`,
`503 not_configured`, `502 dodo_rejected`.

## Who actually gets offered it

The gate lives in `app.html` (`cimQualifiesForDiscount`), not here — the worker
is the last line, not the first. A user must say the price is the problem on the
credit wall, **and** either have hit the wall twice or have picked a plan and not
paid. First-time wallers get the $25 pack and the call instead, which cost far
less.

## Using it from email

Link to `https://linkfinderai.com/app?action=offer`. That opens the wall straight
on the price branch and mints only if the person qualifies — so a forwarded email
does not leak a code to someone who never earned one.

Watch `discount_email_landed`, `discount_code_issued`, and `discount_code_failed`.
A rising `discount_code_failed` means the worker is misconfigured, not that people
are declining.
