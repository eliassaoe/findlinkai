# Incident: the signup farm, 13–22 Sep 2026

Still running when this was written. What follows is what the data says, what
was changed, and what is still open.

## What happened

`coldemail_1000` went live on 8 Sep: a public campaign code worth 1,000 credits,
redeemable by anyone with the `/100free` link, with no cap on redemptions. The
README called that out at the time — *"anyone who has the link can use it, which
is the accepted cost of a link that has to work from an email with no login"*.
That was true and it was the right call for a 50-credit grant. At 1,000 credits
and no cap, the same link is a mint.

Five days later, on 13 Sep, a script started using it.

| | |
|---|---:|
| accounts created | **9,991** |
| email-verified | **0** |
| ever paid | **0** |
| distinct email domains | **23** |
| credits provisioned onto them | **9,412,768** |
| enrichments already run | **~72,000** |

9,991 accounts is **56% of the entire user table**.

Every address had the shape `lf-<8 chars>@<domain>`, rotating over 23 invented
but respectable-looking company domains — `summitpartners.com`, `bluepeak.io`,
`ironcladhq.com`, and, less carefully, `acmecorp.com` and `mycompany.org`.

The domains were chosen to thread the two checks that existed: not consumer
mailboxes, so `CONSUMER_DOMAINS` never saw them; not throwaway services, so the
`DISPOSABLE_DOMAINS` KV never saw them either.

Account creation by day, from each account's first enrichment:

| day | new accounts |
|---|---:|
| 13 Sep | 5 (testing) |
| 14 Sep | 168 |
| 15 Sep | 1,086 |
| 18 Sep | 2,704 |
| 19 Sep | **3,760** |
| 20 Sep | 1,837 |
| 22 Sep | 158 (and counting) |

The IP limiter — 3 accounts per IP per 24h — did not slow this down. 3,760
accounts in a day is rotating proxies.

Consumption is concentrated in the expensive call: **55,127 runs of
`linkedin_profile_to_email`** across 329 of the accounts, in bursts of ~220–390
runs inside a 5–10 minute window, one account after another, around the clock.

## The second hole, which is worse

The farm ran on garbage input, and garbage input was free:

```js
credits: shaped.row.status === 'Found' ? CREDIT_COSTS[...] : 0
```

A lookup that returned nothing cost the user nothing — while the supplier was
paid for the attempt. Measured across the 191 heaviest farm accounts:

| | credits |
|---|---:|
| work delivered | 537,519 |
| actually billed | 182,497 |
| **share billed** | **34%** |

That is not specific to the farm. It is true for every user and it is why a run
of pure noise is the cheapest thing you can do here.

Alongside it, `enrichment_history.credits_used` was hardcoded to `1` for every
row — including the 50-credit phone lookup. The consumption table could not be
used to notice any of this, which is part of why it ran for nine days.

## What changed

All in this commit, none of it live until deployed (see below).

1. **`coldemail_1000` retired.** `GIFT_CREDITS` is now empty. Old `/100free`
   links still work and fall back to the standard 50-credit grant.
2. **The 23 domains are blocked** at signup, and so is the farm's email shape
   (`lf-` + 8 chars including a digit). The shape rule is deliberately narrow:
   `lf-outreach@` is a plausible team alias and must still get through.
3. **A per-domain cap: 5 new accounts per domain per 24h.** This is the rule
   that generalises — the next farm buys 23 different domains, and 23 × 5 is
   115 accounts a day instead of 3,760. Consumer mailboxes are exempt, because
   gmail is 75.5% of real signups and a cap there refuses real people.
4. **A miss now costs credits** — 25% of the listed price, minimum 1, via
   `CSV_MISS_CHARGE_RATE`. Set it to 1 to charge misses in full.
5. **`credits_used` is logged as the amount actually charged.**
6. **`company_name_to_email` corrected from 1 to 5** in the runner, which is
   what `app.html` quotes the user. It was under-billing every background row.
7. **The gift exemption from the country block is gone**, so a future campaign
   code cannot become a way around it.

`tests/signup-country-policy.test.mjs` (15) and `tests/credit-charging.test.mjs`
(7) pin all of it, including the two failure modes that matter more than the
abuse: both limiters **fail open** when KV is missing, and the shape rule does
not catch real addresses.

## Still open

1. **9.4M credits are banked on the 9,991 accounts and this commit does not
   touch them.** Killing the code stops new ones being minted; it does nothing
   about the ones already holding ~940 credits each. At the PAYG rate that is
   ~$235,000 of provisioned value, and the accounts are still live. **This is
   the most urgent remaining item and it is a decision, not a patch.**
2. **The direct enrichment endpoint is in n8n, not in this repo.** The farm's
   55,127 email lookups went through it, not through `csv-batch-runner` — only
   75 CSV batches exist in the whole database. So fix 4 and 5 above are correct
   but they are *not* on the path the farm actually used. The same two changes
   have to be made in the n8n workflow or the hole stays open.
3. **Nothing requires email verification before credits can be spent.** 0 of
   9,991 farm accounts were verified. This is the single highest-leverage fix
   left and it also lives in n8n. `docs/email-verified-is-wrong.md` is the prior
   thinking on it.
4. **`linkedin_profile_to_email` is the exposure.** Whatever is decided about
   grants, that one call is where the money goes.

## Deploying

The signup Worker is **not** deployed with `wrangler` — see
`workers/signup/README.md`. Paste `worker.paste-safe.js` into the Cloudflare
dashboard editor. Until that paste happens, the farm can keep signing up.

`csv-batch-runner` deploys as a normal Supabase edge function.
