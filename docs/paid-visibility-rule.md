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

### Microsoft Ads (Bing) for LinkFinder AI (20 Nov 2026)
- Our own organic data, 180 days: Google 31,985 visitors → 20 paid; **Bing 1,209 → 1 paid**; Yahoo 153 → 1;
  DuckDuckGo 169 → 0. On `/linkedin-search-by-email`: Google 4,048 visitors, **Bing 2**. Bing ≈ 4% of our search traffic.
- Clicks are ~20–40% cheaper than Google for B2B SaaS (TripleDart benchmarks), conversion ~10–15% lower, and
  Microsoft can target by LinkedIn profile (job function, industry).
- Sign-up offers shown on Microsoft's SMB page: $500, $1,000 or $1,500 credit once a spend threshold is met; the
  threshold, window and countries are only shown at account creation (third parties report ~$250 spend → $1,000).
- Verdict: the reverse-email-lookup keywords have almost no Bing volume, so the credit could not be spent there.
  Worth it only as a cheap test if the threshold is ≈$250 for ≈$1,000: wider keywords (email finder, linkedin
  email finder) restricted with LinkedIn-profile targeting (sales, recruiting, marketing), paying countries only.
  Break-even then ≈ 1–2 new payers.

### Every page that ever sold, with its keywords (20 Nov 2026, owner's method)
PostHog, 365 days, first page from a search engine, "rich" = US, GB, CA, AU, FR, DE, NL, BE, CH, ES, IT, IE, Nordics,
AT, NZ, PT, PL. Value per click = conversion × LTV ≈ $255. CPC = Semrush US.

| Page | Rich search visitors | Paid | Conv. | Click worth | Keywords (US vol/mo, CPC) |
| --- | --- | --- | --- | --- | --- |
| `/` (brand) | 2,549 | 9 | 0.35% | ~$0.90 | linkfinder ai 50 **$7.73 (someone bids on our brand)**, linkfinder 320 $1.79 |
| `/linkedin-search-by-email` | 1,223 | 5 | 0.41% | ~$1.05 | linkedin search by email 110 $1.94, linkedin email lookup 70 $2.73, search linkedin by email 50 $2.95, linkedin lookup by email 40 $2.47 |
| `/linkedin-url-finder` | 1,525 | 2 | 0.13% | ~$0.33 | linkedin profile link finder 210 **$0**, find linkedin profile by name and company 110 **$0**, linkedin profile url finder 90 **$0**, linkedin profile lookup 140 $2.28, linkedin finder 90 $4.29 |
| `/company-url-finder` | 634 | 1 | 0.16% | ~$0.40 | company url finder 20 $5.24 |
| `/linkedin-phone-number-finder` | 481 | 1 | 0.21% | ~$0.53 | linkedin phone number finder 40 $5.39 |
| `/best-social-media-finder` | 1,032 | 1 | 0.10% | ~$0.25 | social media finder 2,400 $1.56, find social media accounts by email 1,600 $1.92 |
| `/company-details-finder` | 44 | 1 | — | — | company information lookup 110 $2.09 |
| `/enrichlayer-alternative` | 1 | 1 | — | — | proxycurl alternative 30 $11.50, enrichlayer alternative ~0 |

Countries (non-brand search, 365 d): US 4,956 → 4 payers (7 payments: they stay), GB 1,416 → 2 (3 payments),
CA 845 → 1, FR 746 → 1, ES 397 → 1; **India 16,177 → 0, Pakistan 2,295 → 0**. Samples are small.

Candidates (all small, ~1 new payer a month at best):
1. `/linkedin-search-by-email` keywords, US/GB/CA/EU, **only with the 2× Google credit**.
2. `/linkedin-url-finder` keywords with **$0 CPC** (no advertiser): if the real click is ≤ ~$0.30, profitable even
   without credit. Cheapest test to run first.
