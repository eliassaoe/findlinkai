# Quick-cash ideas — the backlog

The pattern that works: **an offer to people already in our database who are close to
buying, sent by email, with a deadline.** The lifetime deal (`docs/ltd-campaign.md`)
and annual-by-default were both this. Ranked by speed × size, cheapest first.
Numbers are from 5 Oct 2026; re-measure before acting.

| # | Offer | Who | Why it should work | Effort |
|---|---|---|---|---|
| 1 | **Regional lifetime deal** ($49 / $99) | The ~1,500 confirmed never-paid users outside the high-income list (India 838, Pakistan 180, Nigeria, Bangladesh, Philippines…) | Same machinery as the LTD — new tiers + Dodo products, a cohort, a copy of workflow 28. Excluded from the first LTD only on price, not intent. Run *after* the main LTD closes so nobody sees two prices. | ~1 h |
| 2 | **LTD on AppSumo / Dealify** | New buyers | The `dealify` / `linkfinder dealify` tables suggest it was considered. Marketplaces bring hundreds of LTD buyers; cap codes and monthly credits (same refill cron). | ~1 day + review |
| 3 | **"Last call" LTD reopen, 48 h** | People who clicked checkout on `/lifetime-deal` and didn't pay | `ltd_checkout_clicked` without `ltd_purchased`. Tiny list, highest intent. One email. | 15 min |
| 4 | **Done-for-you list enrichment, $99 one-off** | Free users who uploaded a CSV but hit the credit wall (`bulk_results_gated_shown`, `credits_exhausted`) | They already have the list and the need; sell the result, not a plan. | ~1 h |
| 5 | **Expand the safe list** | ~4,600 accounts never confirmed in `auth.users` but with real usage | Verify the addresses first (our own verifier), then they become sendable for #1 / next LTD. Grows every future campaign. | ~2 h |
| 6 | **Credits top-up to LTD buyers** | LTD buyers at 0 credits mid-month | PAYG pack email when the balance hits 0 (`credits_exhausted` + `ltd_monthly_credits > 0`). Recurring revenue on top of the LTD. | 30 min |

Rules that carry over from the LTD:

- Only `auth.users.confirmed_at` addresses (`docs/email-verified-is-wrong.md`), waves, bounce check.
- Never pitch a cheaper deal to someone who already paid more (refund risk) unless they are
  churned and allowlisted on purpose.
- Revenue is measured server-side (`ltd_purchased`, payment events), never by opens/clicks.
