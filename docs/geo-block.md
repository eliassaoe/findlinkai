# Blocking the low-conversion countries at signup

Decision record, 22 Sep 2026. Supersedes the "not yet" in `docs/geo-pricing.md`.

> **Superseded the same day.** The policy moved from this blocklist to an
> allowlist (`COUNTRY_POLICY = 'allowlist'`). The numbers below still explain
> why IN/PK/NG/BD/EG are not in `ALLOWED_COUNTRIES`, and the caveats below —
> especially a paying customer's team abroad — apply with more force under an
> allowlist, because it refuses far more countries than this ever did. See
> `workers/signup/README.md`.

`COUNTRY_POLICY = 'block'` in `workers/signup/worker.js`. IN, PK, NG, BD and EG
can no longer create an account. Everything else about the site is unchanged.

## The numbers this rests on

PostHog, whole site, the 180 days to 22 Sep 2026. Tier split is the existing
`LOW_CONVERSION_COUNTRIES` list.

| tier | signups | enrich runs | saw pricing | paid |
|---|---:|---:|---:|---:|
| standard | 1,151 | 5,038 | 1,196 | 24 |
| low_conversion | 1,420 | 4,470 | 401 | **1** |

**55% of signups. 47% of the enrichment we pay a supplier for. 4% of customers.**

Per country, the same window:

| | visitors | signups | enrich runs | paid |
|---|---:|---:|---:|---:|
| IN | 13,231 | 978 | 2,687 | 1 |
| PK | 3,094 | 248 | 915 | 0 |
| NG | 412 | 86 | 428 | 0 |
| BD | 751 | 69 | 186 | 0 |
| EG | 512 | 39 | 254 | 0 |
| US (for scale) | 9,675 | 318 | 1,647 | 11 |

Nigeria is the sharpest case: 412 visitors produced 86 signups — a 21% signup
rate against the US's 3.3% — then 428 enrichment runs and no revenue at all.
That is not a market discovering the product. That is a free credit grant being
spent.

India is the opposite shape and the harder call: it is the single largest source
of traffic on the site, 28.7% of all visitors, ahead of the US.

## So the cost claim is true

It was worth checking rather than assuming, and it holds. This tier is roughly
half of what the free tier costs to run and one customer in twenty-five.

## What blocking actually buys, and what it costs

**Buys:** ~47% of free-tier enrichment spend, permanently, from the day it is
pasted. Plus the second-order saving nobody counts — support volume, the
`credits_exhausted` rescue machinery, and the KV reads on every refused signup,
which is why the check sits before them rather than after.

**Costs, measured:** one paying customer per six months.

**Costs, not measured — these are the honest caveats:**

1. **A paying customer's team abroad.** A London or New York account whose SDR,
   VA or contractor works from Bangalore is a real and normal shape for this
   product, and it is worth more than the Indian signups are. This is the
   single reason the block is at the *signup* door and not at the edge:
   existing accounts sign in through the login worker and are untouched. If it
   ever moves to a Cloudflare WAF rule over the whole domain, this stops being
   a caveat and becomes a churn event.
2. **28.7% of traffic now hits a wall.** Rankings should not move — Googlebot
   crawls from US IPs and the marketing pages are still served to everyone —
   but the site's traffic graph is about to fall by roughly a third and that is
   not a bug when it happens.
3. **The one Indian buyer.** There was one. There will not be a second.

## What this does NOT cover

- **The API and the MCP server.** They authenticate by token and never touch
  this worker. A blocked country with a valid key still works, deliberately.
- **Existing accounts.** Login is a different worker. Nobody is locked out.
- **The marketing site.** Every page still serves everywhere. This is not a
  WAF rule and should not become one without re-reading caveat 1.

## The alternative that was not taken

`COUNTRY_POLICY = 'grant'` — same countries can sign up, with zero free
credits. It removes the same ~47% of spend, because the spend *is* the grant,
while keeping the SEO surface, the occasional buyer, and any team member of a
paying account who happens to be in one of those countries.

On the measured numbers it is the better trade: identical saving, no revenue
given up, no traffic cliff. It was not chosen because the instruction was to
ban them. Changing course is one word in `workers/signup/worker.js`.

`docs/geo-pricing.md` argued for a third option — a $5 micro-pack — on the
finding that this tier *reaches* the pricing modal at near parity (401 opens)
and stops at the number. That experiment is now moot for these five countries.

## Reversing it

One line, then re-paste the Worker:

```js
const COUNTRY_POLICY = 'block';   // 'block' | 'grant' | 'tier'
```

`'tier'` is the pre-22-Sep behaviour exactly.

## Deploying it

**`wrangler deploy` from `workers/signup/` is still wrong** — see that folder's
README. There is no `wrangler.toml`, the live Worker's two KV bindings would go
missing, and `isDisposable()` and the rate limiter both fail *open* when their
namespace is absent. Paste `worker.paste-safe.js` into the Cloudflare dashboard
editor. **Until that paste happens, nothing in this document is live.**

## Measuring it

`signup_blocked_country` fires on both paths (email and Google). Watch:

- **`signup_blocked_country` vs `signup_success`** — the block is working if
  the first is ~55% of what signups used to be.
- **`enrich_started` total** — should fall ~45% within two weeks. If it does
  not, the paste did not happen.
- **Churn on existing accounts.** This is the one that would say the block was
  a mistake, and it is the one that will not show up in a signup metric. Caveat
  1 above is the thing to watch, for a quarter, not a week.