3. Brand: an advertiser bids on "linkfinder ai" ($7.73). Our own brand ad would be cheap (high quality score); only
   worth it if their ad sits above our #1 result. Check the live SERP before deciding.
Everything else costs more per click than it earns.

### The real offers, read on the official pages (20 Nov 2026, evening)
- **Google Ads France** (business.google.com/fr/google-ads): spend €400 in 60 days → €400 credit; €1,200 → €800;
  €2,400 → €1,200. At best 1:1, **no 2× offer in France**. Not launched.
- **Microsoft Advertising France** (about.ads.microsoft.com/fr/h/a/microsoft-advertising-smb-advertiser): spend
  €200 → €400 credit; €400 → €800; **€600 → €1,200**. That is the owner's "500 in, 1,000 out" (2×). Conditions
  (Offer Details): new Microsoft Advertising customers billed in France only; credit added automatically once the
  spend threshold is reached, valid **90 days**, unused credit lost; ends 30 Jun 2027.
- Chosen: the €600 → €1,200 tier. Sign-up link carries the promo code `ccl=ADIEM4804FY27FR1200`
  (ui.ads.microsoft.com/campaign/pmaxlitelanding/signup?ccl=ADIEM4804FY27FR1200). The sign-up starts with
  "S'inscrire avec Google / Microsoft": the owner signs in and adds the card himself.
- Plan for the €1,800 total: paying countries only (US, GB, CA, FR, ES, DE…), keywords of the pages that sold
  (table above), LinkedIn-profile targeting (sales, recruiting, marketing). Bing volume on our keywords is small, so
  check after 2 weeks that the €600 can actually be spent; if not, the credit is lost after 90 days.

### Microsoft Ads account, built 20 Nov 2026
- Account **LinkFinderAI (G107SHQ7)**, signed in with the owner's Google, currency EUR, card added by the owner.
  The sign-up banner confirms the offer: €1,200 credit after €600 spent.
- Campaign **"LF Search - LinkedIn lookups - rich countries"**: Search only, AI Max **off**, distribution
  "Sites Microsoft et sélectionner le trafic" (no wide partner network), 19 countries (US, GB, CA, AU, IE, NZ, DE, FR,
  ES, NL, BE, CH, AT, IT, PT, SE, DK, NO, FI), physical presence only, English, enhanced CPC, **€20/day**.
  - Ad group 1 → `/linkedin-search-by-email`, 12 phrase keywords (linkedin search by email…), bid €1.20,
    suffix `utm_source=bing&utm_medium=cpc&utm_campaign=lf-search-email&utm_term={keyword}`.
  - Ad group "LinkedIn URL finder" → `/linkedin-url-finder`, 10 phrase keywords, bid €1.00, `utm_campaign=lf-search-url`.
  - 17 campaign negatives (job, login, sign in, my, copy, hyperlink, premium…).
  - Ad texts only state what the pages say (first search free, no credit card, bulk CSV, API); Microsoft's AI drafts
    ("verified", "hiring", "local talent") were replaced.
- Blocked until the owner finishes **advertiser identity verification** (red banner "Terminer la vérification").
- Read results in PostHog by `utm_source = bing`. Review point: ~€300 spent (cost per signup, payers).

### Optimisation pass, 20 Nov 2026 evening
- **Ad landing pages** (owner: "send ad clicks to an LP, not the free tool; don't touch the SEO page"):
  `/lp/linkedin-search-by-email` and `/lp/linkedin-url-finder`, generated by `ads_lp/build.py` from the SEO tool pages
  (same working widget and scripts), `noindex`, canonical to the SEO page, no JSON-LD/hreflang, not in the sitemap,
  no exits to other tools, Google-first signup (`source=lp_<slug>_<where>`, event `lp_signup_clicked`).
  They drop the SEO pages' testimonial ("Rachel Chen"), "90%/95% accuracy", "5,000+ sales teams", "50K+ API calls"
  — none of these can be backed and ad review rejects misleading pages. `tests/ads-lp.test.mjs` pins it.
  Both ads' final URLs now point at the /lp/ pages (20 Nov, 19:50).
