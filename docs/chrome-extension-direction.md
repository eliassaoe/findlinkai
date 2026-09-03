# What the Chrome extension should actually do

**Date:** 2026-09-03 · **Sources:** Supabase `snxhsboboatjywgwdeds` (90d),
PostHog 263837 (120d), Chrome Web Store and competitor research.

Written because the first version of this extension was built on an assumption
that the data does not support, and the correction is not obvious.

## The assumption that was wrong

The obvious extension is what Apollo, Lusha and Hunter ship: stand on a LinkedIn
profile, click, get the email. That is what was built first, and it is aimed at
the wrong behaviour.

Conversion by what a person actually did, 120 days, measured independently of
any existing doc:

| Behaviour | People | Payers | Converts |
| --- | --- | --- | --- |
| Single lookups only | 1,438 | 5 | **0.35%** |
| Uploaded a CSV | 174 | 8 | **4.6%** |
| Hit the export gate | 92 | 8 | **8.7%** |

**Hitting an export gate converts 25x better than single lookups.** A
one-profile-at-a-time panel is a machine for producing the 0.35% population.

## What the usage data says people actually run

90 days of `enrichment_history`, by runs:

| Operation | Runs | Users | Runs/user |
| --- | ---: | ---: | ---: |
| `lead_full_name_to_linkedin_url` | 35,986 | 874 | **41** |
| `company_name_to_website` | 11,973 | 128 | 94 |
| `email_to_linkedin_url` | 6,026 | 213 | 28 |
| `linkedin_profile_to_phone` | 5,521 | 118 | 47 |
| `company_domain_to_employees` | 4,987 | 108 | 46 |
| `linkedin_profile_to_email` | 3,584 | **333** | 11 |
| `linkedin_post_to_reactions` | **4** | **4** | 1 |

Two things fall out of this:

- **The volume is list-shaped.** 41 and 94 runs per user are not people doing one
  lookup; that is CSV enrichment. `linkedin_profile_to_email` has the most
  *users* and among the fewest runs each — it is the tourist operation.
- **Post reactions is dead.** Four runs in ninety days. Any extension feature
  built on post engagement would be building for nobody. The
  `/linkedin-post-likers-export` and `/linkedin-post-commenters-export` pages
  draw about one visitor a month each, which agrees.

Meanwhile `/linkedin-profile-scraper` pulls **540 people/month** — the traffic
that already exists is scraper-shaped, i.e. bulk.

## What the competitors split into

Two distinct products, not one:

| | Who | What |
| --- | --- | --- |
| **A — single-profile enrichment** | Apollo, Lusha, Hunter | Email/phone on the profile you are looking at. Apollo alone has ~1M installs at 4.71 stars, with a free tier. |
| **B — list export** | Evaboot, Wiza, PhantomBuster | A button on a Sales Navigator search that extracts the result list, cleans it, enriches emails, exports CSV. |

Category A is saturated by free tiers from companies far larger than this one.
Category B is a smaller field at higher prices, and it matches the behaviour that
converts.

## But not Evaboot's version of B

Evaboot and Wiza scrape Sales Navigator's DOM. That is against LinkedIn's user
agreement, it breaks whenever LinkedIn redeploys, and bulk-collection extensions
have been pulled from the Web Store before. Copying it buys the right audience
with the wrong risk.

**The version that avoids all of it:** LinkFinder's API already has
`linkedin_company_to_employees` — give it a company page URL and it returns the
employee list, server-side, with department and seniority filters. So the
extension reads **only the URL** from the page, exactly as the single-lookup
version does, and the list comes from an API that already does this legitimately.

Bulk behaviour, no DOM scraping, no new permission, and an operation that already
has 108 users and 4,987 runs behind it.

## What was built

The panel now leads with **Export employees to CSV** on any LinkedIn company
page: department, seniority and row-cap filters straight from the catalog, a live
cost estimate, and a CSV download. Single lookups stay, demoted to a secondary
row — they are not wrong, they are just not the wedge.

The economics are the point. One email lookup is 10 credits. An export of 200
employees is **101 credits** — the whole $25 pack in four clicks, on the
behaviour that converts at 8.7% instead of 0.35%.

Which is exactly why the cost is quoted before the button is pressed and the
actual charge is reported from **rows returned, not rows requested**. An export
capped at 200 that finds 60 is billed 31, and the panel says 31.

## Two bugs found by looking rather than testing

- A `TypeError` from `fetch` (offline, blocked host) surfaced as the generic
  "Something went wrong running that lookup." Found by running the extension in
  Chromium against a blocked host.
- The result preview dumped raw JSON for employee rows — they carry
  `firstName`/`lastName` but no `name`, so the fallback serialised the whole
  object, internal ids included, into the panel the export had just stripped them
  from. Found by screenshotting the panel.

Both are fixed and both now have tests. Neither would have been caught by the
unit suite alone, which is the argument for the browser harness in
`chrome-extension/SUBMITTING.md`.

## What would change this conclusion

If the export path ships and its users do **not** convert better than 0.35%, the
premise is wrong and the honest read is that the extension audience differs from
the app audience. Measure `csv_uploaded`-equivalent conversion for people whose
first touch was the extension, at 60 days.
