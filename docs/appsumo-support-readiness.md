# What will generate tickets in an AppSumo launch — an app-wide audit

**Date:** 2026-09-05 · Read with `docs/appsumo-launch-spec.md` (the guards) and
`docs/appsumo-cash-plan.md` (why support IS the acquisition channel).

Support response time is the thing that produces reviews, reviews produce
featuring, and featuring produces ~90% of the volume. So a ticket is not
overhead here — **every avoidable ticket is a review you did not get.** This
file is the pre-mortem: what a thousand deal-hunters will hit, ranked.

Two properties of this audience shape everything below. They **run big lists
immediately** rather than exploring, and they **write publicly** — on the AppSumo
review tab, in Facebook groups and on Reddit — before they email you.

---

## TIER 1 — fix before launch. These become reviews, not tickets.

### 1 · The support bot does not know AppSumo exists — worst single item here

`support-worker/worker.js` has a hardcoded `SYSTEM_PROMPT`. Searching it for
`appsumo|lifetime|ltd` returns **zero matches**. It is your first line of
support, and on the four most likely LTD questions it will confidently give the
**wrong** answer:

| It will say | The truth for an LTD holder |
| --- | --- |
| *"Pay-as-you-go credits never expire"* | Their monthly allowance **resets and does not roll over** |
| *"14-day money-back guarantee, email support@"* | AppSumo is **60 days, refunded through AppSumo** |
| *"Cancel anytime from the account dashboard"* | There is **nothing to cancel** — no subscription exists |
| Nothing about phone | Phone is **excluded** from every LTD tier |

The first row is the dangerous one: it tells a customer their credits roll over
on the same day the reset takes them away. **Add an AppSumo block to the system
prompt before launch.** It is a text edit to one file and it is the cheapest
ticket-prevention available.

### 2 · "Manage plan" shows an LTD holder the pricing modal

`account.html:1281` — `managePlan()` calls the upgrade-intent worker, and when
`d.issub !== true` it falls to `showPricingModal()`. **Someone who paid $119 for
a lifetime deal clicks "Manage plan" and gets sold a $49/month subscription.**

That is not a bug in the ordinary sense — it is correct for a free user — but on
an LTD cohort it reads as a bait-and-switch and it is exactly the kind of thing
that gets screenshotted into a review. Branch on `source = 'appsumo'` and show
their tier, allowance, next reset date, and the upgrade offer framed as an
upgrade.

### 3 · History only ever shows the last 1,000 enrichments

`history.html:1244` fetches `enrichment_history` with `limit=1000` and paginates
**client-side**; the CSV batch list is `limit=200`. A Sumo-ling's first act is
often a 5,000–10,000 row CSV. **Their results silently stop at 1,000 rows.**

"Where is my data / I lost my results" is a guaranteed ticket from exactly the
power users you most want reviewing you. Needs real server-side pagination, or
at minimum an honest "showing the most recent 1,000" notice plus a full export.

### 4 · `find_company_employees` returns placeholder rows as people

Unchanged since 23 Aug (`docs/lead-search-bugs.md` bug 2). It passes the Apify
actor's own UI copy through as leads:

    { "name": "⚠️  No Leads found. Tweak your filters and try again" }
    { "name": "❤️ We improve the Actor everyday. Contact us if you are having any issue" }

A data product returning fabricated rows to someone who paid for contact data is
not a bug support can talk anyone out of. It also leaks that the data comes from
a third-party Apify actor. **Three-line fix** — drop rows with a null
`personId`, lowercase the `seniority`/`department` filters, return an empty array
and do not charge.

### 5 · `find_linkedin_post_reactions` is uncapped

1 credit per reaction returned, and **nothing caps how many come back**
(`mcp-server/src/server.ts:100`, `app.html:3410`). One call against a viral post
drains an entire monthly allowance in a single click. The ticket is *"your app
ate all my credits in one action"*, and they will be right.

### 6 · The employees price disagrees with itself, 2×

`app.html:3412` charges **0.5/employee**; `mcp-server/src/server.ts:99`
documents **1/employee**. The server bills. **Whichever is wrong, a customer will
do this arithmetic and post about it.**

### 7 · Checkout leak — 35 of 42 plan selections never reach a payment page

`docs/checkout-leak.md`, still open. Every upsell in the plan lands here, and so
does any LTD holder trying to buy a top-up pack. **They will report it as "I
tried to give you money and it didn't work"**, which is the single worst ticket
to receive during a featuring window.

### 8 · No API rate limiting

Nothing in `workers/` implements a per-account request limit — the only 429s in
the repo are *outbound* handling for HubSpot and Supabase. LTD + unmetered API is
one enthusiastic script away from an unbounded supplier bill, and one shared
script away from several.