- **UET tag 187299983** (this account), loaded by `js/lf-attribution.js` only for visitors who arrived with
  `msclkid` or `utm_source=bing` (remembered 90 days in `lf_ms_ad_until`), on its own queue `uetq_lf`.
  `lfAdConversion('signup')` in sign-up.html (x2) and confirmation-signup.html; `lfAdConversion('purchase', value)`
  in app.html and account.html. Checked live: the tag loads for an ad visit and `pageLoad` reaches
  `bat.bing.com/p/action/187299983.js`. `tests/ms-ads-uet.test.mjs` pins it.
  Note: 171 pages already hard-code another UET tag (ti 343223134, "Ajout du script UET Bing", 8 Dec 2025) for an
  account that is not this one; left in place.
  Conversion goals created in Microsoft Ads: **Signup** (custom event, action `signup`) and **Purchase** (action
  `purchase`, variable revenue, used for bidding). The action names are Microsoft's, not PostHog's — keep them.
- **Callouts** added: No Credit Card Required, First Search Free, Bulk CSV Upload, API Access, Google Sheets Add-on.
- **Sitelinks** refused at entry ("Produits et services trompeurs") whatever the text or target — including the
  noindex /lp/ pages with no claims on them. So the flag is on the domain or the unverified account, not the copy.
  If the two ads come back disapproved for the same reason after review, appeal from the ad's status
  ("Demander un examen") or ask Microsoft support; do not rewrite the pages again first.
- Both conversion goals count in "Conversions" and feed bidding; enhanced conversions (hashed email/phone) is off.

### Microsoft Ads launched — 20 Nov 2026, 20:40
Owner finished identity verification; account and campaign "Aucun problème", both ads "En instance / Éligible" (editorial
review). The twice-weekly monitoring task (Mon/Thu, Chrome + PostHog, stop rules 300 € / 600 €) was refused by the
scheduled-task permission check; the owner has to approve it before it can exist.

### AppSumo Black Friday 2026 — tested / read (20 Nov 2026)
- **Press Ranger** (journalists, publishers, podcasts DB + pitching; LTD $66.60 tier 1, $133 tier 2 for 2,000 CSV
  exports/mo; 4.57★, 145 reviews). Free account created (Google, hamoureliasse54@gmail.com, company LinkFinder AI,
  media room private). **The free plan already shows journalist profiles with their email** (checked on a "SaaS"
  search). Paid adds connected inbox, AI campaigns, pitch alerts, exports. Press releases are NOT in the deal
  ($299–399 each, syndication links). Verdict: use the free account; buy tier 1 only if a real pitch campaign
  (sales/growth podcasts, data stories) runs into the free limits. Not an 80%-off-with-obvious-ROI case.
- **Sbl.so** (AI LinkedIn outreach SDR; $89 tier 1 = 10,000 connection credits lifetime + 900 lead-gen credits/mo,
  LinkedIn only; 4.47★, 73 reviews; 60-day refund). The only BF deal that is a real acquisition channel for us
  (buyers are sales/recruiting people on LinkedIn). Equivalent tools cost $50–80/month, so ~$89 for ~a year of
  sends passes the 80% rule *if* it does not get the LinkedIn account restricted. Candidate for a 60-day refundable test.
- A-Leads, CluGTM: contact-data providers (competitors / possible suppliers), not visibility. Nothing for Reddit,
  X, influencers or newsletters in the BF drops.

### Microsoft Ads — volume reality check and expansion (20 Nov 2026, 21:30)
Microsoft Keyword Planner, United States, average monthly searches over 12 months (Bing network):
- Every launch keyword (email→LinkedIn, LinkedIn URL finder): **0–10 each**. Alone they would spend a few € a week.
- linkedin email finder **100–1k** (suggested bid €6.50, high competition); email finder **100–1k** (€3.39);
  find email from linkedin 10–100; linkfinder ai (brand) 10–100; apollo alternative 10–100 (€2.36);
  company email finder 10–100 (€20.30); email finder tool 10–100 (€22.87); lead enrichment 10–100 (€6.52);
  linkedin scraper / linkedin profile scraper / linkedin profile lookup 10–100.
