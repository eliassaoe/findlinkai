# Referral program v2

Pays a partner **25% of what a referred customer actually pays**, and pays it
only when Dodo says over a signed webhook that money moved.

## Why v1 was not extended

`linkfinderai_users.refered_by` ended up holding three different things:

| value | rows | what it is |
| --- | --- | --- |
| `"null"` (the literal string) | 4,645 | a client bug writing the word |
| `ogZ0byKuozK46D6a` | 26 (2 paid) | the only real affiliate code |
| `producthunt`, `reddit`, `anchor`, `peerpush`, `nxgntools`, `test_xyz`, `poweredbyai?utm_source=…` | ~30 | marketing tags in the same column |

One `commissions` row was ever written. Nothing in there can be trusted to say
who referred whom, so v2 starts from empty tables. `refered_by` is left alone
for whatever still reads it.

## The one rule

**A commission is created only by a signature-verified Dodo webhook.** The
browser can ask what it is owed and nothing else. Every endpoint a browser can
reach is read-only with respect to money.

This is what makes it a referral program rather than a credit faucet: paying on
signup, on an enrichment, or on any client-side event pays for something the
referrer fully controls, so it gets farmed. Paying on a real charge cannot be,
because the farmer would have to pay us more than they earn back.

## How attribution survives the worker we cannot edit

The live `dodo-checkout` worker is **not in this repo** and cannot be changed
from here, so nothing may depend on it putting a referral code into checkout
metadata.

```
?ref=CODE  ->  localStorage + cookie  ->  POST /attribute at signup
            ->  referral_attributions   (one row per user, ever)

Dodo payment webhook  ->  resolve payer BY EMAIL  ->  their attribution
                       ->  referral_commissions
```

The customer email is on every Dodo payload. Metadata is still preferred when
it happens to be present, as a stronger match than email.

## Commission lifecycle

```
pending ──(30 days, nightly cron)──> approved ──(payout run)──> paid
   │
   ├──(refund / chargeback webhook)──> void
   └──(flagged attribution)──────────> review ──(human)──> approved | void
```

`pending` and `review` are deliberately excluded from the "owed" figure shown
to a partner. A number that can still evaporate in a refund is how a referral
program loses trust the first time it goes down.

## Anti-farming, and what each stops

| Guard | Stops |
| --- | --- |
| Commission only from a signed webhook | Forging a conversion from the browser |
| `UNIQUE (dodo_payment_id)` | A webhook retry paying the same commission twice |
| Attribution locked, first-touch, PK on the user | Re-attributing an existing customer to yourself |
| `CHECK (referred_user_id <> partner_user_id)` | Referring yourself |
| Same-employer-domain signups → `review` | A second account at your own company |
| 30-day hold before `approved` | Paying out on a charge that gets refunded |
| Refund/chargeback → `void` | Keeping commission on money we gave back |
| RLS on, no policies | Anyone reading payout addresses or commission rows |

Free email providers are excluded from the domain check — two gmail addresses
say nothing about a shared employer, and flagging them would send nearly every
genuine referral to manual review.

## Deploy

```bash
cd workers/referral
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY   # service role - bypasses RLS
npx wrangler secret put DODO_WEBHOOK_SECRET    # same secret as dodo-webhook
npx wrangler secret put CLICK_SALT             # any long random string
npx wrangler deploy
```

Then in the Dodo dashboard add the deployed URL + `/webhook/dodo` as a webhook
endpoint, subscribed to:

`payment.succeeded`, `subscription.active`, `subscription.renewed`,
`payment.refunded`, `payment.reversed`, `dispute.created`

Dodo delivers happily to more than one endpoint, so this sits alongside
`workers/dodo-webhook` (the PostHog bridge) rather than replacing it. They are
kept separate on purpose: one reports, one moves money, and a change to either
must not be able to weaken the other.

Apply `schema.sql` before the first deploy.

## Tests

```bash
node test.mjs
```

18 cases over a stubbed Supabase with real HMAC signing: signature tampering,
replay, retry idempotency, refunds, blocked partners, flagged attributions,
self-referral, first-touch immutability, and that no browser-reachable endpoint
can create a commission.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /me` | Partner dashboard: code, link, clicks, signups, owed, paid |
| `POST /attribute` | Lock attribution at signup |
| `POST /payout` | Set the payout email |
| `GET /r/:code` | Log a click, 302 to the site with `?ref=` |
| `POST /webhook/dodo` | Signed. The only writer of commissions. |

## Not done yet

- **The payout run.** `approved` → `paid` is still manual: nothing here sends
  money. It marks a batch; someone pays it. Automating it means PayPal Payouts
  or Dodo's own affiliate payouts, and neither should be wired up before the
  first real commission exists.
- **The UI.** `referral-program.html` is the v1 page and still points at the v1
  workers. It has not been repointed.
- **Dodo's own Affiliates feature** (which is Affonso under the hood) was
  considered and not used: it tracks affiliates who are sent to *its* hosted
  signup, and pays them outside our credits/accounts system. This worker keeps
  attribution on our own user records, which is what lets a partner be an
  ordinary logged-in customer.
