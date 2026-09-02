# Published claims: what contradicted what, and what it is now

An independent reviewer (SourcrLab) audited the site in September 2026 and its
sharpest finding was not about the product — it was that **our own pages
contradict each other**, so a buyer cannot trust any published figure:

> "the site's own claims about coverage, accuracy, latency and certification
> contradict each other from page to page, so nothing here should be bought on
> a published figure."

That is a credibility problem, not a copy problem. This file records what was
actually wrong, what it is now, and which numbers still need a human answer.

## The rule going forward

**One number per claim, everywhere.** Before publishing any figure, check it
against this file. If a real figure changes, change it here first, then sweep
the site — a number that appears on 40 pages and is updated on 3 is how this
happened.

**Never state a claim we cannot evidence.** Certification, uptime and SLA
claims are the dangerous ones: they are checkable, and being caught
overstating them costs more than the claim ever earned.

## Canonical values

| Claim | Value | Source of truth |
| --- | --- | --- |
| Profiles | **50M+** | needs confirmation — see below |
| Companies | **10M+** | needs confirmation — see below |
| Accuracy | **95%** (90% on the email→phone and email→LinkedIn matching pages) | needs confirmation |
| Response time | **~3s** | `api-documentation` — the only authoritative source |
| Certification | **none claimed** | privacy policy and terms name no certification |
| Uptime / SLA | **none claimed** | terms disclaim uninterrupted availability |
| Starter | **$49/mo**, or **$29/mo billed annually**, 5,000 credits/mo | pricing page |
| Professional | **$89/mo**, **$53** annual, 20,000 credits/mo | pricing page |
| Enterprise | **$149/mo**, **$89** annual, 50,000 credits/mo | pricing page |
| PAYG | $25 / 1,000 · $75 / 3,500 · $200 / 10,000 | pricing page |
| Credit costs | profile 10 · business email 10 · phone 50 · email→LinkedIn 5 · name→LinkedIn 1 · name→email 7 · company 1 · employees 1/record | `app.html` `creditCosts` |

## What was wrong

### 1. The pricing page contradicted itself (worst offender)

The FAQ said *"One credit = one enrichment request"* and priced a profile, an
email, a company record and a **phone number all at 1 credit** — directly under
a table on the same page pricing them at 10, 10, 1 and **50**. A buyer
budgeting from the FAQ would have under-estimated a phone lookup by **50x**.
The FAQ now matches `app.html` `creditCosts`.

### 2. Certification and uptime claims we cannot evidence

- **"SOC 2 Compliant"** badge on 9 of our pages. No auditor, report or date
  anywhere, and the privacy policy and terms name no certification at all.
- **"99.9% API Uptime"** on 22 badges, plus one **"99.9% Uptime SLA"** — while
  the terms of service say availability is *not* warranted and SLA guarantees
  exist only in a custom arrangement. We were promising in marketing what we
  disclaimed in the contract.
- **"SOC 2 practices"** — a weasel version of the same claim.

All removed and replaced with claims we can actually evidence: GDPR compliance
(privacy policy, Art 6(1)(f), CNIL, published opt-out) and "No LinkedIn Account
Needed" (API documentation).

Competitor SOC 2 mentions on comparison pages were **left untouched** — those
are their claims, correctly attributed.

### 3. Latency figures our own documentation contradicts

Published: 50ms, sub-100ms, 100ms, 150ms, 200ms, sub-200ms, 500ms, ~1s, ~2s,
3s. Meanwhile the API documentation states **~3 seconds typical**, and profile
enrichment is an **asynchronous live scrape taking about a minute**.

Every sub-second claim was false against our own docs. 30 of them are now `~3s`.
CSS transition values were excluded from the sweep so no styling broke.

### 4. Coverage that moved by 10x between pages

500M+ profiles on some pages, 50M+ on others, 10M+ / 50M+ companies elsewhere.
Standardised on the **lower** figure in each case — under-claiming carries no
risk, over-claiming does.

### 5. Prices that were simply wrong

- `data-enrichment-company.html` and `b2b-data-companies.html` sold a **$59/month
  plan with 25,000 credits**. No such plan exists. Now $49 / 5,000.
- `seamless-ai-alternative.html`: "Starter is $49/month for **60,000 credits**"
  — that is the annual total, quoted as if monthly. Now 5,000/month.
- `best-company-research-tool-for-prospecting.html`: "$29/month with **10,000
  records**". Now 5,000 credits.
- **81 places across 33 files** quoted LinkFinder at "$29/month" with no
  indication that is the annual rate. All now say "(billed annually)". This is
  what made the reviewer conclude the plan cards disagree with the annual FAQ.

## Not a bug, despite appearances

The pricing page toggle is **correct**: cards carry
`data-monthly="49" data-annual="29"` and JS swaps them. The reviewer read the
static HTML, where only the monthly figure is text.

That still matters — **AI crawlers read the page the same way the reviewer
did**, so the annual price is invisible to them. Worth making the annual figure
readable without JS. Not done here.

## Still needs a human answer

These were made *consistent*, not *verified*. Only the vendor knows the truth:

1. **Real profile and company counts.** 50M+ / 10M+ were chosen as the
   conservative option, not because they are known to be right.
2. **Real accuracy.** 95% is the dominant published figure and 99.2% / 99.5%
   were the outliers, so the outliers went. What is it actually measured
   against — match rate, deliverability, or field-level correctness? The
   reviewer specifically caught us using one number for all three.
3. **Whether any uptime figure can be substantiated.** If it can, it belongs in
   the terms as well as the marketing.

## Also worth fixing, not done here

The reviewer raised two content gaps that are not contradictions:

- The privacy policy lists our data sources and **does not mention LinkedIn**,
  while the API documentation describes a live LinkedIn scrape and we publish a
  page on scraping LinkedIn without getting banned. That gap is worth closing
  in the privacy policy.
- The privacy policy says personal phone numbers are not collected, while the
  API documentation describes a **"mobile number"** field on the profile
  response. One of the two is wrong.

Neither was touched — both need a decision about what is actually true, not a
copy edit.