- All 35 keywords together: 930–1,800 searches a month in the US.
Added the same evening:
- Ad group **"LinkedIn email finder"** → new LP `/lp/linkedin-email-finder` (ads_lp/build.py), bid €2.00, phrase
  keywords linkedin email finder, find email (address) from linkedin, get email from linkedin, linkedin email
  extractor, email from linkedin profile, linkedin profile email finder, linkedin to email, email finder.
  utm_campaign=lf-search-li-email.
- Ad group **"Brand"** → home page, bid €0.60, linkfinder ai / linkfinder / link finder ai / linkfinderai,
  [linkfinderai.com]. Someone bids on our brand on Google ($7.73); this keeps our own ad on top on Bing.
- 13 more campaign negatives (gmail, outlook, yahoo, hotmail, scam, who is, spokeo, truepeoplesearch, people search,
  dating, instagram, facebook, tiktok) to keep consumer "who emailed me" searches out.
Expected: roughly 30–100 clicks and €50–150 spend a month → the €600 needed to unlock the €1,200 credit takes
4–10 months (offer open to 30 Jun 2027). 1–3 paying customers over six months at best. Bing is a test of the LP's
conversion rate; the volume that matters is on Google.

### 20 Nov 2026, 22:00 — Microsoft bids raised, Meta retargeting checked
- Owner wants Microsoft to move faster. Volume is capped by searches, not by the €20/day budget (left as is), so the
  lever is position: bids raised to LinkedIn email finder €3.50, Ad Group 1 (email→LinkedIn) €2.00, LinkedIn URL
  finder €1.50, Brand €0.60. Watch CPC against the ~€1 a click is worth on these pages.
- Meta: business "Linkfinder AI" (684968217970909), ad account **947878880921996 "Linkfinder ai ads account"** (never
  ran a campaign), pixel **2717863625238535** with PageView only (no Purchase/Lead events; a `__missing_event`
  error), Conversions API connected. Website audiences already exist since 20 Feb 2026: LF - Signups, LF - Acheteurs,
  LF - All Visitors, LF - Pricing Page; customer list "paid users" (outdated). The owner's personal ad account
  1698628710593670 has no access to the pixel — do not use it.
- Audience (PostHog, signup_success last 180 days): US/UK/CA/AU/NZ/IE 576 signups, 559 never paid; Western Europe
  310 / 304; rest of world 1,775 / 1,769.
- **Prior that matters:** the Oct 2026 lifetime-deal email to 559 free never-paid users sold 0 (37 clicks, 1 checkout
  started) — see docs/ltd-campaign.md. A Meta retargeting ad with the same $149 LTD to the same kind of people is
  unlikely to do better; the message should push the behaviour that does pay (running a list), not the LTD.

### Meta pixel — audit and fix (20 Nov 2026, 22:15)
Pixel 2717863625238535 ("linkfinder ai pixel", business Linkfinder AI) is healthy, not "burnt": 250–580 events a day
over the last 4 weeks, base code on ~200 pages, Conversions API connected (server copy of part of the PageViews).
Kept it: a new pixel would throw away nine months of visitors and the existing audiences.
Diagnostics found:
1. "Unnamed events" — 7 `__missing_event` hits whose only URL is https://www.facebook.com/ (Meta's own preview/test
   traffic), not our site. Nothing to fix.
2. Conversions API covers fewer PageViews than the pixel (2,787 fewer in 7 days). Informational; the server sender is
   outside this repo (system user "Conversions API System User").
