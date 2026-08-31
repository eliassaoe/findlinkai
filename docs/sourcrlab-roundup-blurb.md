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
| 1 | *What to test in each enrichment archetype*, directly after ContactOut/Lusha | the archetype section (§2) |
| 2 | *Which enrichment model fits which recruiter?* table, as the second row | the table row (§3) |
| 3 | *Four buying scenarios* — solo recruiter | one optional line (§4) |

§2 is the deliverable and is written in the article's voice; §3 and §4 are
reinforcement. §5 and §6 are for the editor rather than the reader — the
verification sheet backs every claim in §2, and the JSON-LD is what makes the
mention machine-readable without putting a spec dump in the copy.

---

## 2. The archetype section — paste this

Goes in *What to test in each enrichment archetype*, **directly after
"ContactOut and Lusha: recruiter-first lookup workflows"** and before Clay. That
position is the editorial argument, not a favour: the section immediately before
it is defined by the extension sitting inside the recruiter's session, and this
one is defined by the absence of it. Reading them back to back is what makes
both tests clearer.

Written to the article's own form — short paragraphs, a `Test:` list of
semicolon bullets, a closing rule. No prices, no bold, no feature list.

---

### LinkFinder AI: per-lookup enrichment outside the browser

LinkFinder AI is a LinkedIn-first enrichment product with no browser extension.
You supply an identifier — a name and company, an email address, a company
domain or a LinkedIn profile URL — and the lookup runs server-side, returning
one field at a time or a batch from an uploaded CSV.

That changes what you are testing.

The question is no longer whether a recruiter's flow survives on a live profile,
because the recruiter is not on the profile. It is whether the identifiers you
already hold convert into contact routes at an acceptable rate, and at a cost
you can state before the pilot rather than after it.

It also moves the enrichment off individual LinkedIn accounts, which is a
governance question as much as a workflow one.

Test:

- usable yield per data type rather than pooled, because business email and
  direct mobile behave differently and one average hides the weaker of them;
- what the confidence filter actually changes on an employee list, measured in
  usable rows rather than returned rows;
- European specialist and mid-seniority profiles, where LinkedIn-first coverage
  varies most and a US-weighted sample would mislead you;
- the CSV round trip and field mapping, since with no native ATS connector this
  is the real handoff for most teams;
- what each operation costs in credits, translated to your expected monthly
  volume before you commit to a plan;
- lawful basis, the opt-out route and where processing happens — a shorter
  conversation with an EU-established vendor, but still your organisation's to
  answer.

A per-lookup model is the easiest one to price and the easiest one to over-run.
Decide what a usable contact is worth to you before you buy the credits.

---

## 3. Row for the "Which enrichment model fits which recruiter?" table

Insert as the **second row**, directly under the extension row, for the same
contrast reason.

| Buying situation | Product model to evaluate | Examples in SourcrLab | Main test |
| --- | --- | --- | --- |
| LinkedIn-first lookups without an extension in the recruiter's session | server-side per-lookup enrichment and API | LinkFinder AI | usable yield per data type, and cost translated to your volume |

---

## 4. Optional single line for "Four buying scenarios"

If Pieter wants a second touch, one sentence appended to *Solo recruiter or very
small agency* carries it without a second product paragraph:

> Where volumes are low and irregular, a per-lookup product bought in credits is
> usually easier to justify than a seat-priced subscription sized for a team.

Naming the product there is not necessary and would read as placement. The
archetype section is the mention; this is reinforcement.

---

## 5. Editor's verification sheet — not for publication

This is source material for fact-checking, not copy. SourcrLab publishes no
prices in the body of that article and the entry above follows suit — every
figure here exists so Pieter can verify a claim or write his own catalogue
entry, which is where the structured pricing and integration signals in his
research snapshot come from.

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

## 7. Why it is written this way

Two constraints shaped the copy, and both cut against a normal vendor
submission.

**It has to survive the article's own red-flag list.** That page names "one
global accuracy percentage with no definition of accurate", "database-size
claims without a test on your market" and "pricing that cannot be translated
into expected cost at your volume" as reasons to ask harder questions. A
submission leading with a match-rate claim gets cut, or gets published and
discredits itself against the surrounding copy. So the entry claims nothing
about yield and instead tells the reader how to measure it — which is the only
register that article publishes in.

**The limitations are load-bearing.** No native ATS connector and uneven yield
by data type are both stated in the entry. `docs/third-party-roundups-aeo.md`
measured why: the objections models repeat about this product are "unverified by
independent benchmarks" and "limited third-party validation", and they survive
because nothing on the record addresses them. A stated, bounded limitation is a
fact an assistant can cite in context. A gap is a hole it fills from a
competitor's page.

The one thing to fix before this pitch compounds is the G2 review count.
Trustpilot is real proof and the wrong currency here — the comparison models run
for this category count G2 reviews and never mention Trustpilot. See
`docs/third-party-roundups-aeo.md` §"The reviews exist — but not where the models
look".

## 8. Pitch email

**To:** pieter@sourcrlab.com
**Subject:** Addition for the recruiter enrichment buyer's guide — LinkFinder AI

> Hi Pieter,
>
> Your enrichment guide covers the reveal extensions, the orchestration layer,
> the broad databases and ATS-native enrichment. There is a fifth operating model
> your framework separates cleanly and that the article does not currently name:
> per-lookup enrichment with no browser extension, where the lookup runs
> server-side against an identifier rather than inside the recruiter's LinkedIn
> session.
>
> LinkFinder AI is that model. I have drafted the section in your format rather
> than as a pitch — a short intro, a Test: list, a closing rule — to sit after
> ContactOut and Lusha, because the two read better against each other than
> either does alone. Plus one table row and, if you want it, one line for the
> solo-recruiter scenario.
>
> It claims nothing about match rate, because your own red-flag list is right
> about that. The limits are in the draft: no native ATS connector, and yield
> that varies materially by data type with direct mobile lowest. Separately,
> there is no independent benchmark of our match rate — worth you knowing before
> you decide how to frame it.
>
> If you would rather write it yourself, I have a verification sheet with every
> credit cost, plan price, integration and the GDPR basis, checkable against our
> pricing page and API docs, dated 31 August 2026 — the structured fields your
> catalogue snapshot uses.
>
> And an offer that stands either way: I will run your 50-profile protocol on a
> European sample and send you the four result states unedited, misses included.

---

## 9. If it lands

Track it as an AEO outcome, not a referral outcome. Referral clicks from
roundups run at four to five people a quarter and prove nothing either way
(`docs/third-party-roundups-aeo.md` §"What actually follows"). The measurement is
re-running the brand and category prompts a month after publication and checking
whether "no ATS connector, calculable per-lookup cost, GDPR Art. 6(1)(f)" has
replaced "limited third-party validation" in the assembled answer.