### 9 · The auto-topup token leak

`auto-topup-settings` is internet-reachable with `Access-Control-Allow-Origin: *`
and no shared secret, and `list_enabled` **returns every enrolled user's token**
— which is the entire credential (`workers/auto-topup-charge/README.md`). Adding
a thousand accounts behind an open enumeration endpoint is the wrong order to do
things in.

---

## TIER 2 — will generate tickets whatever you do. Have the answer ready.

### 10 · "You charged me for rows where you found nothing" — the #1 predicted ticket

**Credits are consumed on every attempt, found or not**
(`mcp-server/src/server.ts:89`), and hit rates run from **~93% for company
websites down to ~10% for mobile numbers** (`docs/account-value-summary.md`).
Someone runs 1,000 rows, gets 400 back, and sees 1,000 credits gone.

This is the defining complaint of every enrichment product and it is **not a
bug** — but it is a promise you have to make *before* they buy, on the listing
page, in plain words. Do not let the first time they learn it be the invoice.
The account page's "What you've found" section already counts real finds and is
the right artifact to point at.

### 11 · "My credits disappeared" — the non-rollover reset

Structurally guaranteed on the 1st of every month. The mitigation is expectation,
not code: say **"2,500 credits per month, they reset, they do not stack"** on the
listing, in the welcome email, and in the app near the balance. Show the next
reset date on the account page.

### 12 · "Why can't I get phone numbers?"

Phone is excluded from all tiers by design and it is the feature heavy users want
most. Answer it as an upgrade path, not a limitation.

### 13 · Refunds go through AppSumo, not through you

Your site says 14-day, email support@. AppSumo is 60-day through their platform.
Both are true for different customers, and the support bot currently knows only
the first. See item 1.

### 14 · The token in the URL is the whole credential

`?token=` appears 17 times in `app.html`. It reads credits, history and account
data. **Sumo-lings screenshot their screens into Facebook groups constantly.**
You will not fix this before launch, but know it is coming and be ready to rotate
a token on request.

### 15 · CSV cap at 10,000 rows

`app.html:3102`. Fine, but say it on the listing rather than in an error.

### 16 · Stacking and redemption confusion

"I bought tier 2, why do I still see tier 1", "I stacked two codes and nothing
changed". `appsumo_redeem()` refuses a downgrade and returns
`already_at_or_above_tier` — make sure the redeem page renders that as English.

### 17 · The Google Sheets add-on

Three different things are called "the Google Sheets integration"
(`CLAUDE.md`) and users will confuse them. **Do not add any Apps Script service
to the add-on during launch** — it widens the inferred OAuth scopes and pulls the
add-on from the store until Google re-verifies.

---

## TIER 3 — watch, do not pre-solve

- **Low-conversion geo.** A meaningful share of buyers will be in markets where
  support expectations and English fluency differ. Budget time, not fixes.
- **Concurrency.** Nothing in the repo suggests a load ceiling, but nothing has
  tested 1,000 accounts either. Watch the first big CSV day.
- **Mobile.** Signup converts 11 points worse on mobile
  (`docs/signup-funnel-2026-08.md`) and much AppSumo browsing is mobile.

---

## The macro sheet — write these before launch, not during

Support speed is the product here. Pre-written answers are what make a
five-minute median possible for one person. Draft one for each:

1. Credits reset monthly and do not roll over — with their next reset date.
2. Credits are charged per attempt, not per result — with their real find count.
3. Phone is not in the lifetime tiers — here is what unlocks it.
4. Refunds inside 60 days go through AppSumo; here is the link.
5. Stacking: how to apply a second code and what changes.
6. Your results are capped at 1,000 in History — here is your full export.
7. API key and MCP setup, with a working example.
8. Google Sheets: which of the three things you want, and the setup steps.
9. "I found a bug" — the escalation path and what to include.

**Every one of these ends the same way: resolve first, then ask for the review.**
That is SendPilot's entire funnel and it is the only reason any of this matters.

---

## What to instrument before the first code ships

- `source='appsumo'` on every event, so LTD tickets are separable from the rest.
- Ticket volume per 100 codes, and **median first-response time** — the number
  that drives featuring.
- `credits_exhausted` for `source='appsumo'` — the leading indicator of item 11.
- A count of enrichments returning empty per lookup type — item 10, measured
  rather than argued about.

## The honest summary

**Nine things in tier 1 are real defects or real mismatches, and four of them
(1, 2, 3, 7) will be hit by a large share of buyers in week one.** None is
more than a day's work. All of them are cheaper to fix now than to answer a
hundred times during the only week that decides whether the deal gets featured.
