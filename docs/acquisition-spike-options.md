# "How do I spike acquisition fast?" — AppSumo and the alternatives

**Date:** 2026-09-05 · **Sources:** Supabase `snxhsboboatjywgwdeds` (live, this date),
`GROWTH-STRATEGY-REVIEW.md`, `FUNNEL-REVIEW.md`, `docs/revenue-levers-2026-08.md`,
`docs/traffic-capture-verdict.md`, `docs/seo-audience.md`.

## Verdict in one line

**Acquisition is the one thing that is already working, and it is the only input
you have added more of for four straight months without moving revenue.** An
AppSumo launch aims a firehose at the leak — and you have already run this exact
play once, on Dealify, and it left no subscribers behind.

---

## The eleven days since the growth review

`GROWTH-STRATEGY-REVIEW.md` was written 2026-08-25. Re-running its queries today:

| Metric | 2026-08-25 | 2026-09-05 | Change |
| --- | --- | --- | --- |
| Total user rows | 6,652 | **7,318** | +666 |
| Subscribers (`subscription_id IS NOT NULL`) | 31 | **31** | **0** |
| Subscribers active in last 30d | 8 | **7** | **−1** |
| Credit-pack buyers, no subscription | 88 | 89 | +1 |

Plan mix is unchanged: 21 Starter · 8 Professional · 1 Enterprise · 1 legacy
≈ **$1,939 MRR**.

Signups by month (`auth.users`, the only trustworthy signal per
`docs/email-verified-is-wrong.md`):

| May | Jun | Jul | Aug | Sep (5 days) |
| ---: | ---: | ---: | ---: | ---: |
| 419 | 520 | 643 | 655 | 124 (**~750/mo pace**) |

**Signups are compounding ~15%/month. Subscribers have not moved in eleven days,
and subscriber activity got worse.** Six hundred and sixty-six new accounts
produced zero net subscribers. That is the whole argument: the marginal signup is
currently worth approximately nothing, so buying a large number of marginal
signups is worth approximately nothing times the number bought.

---

## On AppSumo specifically

### 1. You have already run a lifetime deal, and it is still in the database

Two code batches exist, both Dealify (an LTD marketplace):

| table | codes | plan 1 | plan 2 | marked `Valid = NO` |
| --- | ---: | ---: | ---: | ---: |
| `dealify` | 2,857 | 1,500 | 1,357 | 42 |
| `linkfinder dealify` | 4,096 | 1,695 | 2,397 | 22 |
| **total** | **~6,950** | | | **64** |

~6,950 codes minted; 64 marked `NO`. Redemption goes through
`linkfinder-redeem.hamoureliasse.workers.dev`, which is not in this repo, so the
exact semantics of `Valid` are unconfirmed — but under any reading, an LTD
campaign sized at thousands of codes ran, and today the business has **31
subscribers and 89 pack buyers**. There is no LTD-shaped cohort in the revenue.

Whatever AppSumo would do, Dealify has already done a version of it here, and it
did not leave a subscriber base behind. That is a local result, not a theory.

### 2. The economics are actively bad for a credit-metered product

An LTD sells a perpetual claim on your variable costs. Every enrichment credit is
a real data-provider call — `linkedin_profile_to_phone` alone is 50 credits. A
tier granting a monthly allowance forever converts a one-time payment (of which
AppSumo keeps roughly 70%, with a 60-day refund window) into an unbounded COGS
liability. The only safe shape is a **one-time credit pack** with no recurring
allowance — at which point it is a discounted version of the $25/$75/$200 packs
you already sell, and the strategic upside collapses to cash, reviews and traffic.

### 3. It scales the wrong-audience problem you have already diagnosed

`docs/traffic-capture-verdict.md` established that your traffic is defined by
"do this myself, cheaply" intent, and that volume does not fix a wrong-audience
problem — it scales it. **AppSumo is the largest concentrated population of that
exact intent on the internet.** And you already own the proof of what that cohort
does next: 89 pack buyers, **5 active in the last 30 days**.

### 4. What it would actually be good for

Cash, reviews and brand — not MRR. If those are the goal, say so explicitly and
run it with a hard one-time credit cap per tier and no unlimited tier. Do not run
it expecting subscribers.

---

## What would actually move acquisition, ranked by (speed × evidence)

