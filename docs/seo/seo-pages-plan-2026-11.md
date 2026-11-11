# SEO pages plan, November 2026: what to build, and what it is worth

**Date:** 2026-11-12 · **Owner's brief:** 50–100 new pages on keywords with SEMrush KD < 10,
at least ~50 searches a month, buying intent, picked from an audit of what exists.
**Sources:** repo + `sitemap.xml`; Search Console (`sc-domain:linkfinderai.com`, 90 days to
2026-11-10, via Searchata); PostHog 263837 (90 days); SEMrush US database through RankerFox,
Keyword Magic Tool with filters KD 0–10 and volume ≥ 50.
**Keyword → page list:** [`keyword-plan-2026-11.csv`](keyword-plan-2026-11.csv) (57 pages).

Read `docs/organic-to-paid-2026-10.md` and `docs/gsc-seo-2026-10.md` first. They still hold.

## 1. What exists today

- **269 HTML pages, 251 in the sitemap.** By type: 84 tool and landing pages, 43 API variants,
  36 `best-*` listicles, 33 competitor/alternative pages, 22 resources/blog/cluster pages,
  18 Google Sheets variants and 15 bulk variants.
- **Eight pages make the organic business.** Non-US clicks over 90 days, total 7,848:

  | Page | Clicks |
  | --- | --- |
  | `/linkedin-phone-number-finder` | 3,248 |
  | `/linkedin-email-finder` | 1,273 |
  | `/` (mostly brand) | 1,063 |
  | `/linkedin-search-by-email` | 653 |
  | `/instagram-profile-url-finder` | 482 |
  | `/linkedin-url-finder` | 398 |
  | `/linkedin-profile-scraper` | 214 |
  | `/company-url-finder` | 197 |

  Nothing else passes 80 clicks.
- **About 60 sitemap pages had zero impressions outside the US in 90 days.** Some of these
  are not indexed. Most of the rest were never chosen for a keyword. The `*-alternative` and
  `best-*` pages get impressions at positions 20–80 and almost no clicks, as the October
  doc said they would.
- **US impressions are still mostly bots.** AI fan-out queries make up a large share
  (`cannot assist with linkedin lookup from email`, `extract author name title company from
  linkedin post 74330…`). Judge pages on non-US clicks, as `gsc-seo-2026-10.md` says.

## 2. How organic visitors convert

First pageview from a search engine, 90 days, person level (PostHog):

| Landing | Visitors | Signups | Paid |
| --- | --- | --- | --- |
| `/linkedin-phone-number-finder` | 5,322 | 146 (2.7%) | 1 |
| `/` | 1,840 | 219 (11.9%) | 5 |
| `/linkedin-search-by-email` | 1,659 | 72 (4.3%) | 0 |
| `/linkedin-email-finder` | 1,649 | 127 (7.7%) | 1 |
| `/instagram-profile-url-finder` | 1,415 | 47 (3.3%) | 0 |
| `/linkedin-url-finder` | 985 | 58 (5.9%) | 0 |
| `/company-url-finder` | 592 | 66 (11.1%) | 0 |

- **Visitor → paid is about 0.05% on tool pages.** That is about 8 payments from about
  16,000 organic visitors.
- The single-lookup audience signs up and does not pay (`traffic-capture-verdict.md`).
- **List users pay 5.4% of the time; single-lookup users pay 0.17%** (`paste-a-list.md`).
- So the pages worth building are the ones whose searcher **wants a list**, not one email.

## 3. What SEMrush says is available under KD 10

The KD < 10 space right around the core product is thin. Phrases like `linkedin email finder`
and `email finder` sit at KD 30–60. With KD ≤ 10 and volume ≥ 50, a raw pull of about 2,000
keywords across 25 seeds is mostly noise:

- consumer phone lookups (`look up number for free`, area codes);
- German LinkedIn formatting queries;
- LLM fan-out strings (`ceo founder contact email leadership page`, 300–1,900 "searches"
  each, not people).

Those are excluded. Five families survive:

| Family | Pages | US volume/mo | Avg KD | Intent | Fit |
| --- | --- | --- | --- | --- | --- |
| **A. "[role / industry] email list"**: `cfo email list` 1,000, `cio email list` 880, `uk business email list` 720, `it decision makers email list` 590, `retail industry email list` 590, `hospitality industry email list` 480… | 33 | 19,860 | 3 | **buy a list** (CPC up to $32) | Lead search (title + location + seniority) → profiles + emails, CSV. Exactly what pays. |
| B. "[platform] email finder": instagram, youtube, twitter, facebook, tiktok, best email finder tool | 6 | 2,680 | 6 | find one creator's email | like `/instagram-profile-url-finder`: signs up, rarely pays |
| C. "[company] email format": Morgan Stanley 590, Piper Sandler 260, Meta 170, Eli Lilly, McKinsey, Boeing, J&J, JLL… | 10 | 2,000 | 8 | reach one person at that company | `lead_full_name_to_email`; can scale to hundreds of companies under 50/mo each |
| D. Free mini-tools: email separator 390, email lookup 320+, business email addresses 320, phone number extractor, domain from email | 6 | 2,730 | 5 | utility | traffic and links; weak buyers |
| E. `export sales navigator leads` (CPC $26), `done for you lead generation` | 2 | 370 | 6 | buy | bulk CSV / Done For You |

