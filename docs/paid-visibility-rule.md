# Paying for visibility: the owner's rule (20 Nov 2026)

**Outreach first.** Links and mentions come from outreach (MentionAgent, swaps), not from buying.

We pay for visibility (links, ads, newsletter or creator sponsorships, media) **only for an obviously
exceptional offer: at least ~80% saved**, e.g. "pay 100, get 1,000 of backlinks / ad credit". A normal
promo (20% off Rhino Rank, FatJoe, 10% off AppSumo) is **not** worth the effort: the owner's words,
"on s'en bat les couilles". Lifetime deals (AppSumo, Dealify) are fine when the tool is useful.

## Checked on 20 Nov 2026 (Black Friday)
| Offer | Deal | Passes the 80% rule? |
| --- | --- | --- |
| Rhino Rank | 20% off, or 25% credit back, until 30 Nov | No |
| FatJoe | 20% sitewide until Cyber Monday | No |
| AppSumo Black Friday | 10% off (19% Plus) | No (but Press Ranger $67 and Visby $71 LTDs are useful) |
| Semrush / Ahrefs / Moz / SE Ranking | No deal | — |
| Microsoft Ads, new advertiser | Spend ~$250, get up to $1,000 credit (amount varies by region) | **Yes** (~4×) |
| Google Ads, new account | 2× credit: spend $500, get $1,000 (limited time, countries not stated) | Close: ~67% of the total budget is free |
| Reddit Ads via Secret | Spend $1,000, get $1,000, needs a $149/yr Secret membership | No |
| Newsletter sponsorships | No Black Friday discounts found | — |

Before spending ad credit on LinkFinder: signups are refused from many countries
(docs/growth-diagnosis-2026-11.md), so target only allowed countries.

## Google Ads for LinkFinder AI: the calculation (20 Nov 2026) — not profitable, not launched
Semrush US CPCs: email lookup $1.51 (9.9k/mo), reverse email lookup $1.57 (8.1k), phone number finder $1.23
(8.1k), email finder $3.59 (6.6k), find email address $3.59, linkedin email finder $5.94 (1k), linkedin scraper
$7.93, email finder tool $6.34, apollo alternative $23, lusha alternative $43, data enrichment tool $77.

What a visitor is worth (docs/organic-to-paid-2026-10.md, docs/growth-diagnosis-2026-11.md):
- organic visitor → paid ≈ 10 / 14,000 = 0.07% (best page, `/`, 0.3%);
- ~73% of organic clicks come from countries refused at signup; ads would target allowed countries only, so
  an eligible visitor converts ≈ 0.07% ÷ 0.27 ≈ 0.26%;
- LTV ≈ $56 ARPU ÷ 22% churn ≈ $255 (pack buyers less).
→ a click is worth ≈ 0.26% × $255 ≈ **$0.65**, against $1.2–$8 per click (×3 cheaper with a 2× credit at best:
$0.41–$2.65). Only the cheapest consumer queries ("email lookup") come near break-even, and their intent is
people-search, not B2B. Re-run when signup → paid improves (the pricing-modal leak) or LTV rises (annual/agency).

### Per page, not site-wide (owner's correction, 20 Nov 2026)
Organic visitors landing on one tool page, last 180 days (PostHog, first pageview from a search engine):

| Landing page | Visitors | Signups | Paid |
| --- | --- | --- | --- |
| `/linkedin-search-by-email` (reverse email lookup) | 4,051 | 229 | **4** (GB, FR, UA, CY) |
| `/` | 3,049 | 410 | 9 (US 3, FR 2, IN, CA, AE, UY) |
| `/linkedin-phone-number-finder` | 5,943 | 154 | 1 (4,252 visitors from India, 0 paid) |
| `/linkedin-email-finder` | 4,279 | 314 | 0 |
| `/linkedin-profile-scraper` | 2,222 | 61 | 0 |

`/linkedin-search-by-email`, visitors from the countries we would target (US, GB, CA, FR, …): ~800 → ~4 paid ≈ **0.5%**.
At LTV ≈ $200–255 a click there is worth **≈ $1.00–1.25** (4 payers: small sample).

Targeted keywords for that page (Semrush US): linkedin search by email 110/mo $1.94 · email to linkedin 110 $4.60 ·
linkedin email lookup 70 $2.73 · search linkedin by email 50 $2.95 · linkedin lookup by email 40 $2.47.
- At list price: every one costs more than a click is worth → no.
- With a confirmed 2× credit (cost ÷ 3): $0.65–0.98 for the first four → **profitable**, but ~270 searches/mo in the
  US → roughly 100 clicks/month → about one new payer every 2 months.
- Broad "reverse email lookup" ($1.57, 8.1k/mo) is people-search intent; our 0.5% is from LinkedIn-specific searchers,
  so it would not hold. Not included.
Decision: only as a capped test, and only if the 2× credit shows up when the account is created.
