# Revenue baseline, 9 Nov 2026 — MRR, churn, and what SEO can add

Sources: Dodo AI (asked in the dashboard, 9 Nov), PostHog 263837
(`subscription_renewed`, `subscription_cancelled`, `signup_success`), Search
Console. Read this before projecting revenue.

## MRR is about $870, in two places

| Where | Active paid subscriptions | MRR |
| --- | --- | --- |
| Dodo | 7: one annual Professional ($713/yr), Starter ×4 ($49, one billed €42.87), Professional ×1 ($89) | **$344 + €43 ≈ $394** |
| Gumroad (legacy, still renewing) | 6 that renewed between 14 Oct and 6 Nov: Professional ×2 ($89), Enterprise/Scale ×1 ($149), Starter ×3 ($49) | **≈ $474** |
| **Total** | **13** | **≈ $868** |

Gumroad is invisible in Dodo; its renewals reach PostHog as
`subscription_renewed` with `source = gumroad`. Two Gumroad subscriptions that
renewed on 2 and 6 Oct did not renew in November — treat them as lost unless
Gumroad says otherwise. Check the Gumroad dashboard before quoting the total.

## New subscriptions vs cancellations (Dodo)

| Month | Started | Cancelled |
| --- | --- | --- |
| Jun 2026 | 15 | 2 |
| Jul | 4 | 1 |
| Aug | 3 | 4 |
| Sep | 3 | 2 |
| Oct | 2 | 1 |
| Nov (to 9th) | 0 | 2 |

12 Dodo subscriptions have been cancelled, after 0-3 months (most 1-2).
Recent pace: **~2.5 new subscriptions a month, ~2 cancellations a month**, so
roughly 15-20% of subscribers leave each month. MRR is flat because it is
already at the level where new subscribers only replace leavers.

## Organic search is flat

Search Console clicks: ~190-250 a day from May to early November, no upward
trend. The impression spike from 31 Oct is bot noise (CTR fell to 0.2-0.4%).
PostHog `signup_success` is under-counted since 20 Sep (`docs/smart-start.md`).

## Projection to December 2027

At 15-20% monthly churn the subscriber count settles within about six months,
so end-2027 MRR ≈ (new subscriptions per month ÷ churn) × ~$65.

| Scenario | New subs / month | Monthly churn | MRR end 2027 |
| --- | --- | --- | --- |
| Nothing changes | 2.5 | 18% | ~$900 |
| Alternative pages rank (+1.5 to 2/month from mid-2027) | 4.5 | 18% | **~$1,600** |
| Same, and churn halved | 4.5 | 9% | ~$3,200 |
| Same, churn halved, agencies on $149 lift ARPU to ~$90 | 4.5 | 9% | ~$4,500 |

Churn is the biggest lever: halving it doubles MRR; the SEO plan alone adds
roughly $700.