SEMrush caps each view at 100 rows. The `email list` phrase alone has **134 keywords,
25,420 searches/mo, average KD 3%**, so family A can grow past 33 pages. Volumes are US
only; worldwide is roughly twice that.

Left out on purpose:

- **Technographic lists** (`salesforce crm users email list`, `3com users email list`): we
  cannot build them.
- **Postal and consumer lists** (`new movers mailing list`, `homeowner mailing list`): not
  our product.

### Plus: pages Search Console says we already half-rank for, with no dedicated page

| Query | Impressions (90 days, all countries) | Position | Today's page |
| --- | --- | --- | --- |
| linkedin email extractor | 1,029 | 11.3 | `/linkedin-email-finder` |
| linkedin email finder extension | 623 | 15.6 | `/linkedin-email-finder` (we have no extension, so the page is "no extension needed") |
| find employees of a company / employee finder | 216 / 138 | 8.8 / 8.1 | `/company-employee-finder` (bot-heavy page) |
| find company contacts | 219 | 18 | `/company-details-finder` |
| linkedin data extractor | 415 | 21.5 | `/linkedin-profile-scraper` |
| contact enrichment api | 267 | 19.1 | `/lead-enrichment-api` |
| instagram email finder | 359 | 29.5 | `/instagram-email-finder` (exists; needs content + links) |

About 7 pages. Plan total: **~65 pages now, room for ~100** by widening family A.

## 4. What it is worth (estimate, not a promise)

Assumptions, from our own data where we have it:

- **Ranking 4–6 months after publishing:**
  - Family A (KD ~3): 60% of pages in the top 3 (~15% CTR) and 30% at positions 4–10
    (~4% CTR), so ~10% of searches overall.
  - Other families: ~7%.
  - Worldwide traffic = 2× US.
- **Conversion:**
  - Tool-page traffic converts as it does today: **0.05% visitor → paid**.
  - Family A is list intent, so ~5% signup × ~4% paid (CSV users pay 5.4%) = **0.2%**.
- **Value of a payer:**
  - ~$150 lifetime: packs $25–200 one-off, subscriptions $49–99 at 22%/month churn
    (`revenue-baseline-2026-11.md`).
  - About 40% subscribe, at ~$60/month.

| | Low | Base | High |
| --- | --- | --- | --- |
| New organic visits/mo (vs ~2,600 non-US clicks today) | 2,500 | **5,400** | 8,000 |
| New signups/mo | 110 | **250** | 400 |
| New payers/mo | 2–3 | **~9** | ~14 |
| New revenue (lifetime value) per month, once ranked | ~$400 | **~$1,350** | ~$2,100 |
| Year one, with a 6-month ramp | ~$3.5k | **~$11k** | ~$17k |
| Subscription MRR it settles at (new subs ÷ 22% churn) | ~$270 | **~$980** | ~$1,500 |

For scale, Dodo MRR today is ≈ $394.

**The base case roughly triples MRR. Family A carries ~85% of it.** Families B–D add traffic
and signups, not money. Build them second or as cheap templates.

## 5. What has to be true for family A to pay

1. **Each list page must hand the visitor a list, not a lookup box.**
   - CTA: "Get 50 [CFOs in the US] with emails free".
   - It lands on `/free-list` with the search pre-filled (title, location).
   - After signup the full list runs on lead search at 15 credits per lead with email.
   - **Owner decision needed:** lead search was unlinked from the app on 10 Nov
     (`docs/lead-search.md`). These pages need it reachable, at least from `/free-list`.
2. **Show a real sample on each page.** For example, 10 rows (name, title, company, city)
   with emails masked, pulled once from lead search. Do it per page, not as one template
   with the title swapped in. Thin template pages are what Google now drops.
3. **Price the list in plain words.**
   - 1,000 CFOs with emails ≈ 15,000 credits ≈ Professional plan, $99/month.
   - Our vendor cost is ≈ $0.012/lead.
   - The list vendors ranking today sell at $0.10–0.50 per contact.
4. Internal links: a hub `/email-lists` linking every list page, and footer links from the
   eight money pages.
5. Measure on non-US clicks and on `us_list_*` / `fr_list_*` events, not on impressions.

## 6. Order of work

1. GSC gap pages (7). Fastest clicks, because they already rank on the second page.
2. Family A top 15 by volume, with real samples, plus the `/email-lists` hub.
   Re-check SEMrush and GSC after 6 weeks.
3. Rest of family A, then C (company email formats, templated with real pattern data),
   then D tools, then B.
