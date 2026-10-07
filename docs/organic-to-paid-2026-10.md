# Organic search → paid: where the 10× actually is

**Date:** 2026-10-07 · **Source:** PostHog 263837, last 90 days. One-off
queries, not saved metrics.

## Organic traffic is bigger than Semrush says

| channel | sessions (90d) |
| --- | --- |
| Organic Search | 19,571 |
| Direct | 8,173 |
| Email | 1,428 |
| Referral | 1,412 |
| AI | 315 |

~6.5K organic sessions/month. Semrush shows 1.6K (US desktop only).

## Seven tool pages are the whole organic business

First pageview from a search engine, by landing page (person level):

| page | organic visitors | signups | paid |
| --- | --- | --- | --- |
| `/linkedin-phone-number-finder` | 2,771 | 129 | 1 |
| `/linkedin-email-finder` | 2,385 | 183 | 1 |
| `/linkedin-search-by-email` | 2,129 | 140 | 2 |
| `/instagram-profile-url-finder` | 2,039 | 69 | 0 |
| `/` | 1,646 | 279 | 5 |
| `/linkedin-url-finder` | 1,218 | 74 | 1 |
| `/linkedin-profile-scraper` | 1,110 | 38 | 0 |
| `/company-url-finder` | 628 | 68 | 0 |

All 36 `*-alternative` pages together: ~40 organic visitors in 90 days.
All `best-*` listicles together: ~600, mostly `/best-social-media-finder`.
**Do not build more competitor/listicle pages expecting traffic** until
they have backlinks; the data says they don't rank.

## The bottleneck is after signup, not before

| step (90d) | people |
| --- | --- |
| `signup_success` | 1,694 |
| `enrich_started` | 1,236 |
| `free_limit_modal_shown` | 1,380 |
| `pricing_modal_opened` | 381 |
| `upgrade_clicked` | 322 |
| `plan_selected` | 83 |
| `checkout_redirect_started` | 38 |
| `checkout_session_created` | 27 |
| `checkout_payment_success` | 16 |

- Signup → paid ≈ **0.9%**. Same finding as `docs/traffic-capture-verdict.md`.
- **Pricing modal opened → plan selected: 22%.** Biggest single leak.
- Checkout redirect started → session created: 71%. `checkout_redirect_stalled`
  (9 people) + `checkout_error` (4) — see `workers/dodo-checkout/README.md`.

10× paying users from organic means fixing the 381 → 16 stretch first. 10×
traffic at today's conversion is ~160 payments; 3× conversion on today's
traffic gets ~50 with no SEO work at all.

## What shipped for this (branch `claude/seo-cleanup-money-pages`)

Footer now links `/linkedin-phone-number-finder` and `/company-employee-finder`
sitewide; redirect stubs fixed and out of the sitemap; see the commit message.
