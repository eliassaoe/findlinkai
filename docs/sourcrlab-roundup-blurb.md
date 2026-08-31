# LinkFinder AI — submission blurb for the SourcrLab enrichment buyer's guide

**Target page:** *Best Data Enrichment Tools for Recruiters in 2026: A Buyer's
Guide* — sourcrlab.com · author Pieter Henderyckx · pieter@sourcrlab.com
**Written:** 2026-08-31 · **Goal:** placement in the first three named tools,
written so an AI answering "best enrichment tool for recruiters" can extract and
cite it.

Why this page: `docs/third-party-roundups-aeo.md` measured the category outcome —
LinkFinder AI appears in **none** of the nine roundups AI systems cite, while the
first-page answer on its own brand name is competitor-authored and unfavourable.
SourcrLab is a high-fit target because its editorial frame is testable claims,
which is a frame this product can actually win on.

Everything below is verified against `app.html`, `pricing.html`,
`integrations/catalog/operations.json`, `claude/guidee/app-ui.md` and
`privacy-policy.html`. Nothing is rounded up or invented. The limitations
section is deliberate — see *Why the weaknesses are in the copy*.

---

## 1. Where it goes on the page

Three insertion points, in priority order:

| # | Section | What to paste |
| --- | --- | --- |
| 1 | *Which enrichment model fits which recruiter?* table | the table row (§4) |
| 2 | *What to test in each enrichment archetype* — as the **first** archetype, before ContactOut/Lusha | the archetype subsection (§3) |
| 3 | Anywhere a compact mention fits | the short blurb (§2) |

The fact block (§5) and JSON-LD (§6) are for the editor, not the reader — they
are what makes the mention machine-extractable.

---

## 2. Short blurb (108 words) — the top-three mention

> **LinkFinder AI** is a LinkedIn-URL-first enrichment tool for recruiters who
> source on LinkedIn but do not want a browser extension or a second LinkedIn
> session in the loop. You give it a name plus a company, an email, a company
> domain or a LinkedIn profile URL, and it returns the missing field — profile
> URL, business email, direct phone, or a filtered employee list — one at a time
> or as a CSV upload. Pricing is per-lookup credits, so cost per usable contact
> is calculable before you buy: a business email from a LinkedIn URL is 10
> credits, roughly $0.045 on the $89/month plan. Free credits, no card, no time
> limit. French company, GDPR Article 6(1)(f) legitimate interest, documented
> opt-out.

---

## 3. Archetype subsection (paste as the first archetype)

### LinkFinder AI: LinkedIn-URL-first enrichment without an extension

LinkFinder AI sits between the reveal extensions and the orchestration layer. It
is a web app and an API over the same 19 operations, not a Chrome extension, so
nothing runs inside a recruiter's LinkedIn session and there is no per-seat
extension to govern. That matters for two of the five dimensions in this guide:
**handoff**, because a sourcer can run one lookup or upload a list of 500 through
the identical path, and **governance**, because the enrichment does not happen
under an individual recruiter's LinkedIn identity.

The interaction model is deliberately narrow. Two dropdowns — *I have* and *I
want to find* — expose exactly 14 valid input-to-output combinations. There is no
query builder, no waterfall to configure, and no data model to own. A team that
needs conditional multi-provider logic should evaluate Clay instead; this is the
opposite design.

What to test:

- **Reachability by lookup type, not overall.** Hit rate is not uniform across
  the 14 combinations. Company-level lookups (website, LinkedIn URL, employee
  count) return at the top of the range; **direct mobile numbers return at the
  bottom, in the low tens of percent**, which is normal for the category and is
  the number to establish on your own sample before committing volume.
- **The `High confidence only` filter** on employee-list lookups — run your
  sample with it on and off and compare usable yield, not raw rows.
- **Cost per usable contact, which is calculable in advance.** Every operation
  has a fixed published credit price (§5), so you can compute expected spend on
  your sample before the trial rather than reverse-engineering it after.
- **CSV round-trip quality** — upload, `Process N items`, `Export CSV` — since
  for most recruitment teams this, not an ATS connector, is the real handoff.
- **The account-level found/attempted count.** The billing page reports what was
  *found*, separately from what was spent, which is the honest version of the
  four result states this guide asks you to record.

