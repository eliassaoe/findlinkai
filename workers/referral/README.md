# Referral program v2

Pays a partner **30% of everything a referred customer pays during their first
12 months as a paying customer**, uncapped, and pays it only when Dodo says over
a signed webhook that money moved.

The year starts at the referred customer's first commissioned payment, not at
signup, so someone who signs up through a partner and buys months later still
earns that partner a full year. Each referred customer has their own year. A
refunded first payment does not restart it. After the year the customer stays
attributed to the partner but stops earning.

(Until Oct 2026 this was 25% capped at $500 per referred customer. No
commission had been written under those terms, so nothing needed migrating.)

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
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # service role - bypasses RLS (same value as onboarding-tasks)
npx wrangler secret put DODO_WEBHOOK_SECRET    # THIS endpoint's own signing secret
npx wrangler secret put CLICK_SALT             # any long random string
npx wrangler deploy
```

Then in the Dodo dashboard add the deployed URL + `/webhook/dodo` as a webhook
endpoint, subscribed to:

`payment.succeeded`, `subscription.active`, `subscription.renewed`,
`refund.succeeded`, `dispute.opened`, `payment.cancelled`

These are Dodo's real event names, copied from its dashboard. The first version
of this file listed `payment.refunded`, `payment.reversed` and
`dispute.created`, none of which Dodo sends - and because an unrecognised event
is acknowledged and ignored by design, every refund would have passed silently
and left the commission standing. Subscribe to exactly the six above.

Dodo delivers happily to more than one endpoint, so this sits alongside
`workers/dodo-webhook` (the PostHog bridge) rather than replacing it. They are
kept separate on purpose: one reports, one moves money, and a change to either
must not be able to weaken the other.

**The signing secret is per endpoint, not per account.** Dodo implements
Standard Webhooks, and each endpoint you create gets its own `whsec_...`. So
this worker needs the secret shown on ITS endpoint's Overview tab - reusing the
one from the dodo-webhook endpoint makes every signature check fail with
`signature mismatch`, which reads exactly like an attack rather than a
misconfiguration. Create the endpoint first, then copy its secret.

Apply `schema.sql` before the first deploy.

## When it does not work

Open **`https://referral.hamoureliasse.workers.dev/health`** in a browser. It
reports which bindings exist (booleans only, never values) and whether each
table answers, then lists the problems in plain words.

Deploying the code and applying `schema.sql` are two separate steps in two
different dashboards, so "the worker is up" and "the worker works" are
genuinely different states. This is what tells them apart.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | What is configured and what answers |

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

## The credential leak this replaced

v1 built every user's invite link as `linkfinderai.com?ref=<userToken>` — and
`?token=` is exactly what `checkAuth()` reads to log someone in. The app was
asking people to publish their own auth credential: anyone who received a
shared invite link could swap `ref=` for `token=` and be inside that account.

v2 codes are generated (`abc123xy`), authenticate nothing, and are safe to post
anywhere. Fixed in `app.html` in the same change that repointed the modal.

## Paying partners: the monthly run

Commission states: `pending` (inside the 30-day refund hold) → `approved`
(owed) → `paid`. The nightly cron does pending → approved. Paying is manual.

**On the 1st–5th of each month**, in the Supabase SQL editor:

```sql
-- 1. Who to pay this run (owed >= $50 and a PayPal email set)
SELECT code, payout_email, owed_now, in_refund_hold, needs_review
FROM referral_payouts_due WHERE payable ORDER BY owed_now DESC;

-- 2. Anything flagged (same email domain etc.) needs a decision first
SELECT * FROM referral_commissions WHERE status = 'review';
-- approve:  UPDATE referral_commissions SET status='approved', approved_at=now() WHERE id='...';
-- reject:   UPDATE referral_commissions SET status='void' WHERE id='...';
```

3. Send each `owed_now` amount via PayPal (Payouts or a normal send) to
   `payout_email`.
4. Mark exactly what you paid, with a batch name you can trace back:

```sql
UPDATE referral_commissions
SET status = 'paid', paid_at = now(), payout_batch = '2026-11'
WHERE status = 'approved'
  AND partner_user_id IN (SELECT partner_user_id FROM referral_payouts_due WHERE payable);
```

Partners see `owed` drop and `paid` rise on /affiliate and in the app modal
right after step 4. Below $50 the balance rolls over to the next month.

## Tracking: link → signup → payment

```
?ref=CODE on ANY page  ->  js/lf-attribution.js stores it first-touch
                           (localStorage lf_ref + cookie, PostHog super
                           property referral_code, event referral_link_landed)
signup (email or Google) -> /app -> POST /attribute -> referral_attributions
                           (PostHog person property referred_by_code,
                           event referral_attributed / _rejected)
Dodo payment webhook     -> referral_commissions (pending)
```

Before Oct 2026 the code was dropped on the way: only three pages read
`?ref=`, the Google signup redirect cleared it, and email signups only had it
in a cookie /app never read. `tests/referral-capture.test.mjs` pins all three.

In PostHog, break `checkout_payment_success` down by the person property
`referred_by_code` to see revenue per partner.

## Not done yet

- **Automated payouts.** `approved` → `paid` is manual (see the monthly run
  above): nothing here sends money. Automating it means PayPal Payouts
  or Dodo's own affiliate payouts, and neither should be wired up before the
  first real commission exists.
- **`referral-program.html`** is the v1 page and still points at the v1
  workers. `affiliate.html` replaces it; the old page has not been deleted in
  case anything still links to it directly.
- **Dodo's own Affiliates feature** (which is Affonso under the hood) was
  considered and not used: it tracks affiliates who are sent to *its* hosted
  signup, and pays them outside our credits/accounts system. This worker keeps
  attribution on our own user records, which is what lets a partner be an
  ordinary logged-in customer.