3. "Confirm the domain" — no allow-list exists, so every domain is accepted and nothing is blocked. Left as is.
What was really missing: **no conversion event at all** — only PageView. Added (js/lf-attribution.js `window.lfMeta`,
no-op without fbq; `tests/meta-pixel-events.test.mjs`):
- `CompleteRegistration` on every signup path (sign-up.html ×2, confirmation-signup.html);
- `InitiateCheckout` with value/currency/plan when the Dodo redirect starts (app.html);
- `Purchase` with value + USD + eventID (payment id) on checkout return (app.html; account.html sends value 0);
- custom `UploadList` (rows) when a CSV run completes — the behaviour that predicts payment.
Next: audiences "Signed up − Purchase" and "UploadList" fill from now on; the historical buyer list "paid users" is
outdated (Feb 2026) and should be refreshed before excluding buyers.

### Meta retargeting test — prepared 20 Nov 2026, 22:30 (not live yet)
Blocked on one owner step: creating the "LinkFinder AI" Facebook Page (owner approved) does nothing until the owner's
Facebook account turns on **Advanced Protection (passkey)** — Meta's prompt on page creation. The only Page in the
business is "Elias IA" (deactivated). Ad account 947878880921996 is ready: USD, Mastercard ···4350, auto-pay.
Plan once the Page exists:
- One campaign, Traffic → landing-page views, $10/day to 1 Dec 2026 07:59 UTC (~$100), two ads:
  A "Black Friday lifetime" (`docs/assets/meta-2026-11/ad-bf-lifetime.png`) → `/lifetime-deal?utm_source=meta&utm_medium=paid_social&utm_campaign=rt-bf-ltd`;
  B "Run the whole list" (`docs/assets/meta-2026-11/ad-csv-list.png`) → `/app?action=bulk&utm_source=meta&utm_medium=paid_social&utm_campaign=rt-csv`.