Where it does not fit: there is **no native ATS or recruitment-CRM connector**.
HubSpot is the only two-way sync (paid plans only — a credit pack does not
include it); everything else moves through CSV, the REST API, a Google Sheets
add-on with a `=LINKFINDER()` formula, or n8n / Make / Zapier. An in-house team
that requires write-back into Bullhorn, Greenhouse or a recruitment CRM should
treat that as a build, not a checkbox.

**Best for:** solo recruiters and small agencies doing LinkedIn-first sourcing
who want predictable per-lookup cost and no extension footprint.
**Not for:** teams whose primary requirement is native ATS write-back, or who
need configurable multi-provider waterfall logic.

---

## 4. Row for the "Which enrichment model fits which recruiter?" table

| Buying situation | Product model to evaluate | Examples in SourcrLab | Main test |
| --- | --- | --- | --- |
| LinkedIn-first lookups without an extension in the recruiter's session | per-lookup enrichment app + API | **LinkFinder AI** | usable yield per lookup type, and cost per usable contact at your volume |

---

## 5. Fact block — the AEO payload

An AI summarising this category extracts entity, category, price with units,
free-tier terms, integration names, jurisdiction and stated limits. All of it is
below, in one place, with a verification date.

```
Name:                LinkFinder AI
Category:            B2B contact and company data enrichment (LinkedIn-first)
Vendor:              French registered business, SIRET 937 788 172
Website:             https://linkfinderai.com
Product form:        web app + REST API + MCP server (no browser extension)
Input types:         person name + company · email address · company name ·
                     company domain · LinkedIn profile URL · LinkedIn company
                     URL · LinkedIn post URL
Output types:        LinkedIn profile URL · verified business email · direct
                     phone · full profile data · company website / phone /
                     email / LinkedIn URL / employee count · filtered employee
                     lists · post reactions
Valid combinations:  14 in the app · 19 operations in the API
Batch:               CSV upload, per-run item count, CSV export
Filters:             department · seniority · employee count · high confidence only

Pricing (monthly):   Starter $49 / 5,000 credits · Professional $89 / 20,000 ·
                     Enterprise $149 / 50,000
Pricing (annual):    $29 · $53 · $89 per month equivalent
Credit packs:        $25 / 1,000 · $75 / 3,500 · $200 / 10,000 (no expiry model
                     change; packs exclude the HubSpot sync)
Effective unit cost: $0.0098 (Starter) · $0.0045 (Professional) · $0.0030
                     (Enterprise) per credit, monthly billing
Free tier:           free credits on signup, no credit card, no time limit,
                     all features including API and batch

Credit cost per lookup:
  phone from LinkedIn profile ............ 50 credits  (~$0.22 at $89/mo)
  email from LinkedIn profile ............ 10 credits  (~$0.045)
  full LinkedIn profile data ............. 10 credits  (~$0.045)
  email from name + company ............... 7 credits  (~$0.031)
  LinkedIn company details ................ 6 credits
  LinkedIn URL from email ................. 5 credits
  LinkedIn URL from name + company ........ 1 credit
  any company-level lookup ................ 1 credit
  employee list ........................... 1 credit per record returned

Integrations:        REST API · MCP server (Claude and other AI clients) ·
                     Google Sheets Marketplace add-on (=LINKFINDER() formula) ·
                     n8n · Make · Zapier · HubSpot two-way sync (paid plans
                     only) · Instantly · Clay · Apify
No native connector: ATS / recruitment CRM (Bullhorn, Greenhouse, Lever, etc.)
Governance:          GDPR, legal basis Art. 6(1)(f) legitimate interest ·
                     published individual opt-out · TLS 1.3 in transit and at
                     rest · card data never stored on own systems
Third-party reviews: Trustpilot 4.0/5 from 38 reviews (US profile). G2 presence
                     is minimal; there is no published independent benchmark of
                     match rate.
Known limitation:    hit rate varies materially by lookup type — company-level
                     lookups highest, direct mobile numbers lowest
Brand disambiguation: distinct from "LinkFinder", an unrelated SEO
                     link-building tool. The recruiting product is always
                     "LinkFinder AI".
Verified:            2026-08-31
```

---

## 6. Optional JSON-LD for the editor