### Tier 1 — days, and the audience is right

1. **Reconnect the 38 dead Instantly mailboxes.** All 38 are `status: -1`,
   `autofix_failed: true`, mostly `EAUTH`. Warmup scores are 90–100 and the
   domains pass SPF/DKIM/DMARC — this is an OAuth reconnection, not a rebuild.
   Behind it: ~900 prospects/month of capacity and **five written campaigns
   sitting in Draft that have never sent a single email**. Nothing else outbound
   — including any partnership — can run until this is done.
   (`docs/revenue-levers-2026-08.md`, `OUTBOUND-CRM-AUDIT.md`)

2. **Scale the one campaign with a proven conversion.** "stop doing these one at
   a time" produced 6 `csv_uploaded` from 54 sends (11%), and bulk is the
   behaviour that predicts payment. **1,319 eligible users have never been sent
   it.** Send the next 200 before trusting the 11%.

3. **Distribute the affiliate program you already built.** 25% recurring, capped
   at $500/customer, page live at `/affiliate`. All-time: **12 distinct
   referrers, $0.28 total payout.** It is a finished asset with no distribution.
   Recruiting 20–30 sales/RevOps creators is the cheapest version of "someone
   else's audience" available to you.

### Tier 2 — marketplace distribution: AppSumo-shaped, without the LTD economics

These are launches where a marketplace does the distribution, the users are
pre-qualified for a metered product, and you keep your pricing intact:

- **MCP server** (`mcp-server/`, v1.0.0) — MCP client directories are the live
  land grab right now, and the audience is people wiring tools into agents, i.e.
  volume users. `FUNNEL-REVIEW.md` found integrators are your warmest untapped
  segment (122 integrated, 114 never paid).
- **n8n community node** (`n8n-nodes-linkfinderai`, v0.2.0) — verify it is
  actually published and listed; the n8n community node index sends real installs.
- **Google Sheets add-on** — already in the Marketplace. Store-listing work is
  free traffic. Read `integrations/google-sheets-addon/README.md` first, and do
  not add an Apps Script service: it widens `oauthScopes` and pulls the add-on
  from the store until Google re-verifies.

### Tier 3 — real spikes, but only worth buying after the funnel is repaired

Product Hunt (3 users ever from a `producthunt` ref), Reddit, paid ads. A spike
delivered into today's funnel converts at 1.2% and lands on a checkout with
~28 failure incidents per 60 days against 16 successes.

---

## The sequencing that decides this

At 6.5% monthly churn and ~7 gross adds/month, the steady-state ceiling is
~108 subscribers regardless of traffic. Halving churn to 3% reaches $4k MRR in
six months **with zero new visitors**. A spike raises a ceiling you are nowhere
near; it does not raise the floor.

So: fix checkout and the paywall step, send the campaign that works to the 1,319
who have not had it, reconnect the mailboxes. Then a launch — AppSumo or
otherwise — is worth 2–3× what it is worth today, permanently.

---

## Appendix — on the "3 SaaS strategies" video

Assessed against the position above.

- **"Ship fast, chain many SaaS"** — does not apply, and following it would be
  the expensive mistake. That is advice for someone at $0 exploring. You have
  ~7,900 visitors/month, ~750 signups/month, real SEO rankings and 31 paying
  customers. Starting new products now means abandoning a validated one at
  precisely the moment it needs the unglamorous work.
- **"Spot the signals, then put 80% of your time into the one that performs"** —
  correct, and you are already past the decision point. Note what he says the
  work then *is*: *"je regarde le tunnel, qu'est-ce qui bloque, là où ça coince,
  et je pousse dessus."* Look at the funnel, find where it jams, push there. That
  is `FUNNEL-REVIEW.md`, and it is an argument against the AppSumo launch, not
  for it.
- **"Partner for distribution"** — the one genuinely useful part. *"A worse SaaS
  with distribution beats yours."* This is the strongest case for Tier 1 item 3
  and Tier 2 above: audiences and marketplaces are assets you can borrow. It is
  also, notably, not a case for AppSumo — an LTD marketplace rents you a crowd
  once; an affiliate or a community node keeps sending.

Net: one of three strategies applies, and it points at the affiliate program and
the marketplaces, not at a lifetime deal.