- Audience: website audience "LF - Signups" (exists since Feb 2026), excluding "LF - Acheteurs"; US, UK, CA, AU, NZ, IE.
- Stop: cut an ad after $30 with no click-through to the page; cut all if no lifetime sale and no list run by 28 Nov.
Competitors in the Ad Library (20 Nov): Apollo runs social proof ("4M+ teams", "Your next 10 customers are already in
Apollo") and its Claude integration; Lusha runs the pain of list building ("If your reps are buried in list building…")
and AI-ranked prospect lists. Kaspr and Wiza have no relevant ads running.
Expected (honest): ~350 reachable people, 5,000 impressions, 50–100 clicks. A: 0–1 lifetime sale ($0–299; the Oct email
to the same kind of list sold 0). B: 3–8 list runs → at the 5.4% list-to-paid rate, 0.2–0.4 customers (~$50–100 of
lifetime value). Total ≈ $50–400 back for ~$100: break-even test, the value is learning which message moves this list.

### 21 Nov 2026 — Meta retargeting live, Microsoft still pending

- **Meta**: campaign "LF Retargeting signups - BF lifetime vs CSV list" published (in review).
  One ad set, $10/day, ends 1 Dec 2026 08:30 Paris, original audience mode (not Advantage+):
  include LF - Signups, exclude LF - Acheteurs, "use as suggestion" OFF; US/UK/CA/AU/NZ/IE.
  Optimises for landing-page views. Ad A → /lifetime-deal (utm_campaign=rt-bf-ltd),
  image `ad-bf-lifetime-v2.png`; Ad B → /app?action=bulk (utm_campaign=rt-csv), image `ad-csv-list.png`.
  Meta AI text rewrites and text overlays switched OFF on both (offer wording must stay exact).
- **Pixel fix found while publishing**: the LinkFinder pixel (2717863625238535) was not connected
  to the business ad account 947878880921996; ads defaulted to an inactive "pixel agence ia okko"
  (1251747963766808). Connected it in Business settings → Datasets → Connected assets, and both
  ads now track with the LinkFinder pixel. Any new Meta ad: check "Suivi" shows linkfinder ai pixel.
- **Microsoft**: all 4 ads still "En instance" (editorial review), 0 impressions on 20 Nov.
  UET tag 187299983 now loads for every visitor (commit 48bcab3a) so remarketing lists fill.
  The promo-credit terms sit on the Billing page, which the agent cannot read (screenshots are
  blocked there): the owner reads the spend threshold and deadline himself.

## Selling links: Collaborator.pro listing (26 Nov 2026, owner's call)
Owner: sell about one dofollow link a month for ~$200 to add a few hundred a month; risk explained (Google link
scheme policy, a manual action would hit the whole site's organic traffic) and accepted by the owner.
- Account: Collaborator.pro, owner's Google login (hamoureliasse@gmail.com), switched to Publisher; phone verified by the owner.
- Site id 996480, ownership via the root file `on8glQhgJHclx_MP4ZZaRHK-wtyk_cLib5uqMsUD.html` (keep it; excluded from the sitemap).
- Listing: Article format, $200 publishing, buyer supplies the text (our writing disabled), 1 dofollow link, no ad mark,
  homepage announcement $500, B2B/sales/marketing/SaaS topics only, refused: casino, crypto, forex, loans, CBD, adult,
  pharma, dating, essays. Placement: `/resources/`. Each order is reviewed by hand.
- Sent to moderation 26 Nov ~10:30 Paris (2 business days). Their main criterion is 300+ visitors/day; we are at ~150/day
  (GSC ~4.5k clicks/28 d, mostly India), DR 42 may get the exception.
- Keep it to about one paid link a month, relevant topics only.
- **26 Nov ~10:25: abandoned by the owner.** Market check on Adsy: DR 60-80 sites sell guest posts for $40-150, so a DR 42
  site would fetch ~$40-80 and $300-500/month would need 6-8 paid links (too risky for SEO). Verification file removed;
  Collaborator offers no delete while in moderation: decline any order that arrives. Next: renegotiate with the people who
  already bought listicle placements from us (~$500) through the owner's professional inbox.

## Renegotiation with past and pending link buyers (26 Nov 2026, support@linkfinderai.com)
Grid approved by the owner (« les articles top… la visibilité IA, c'est ça qu'il faut vendre ») — goal $300-500/month,
at most ~4 paid links a month so SEO is not put at risk:
| Offer | Price |
| --- | --- |
| Entry in a "best of" listicle (write-up + 1 dofollow link, permanent) | $200 (2nd entry from the same buyer $150) |
| Guest post (their article, 1,000+ words, 1 dofollow link) | $150 |
| Link insertion | $100 |
| Volume buyer | $100 each, max 3 a month |
Pitch: DR 42 on Ahrefs + our listicles are what ChatGPT/Perplexity pull from. Never casino, crypto, adult, pharma.

Sent 26 Nov (Paris time; names kept, no other personal data):
- SignalHire (paid $500 in Sep) 10:28 — 2 new listicle entries at $175 each.
- Timo / CrowdReply (Byteful, `/best-proxy-providers`, asked "best deal") 11:12 — $200, $150 per extra brand.
  An 11:11 copy went out garbled (two drafts merged, said $150); the 11:12 email apologises and supersedes it.
  Lesson: the privateemail editor ignores DOM edits — always type into an empty reply, never edit a saved draft by script.
- Sam / SearchApi 11:13 — $150 quote of 9 Nov kept, follow-up.
- Inzamam / Apploye 11:14 — guest post $150 (or listicle $200).
- mexx john (gmail) 11:14 — guest post $150 (was $250 on 18 Nov), listicle $200.
- Fatima Anjum (asked $60/$40) 11:15 — $100 each, max 3 a month.
- Mikaela / emailable.com 11:16 — $200 in `/top-best-marketing-automation-platforms`.
Skipped: John Muller ($35), Haider Ali ($40). Next: answer replies, invoice before publishing, log each sale here.