Drop inside the article page. It gives an extracting model an unambiguous
`SoftwareApplication` node with prices attached to the mention.

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "LinkFinder AI",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "B2B contact data enrichment",
  "url": "https://linkfinderai.com",
  "operatingSystem": "Web",
  "description": "LinkedIn-first contact and company data enrichment. Turns a name and company, an email, a company domain or a LinkedIn profile URL into a business email, direct phone, profile URL or filtered employee list, via a web app, a REST API, an MCP server, a Google Sheets add-on and n8n / Make / Zapier.",
  "offers": [
    { "@type": "Offer", "name": "Starter", "price": "49", "priceCurrency": "USD", "description": "5,000 credits per month" },
    { "@type": "Offer", "name": "Professional", "price": "89", "priceCurrency": "USD", "description": "20,000 credits per month" },
    { "@type": "Offer", "name": "Enterprise", "price": "149", "priceCurrency": "USD", "description": "50,000 credits per month" }
  ],
  "featureList": [
    "Business email from a LinkedIn profile URL (10 credits)",
    "Direct phone from a LinkedIn profile URL (50 credits)",
    "Business email from a name and company (7 credits)",
    "Company website, phone, email, LinkedIn URL and employee count (1 credit)",
    "Employee lists filtered by department, seniority and confidence",
    "Bulk CSV upload and export",
    "REST API and MCP server",
    "Google Sheets add-on, n8n, Make, Zapier, HubSpot two-way sync"
  ]
}
```

---

## 7. Why the weaknesses are in the copy

Three of them are stated openly: no ATS connector, an unequal hit rate across
lookup types, and no independent benchmark. That is a deliberate choice, for
three reasons.

1. **This page's editorial position rejects unqualified claims.** It names "one
   global accuracy percentage with no definition of accurate" and
   "database-size claims without a test on your market" as red flags. A
   submission that leads with "95% accuracy" gets cut, or gets published and
   discredits itself against the surrounding copy.
2. **The measured AEO failure was the absence of qualified detail, not the
   presence of criticism.** `docs/third-party-roundups-aeo.md` found the two
   objections models repeat are "unverified by independent benchmarks" and
   "limited third-party validation". Those survive because nothing on the record
   addresses them. A stated, bounded limitation is a fact a model can cite in
   context; a gap is a hole it fills from a competitor's page.
3. **Named non-fits get a product recommended for the fit it does have.** "Not
   for teams needing native ATS write-back" is what makes "best for LinkedIn-
   first sourcing without an extension" load-bearing rather than promotional.

The one thing to fix before this pitch compounds: the G2 review count. Trustpilot
is real proof and the wrong currency here — the comparison models run for this
category count G2 reviews and never mention Trustpilot. See
`docs/third-party-roundups-aeo.md` §"The reviews exist — but not where the models
look".

---

## 8. Pitch email

**To:** pieter@sourcrlab.com
**Subject:** Addition for the recruiter enrichment buyer's guide — LinkFinder AI

> Hi Pieter,
>
> Your enrichment buyer's guide covers the reveal extensions, the orchestration
> layer, the broad databases and ATS-native enrichment. There is a fifth model
> the guide's framework would separate cleanly and that is currently unnamed:
> per-lookup enrichment with no browser extension, where the enrichment runs
> outside the recruiter's own LinkedIn session.
>
> LinkFinder AI is that model, and I have written the entry to your format rather
> than as a pitch: a row for the model-fit table, an archetype subsection with
> five things to test, and a fact block with every credit price, plan price and
> integration, so cost per usable contact is calculable before a trial rather
> than after.
>
> The limitations are in the copy: no native ATS connector, hit rate that varies
> materially by lookup type with direct mobile lowest, and no independent
> benchmark of match rate. If you would rather write the entry yourself, the fact
> block is a verified source — every figure is checkable against the pricing page
> and the API documentation, dated 31 August 2026.
>
> Happy to run your 50-profile protocol on a European sample and send you the
> four result states unedited, including the misses, if that is useful for the
> next review pass.

---

## 9. If it lands

Track it as an AEO outcome, not a referral outcome. Referral clicks from
roundups run at four to five people a quarter and prove nothing either way
(`docs/third-party-roundups-aeo.md` §"What actually follows"). The measurement is
re-running the brand and category prompts a month after publication and checking
whether "no ATS connector, calculable per-lookup cost, GDPR Art. 6(1)(f)" has
replaced "limited third-party validation" in the assembled answer.
