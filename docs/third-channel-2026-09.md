# The third channel — ranked on measured referral data

**Date:** 2026-09-03 · **Sources:** PostHog 263837 (30d), repo audit
Companion to `docs/growth-priorities-2026-09.md`.

Given: listicles/AEO running weekly (solved), YouTube publishing (best intent,
slow to compound). Question: what is the third channel, and is it LinkedIn?

## Every external referrer, last 30 days

Unique people, internal navigation and `linkfinderai.com` excluded:

| Source | People | |
| --- | --- | --- |
| google.com | 4,889 | the engine |
| bing.com | 181 | |
| **youtube.com** | **97** (+3 mobile) | the current bet |
| search.brave.com | 70 | |
| **reddit.com** | **64** | *unmanaged* |
| chatgpt.com | 19 | |
| raterproject.com | 16 | |
| duckduckgo.com | 15 | |
| **console.apify.com** | **15** | *a marketplace referrer* |
| gemini.google.com · claude.ai | 8 · 7 | |
| unlimited-leads.net · dealify.com | 6 · 5 | appsumo-style listings |
| **linkedin.com** | **0** | does not appear at all |

## LinkedIn: no

**Zero referrals in 30 days.** It is not in the top 25. This is consistent with
the nine months in `channel-bet-youtube-vs-seo.md` — 0, 3, 1, 3, 4, 1, 1, 4, 2
people per month, never above four — which is why that doc said "drop LinkedIn".
Nothing has changed.

The reason is structural, not effort. Per `docs/traffic-capture-verdict.md` the
top pages are `/linkedin-phone-number-finder`, `/linkedin-email-finder`,
`/linkedin-search-by-email` — **the intent that brings people here is "do this
myself, cheaply, now."** LinkedIn's organic surface rewards thought leadership
aimed at buyers who want to be convinced over months. Wrong audience, wrong
tempo, and LinkedIn suppresses outbound links on top. Posting harder does not
fix any of that.

## Outbound to self-serve: your instinct is right

At $49-89/mo ACV, outbound cannot pay for itself, and the repo already ran the
experiment: five written campaigns that never sent an email, 100% of engagement
bot-flagged, zero calls booked (`docs/revenue-levers-2026-08.md`). The only
outbound that makes sense here is founder-to-founder on a warm list — the 67
pack buyers, the 23 dormant payers — which is retention, not acquisition.

## The answer: ship the integrations you have already built

Not a new channel. A **built and unshipped** one.

| Surface | State |
| --- | --- |
| **n8n node → npm** | Built, lint-clean, `npm pack` passes, name confirmed free on npm. **Never published.** One GitHub Action: `publish-n8n-node.yml`, `dry_run: false`. No new credentials if `NPM_TOKEN` is set. |
| Zapier app | Passes Zapier's own schema validation in CI. Needs one human `npx zapier register`, then marketplace review. |
| Make app | 20 modules written. Needs importing and each module run once. Never executed in Make. |
| Nango CRM actions | 18 actions compile in CI. Needs one secret. |
| Google Sheets add-on | **Live** on the Workspace Marketplace since 2026-01-28 — the one that shipped. |

`integrations.html` currently renders **19 "Rolling out" badges against 7
"Live"**. The site is advertising a shelf that is mostly empty.

### Why this ranks first

**1. The audience is already yours.** Per `docs/youtube-decision-record.md`
(2026-08-26), `n8n` was still the single largest search term bringing views to
the channel, and its ~4,850 subscribers came for n8n/AI content. You have been
treating that base as legacy to be shed. An n8n node monetises it instead — and
it is the one asset that speaks to those subscribers in their own tool.

**2. It is the only new channel that also fixes retention.** From
`INTEGRATION-STRATEGY.md`, on a 30-120 day lapse cohort:

| | People | Active at 30d |
| --- | --- | --- |
| Never integrated | 934 | **1.4%** |
| Integrated | 62 | **8.1%** |

5.8x, with the honest caveat that self-selection explains part of it. Every
other channel option adds visitors to a funnel converting at 0.88%. This one
adds visitors *and* pushes them toward the single behaviour most associated
with staying. Nothing else on the list does both.

**3. Demand is already proven, unpushed.** `api_key_copied` by month:
**41 · 47 · 75 · 43** people. ~50/month reach for an API key with no prompting
— 25x every other integration surface combined. These people want a pipe, not
a dashboard.

**4. Marketplace referrers are already in the data.** `console.apify.com` sends
15 people/month and Apify is not even an integration — it is a competitor whose
console links out. That is what a directory listing does passively. You have
five of them written.

**5. It compounds like SEO with no content treadmill.** A listing is written
once and keeps working. Unlike video it needs no weekly hand-made asset, which
is the constraint YouTube is actually hitting.

## Ranked

1. **n8n node to npm.** Hours of work, one button, an audience you already own,
   and it lands in the community-node panel. Start here.
2. **Zapier marketplace.** Largest directory of the three. One manual
   registration, then CI. Reconcile `linkedin_post_to_reactions` sample output
   against a live call first — Zapier's review checks exactly that.
3. **Reddit, deliberately.** Already the third-largest human referrer at 64/mo
   with nobody running it, versus YouTube's 97 with a hand-made video each time.
   Cheapest test on the list: answer the questions your own tool pages rank for.
4. **Make marketplace.** Same idea, smaller directory, and the IML has never
   been executed — more risk per hour than the two above.
5. **LinkedIn — do not.** Zero referrals in thirty days, nine months of the
   same, and a structural audience mismatch.

## The caveat, stated once

None of this moves signup->paid, which is 0.88% and falling
(`docs/growth-priorities-2026-09.md`). A third channel multiplies that rate
rather than fixing it. Diversifying away from a concentrated, declining SEO base
is still a reasonable call — just do not expect the channel to show up as
revenue until the funnel work lands.

The integrations bet is the least exposed to this, for the reason in point 2:
it is the only option that touches retention as well as acquisition.

## Before publishing the n8n node

- Version stays at `0.2.0`; the workflow refuses a version already on the
  registry, and npm numbers can never be reused.
- Nobody has run this node inside a real n8n instance. Install it from npm into
  one workflow and run one operation before telling anyone it exists.
- Flip `integrations.html` from "Rolling out" to "Live" per integration as each
  lands. 19 stale badges is worse than an honest short list.
