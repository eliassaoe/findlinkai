# Questions for Dodo Payments support / their AI

Paste the block below. Every question is one whose answer changes code we have
already written, so "probably" is not useful here — we need the actual behaviour.

---

Hi — I'm integrating the Discounts API and the Checkout Sessions API for a
LinkedIn data-enrichment SaaS. I have ten specific questions. Please answer each
one directly, and say "not supported" rather than suggesting a workaround if
that's the answer.

**Discounts API — creating codes**

1. Confirm the endpoint and auth: is it `POST https://live.dodopayments.com/discounts`
   with `Authorization: Bearer <live API key>`? Any other required header?

2. For `type: "percentage"`, is `amount` in basis points — i.e. does `4000` mean
   40%? I want to be certain it isn't `40`, since being wrong by 100x in either
   direction is expensive.

3. `subscription_cycles`: if I omit this field entirely, does the discount apply
   to *every* recurring payment forever? And does `subscription_cycles: 1` mean
   the first billing period only, with full price from period two onward?

4. `usage_limit: 1` — is that one redemption **in total across all customers**,
   or one **per customer**? I mint a unique code per user, so I want to be sure a
   single code can't be shared and used twice.

5. `restricted_to`: I pass an array of product IDs. Two things — (a) if I omit
   the field, does the discount apply to *all* products including one-time ones?
   (b) Does restricting to a subscription product work normally, or is
   `restricted_to` only meaningful for one-time products?

6. `expires_at`: what format and timezone do you expect (ISO 8601 UTC?), and
   what exactly expires? Specifically: if a customer redeems a 3-cycle discount
   on a subscription one hour before `expires_at`, do they keep the remaining
   cycles, or does the discount stop at `expires_at`?

**Applying the code**

7. This is the important one. When I create a checkout session via
   `POST /checkouts` with `product_cart`, can I **attach a discount code to the
   session at creation time** so the customer never has to type it? If so, what
   is the exact field name and where does it go in the payload? If not, is the
   promo-code input always visible on the hosted checkout page, or does it need
   enabling in settings?

**Operational limits**

8. Are there rate limits or account quotas on creating discounts? I expect to
   create a few hundred single-use codes per month, each expiring in 24 hours.
   Is that a normal usage pattern, or will it trip something?

9. Can I expire or delete a discount code before its `expires_at`, and if so how?

**Two things about our account specifically**

10. Our dashboard says "Tous les produits 14, Produits actifs 6, Produits
    archivés 0". What makes a product count as active, and what are the other 8?
    Crucially: **if a product is not "active", can `POST /checkouts` still return
    HTTP 200 with a valid `checkout_url` for it, while the hosted checkout page
    then fails to load?** We have sessions that create successfully and return a
    valid `checkout.dodopayments.com/session/cks_...` URL, but customers report
    the page not opening. Is there an API to fetch a checkout session by ID and
    see its state and why it did not proceed?

Thanks.

---

## Why each one matters to us

| Q | What we do differently depending on the answer |
|---|---|
| 2 | `amount` is hardcoded as `PERCENT_OFF * 100` in `workers/discount-code/worker.js` |
| 3 | `DISCOUNT_SUBSCRIPTION_CYCLES` defaults to 1; if omitting means forever we must never omit it |
| 4 | If `usage_limit` is per-customer, a leaked code is reusable and the per-account KV guard is the only thing stopping abuse |
| 5 | If omitting `restricted_to` means "everything", our fail-closed check on `DISCOUNT_PRODUCT_IDS` is load-bearing and must stay |
| 7 | If a code can ride on the session, we skip showing it to the user entirely and just discount their checkout — much better conversion |
| 10 | Possible root cause for the funnel leak in `docs/checkout-leak.md`, where 35 of 42 plan selections never produced a redirect |
