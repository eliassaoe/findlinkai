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

## Publish attempt, 2026-09-03 — blocked on one missing secret

Dispatched `publish-n8n-node.yml` on `main` with `dry_run: false`
([run 33774397923](https://github.com/eliassaoe/findlinkai/actions/runs/33774397923)).
It failed in six seconds at step 4, **"Check for an npm token"**.

**`NPM_TOKEN` is not set in repo secrets.** This is the third time: runs 2 and 3
on 2026-08-26 died at the same step. So the thing that has kept this node
unpublished for eight days is not the code — it is a two-minute credential step
nobody has done. The guard is working exactly as designed; it just has nothing
to guard.

Everything downstream of that step is verified. Run locally on Node 22
(the same version the workflow pins), 2026-09-03:

| check | result |
| --- | --- |
| `npm ci` | clean |
| `npm run build` | clean — 19 operations across 7 resources, spec v1.1.0 |
| `npm run lint` (eslint-plugin-n8n-nodes-base) | **0 warnings** |
| `npm pack --dry-run` | 11 files, 12.9 kB packed / 48.3 kB unpacked |
| `n8n-nodes-linkfinderai@0.2.0` on npm | **404 — name still free** |

Note the build reports **19** operations; `SUBMITTING.md` says 17. Harmless
drift in the doc, not the package.

### To unblock (2 minutes, and only you can do it)

1. npmjs.com → **Access Tokens → Generate New Token → Automation**. For a first
   publish of a name that does not exist yet, a Granular token cannot be scoped
   to the package — there is nothing to select — so it has to be "All packages"
   this once. Replace it with a scoped one straight after.
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository
   secret**, name it exactly `NPM_TOKEN`.
3. Actions → **Publish n8n node** → Run workflow → `dry_run: false`.

**`linkfinderai-mcp-server@1.0.0` is also unpublished** and its name is also
free on npm (404). The same token unlocks both.

### The other two need their own credential

| Target | Blocker | Who |
| --- | --- | --- |
| Zapier | `ZAPIER_DEPLOY_KEY`, **plus** a one-time interactive `npx zapier login && npx zapier register` that cannot run in CI | you |
| Nango CRM | `NANGO_SECRET_KEY_PROD` | you |
| Make | No public submission API at all — VS Code extension, manual | you |

`publish-integrations.yml` handles Zapier and Nango once those secrets exist and
defaults to a dry run, so the real publish has to be asked for explicitly.

## Other options, so nothing is missed

Swept the repo and the referral data for anything not already ranked.

### Chrome extension — the biggest genuine gap

**There is no extension anywhere in this repo.** No `manifest.json`, no
`chrome.*` calls. Yet the entire audience is people standing on a LinkedIn
profile page wanting the email behind it — and the top three pages by traffic
are exactly that (`/linkedin-phone-number-finder` 1,305,
`/linkedin-email-finder` 477, `/linkedin-search-by-email` 245 people/30d).

An extension is the correct *product form* for that job: you are already on the
profile, you click, you get the address. Every competitor with an
"-alternative" page in this repo ships one — Lusha, Apollo, Hunter,
RocketReach, Wiza. The Chrome Web Store is also a search surface in its own
right.

This is a **build, not a publish** — weeks, not hours, and it needs a review
submission. That is why it does not displace n8n at the top. But it is the one
missing asset that is arguably worth more than every marketplace listing
combined, and it should go on the roadmap rather than the backlog.

### RapidAPI — the strongest thing not yet on the list

`api_key_copied` runs at **41 · 47 · 75 · 43** people/month with nothing
pushing it: the API is already the most-wanted surface in the product. RapidAPI
is a marketplace with its own buyer demand and its own search, and the repo
already has `rapid-api-linkedin.html` targeting that term for SEO — so the
intent is proven and the listing would sit under it.

Listing an existing API is days, not weeks. Ranks just behind Zapier.

### MCP registries — cheap, timely, low competition

`linkfinderai-mcp-server` exists, is unpublished, and MCP directories
(Smithery, mcp.so, PulseMCP, Glama) are uncrowded right now. The AI clients
already send traffic: `chatgpt.com` 19, `gemini.google.com` 8, `claude.ai` 7 per
month. `mcp_url_copied` is only 9 people, so in-product demand is thin — but a
directory listing reaches people who never see the product first, which is the
opposite population.

Bundle it with the npm publish; it costs one extra command.

### Apify Store — a referrer that already works by accident

`console.apify.com` sends **15 people/month** and Apify is a *competitor*. The
repo already has an actor — but per `docs/lead-search-bugs.md` Apify changed its
permission model and the actor behind AI lead search is broken, and the
operation was pulled from the product so no customer can reach it. Fixing and
listing it properly puts the product in a marketplace whose console already
leaks traffic. Small, but it is evidence rather than theory.

### Already built, unmarketed: the affiliate program

Commissions are live and capped at $500 per referred customer. It costs nothing
until it works, and nothing currently drives anyone to it. Worth one email to
the 8 active subscribers and the heaviest free users — advocacy asks go to happy
accounts only, never the dormant ones (`CHURN-PLAYBOOK.md`).

### Considered and rejected

- **Lifetime-deal sites.** `unlimited-leads.net` (6) and `dealify.com` (5)
  already refer traffic. LTD buys volume with permanent margin damage on a
  product whose problem is monetisation, not signups.
- **Product Hunt.** A one-day spike, not a channel.
- **G2 / Capterra.** Worth having, but `docs/g2-review-campaign-plan.md` shows
  four approved reviews and G2 displaying one. Unblock the existing campaign
  before treating it as a channel.
- **Bing / Brave.** 181 + 70 people/month arriving free already. Not a new
  channel; IndexNow submission is a near-free SEO chore, not a bet.

### Revised ranking

1. **n8n node to npm** — blocked only on `NPM_TOKEN`
2. **MCP server to npm + registries** — same token, same hour
3. **RapidAPI listing** — days, and API demand is the strongest measured signal
4. **Zapier marketplace** — needs a deploy key and one interactive registration
5. **Reddit, deliberately** — 64 people/month with nobody running it
6. **Chrome extension** — highest ceiling, but a build; roadmap not backlog
7. **Make marketplace / Apify actor** — smaller, more work per hour
8. **LinkedIn** — zero referrals in thirty days; still no

## Before publishing the n8n node

- Version stays at `0.2.0`; the workflow refuses a version already on the
  registry, and npm numbers can never be reused.
- Nobody has run this node inside a real n8n instance. Install it from npm into
  one workflow and run one operation before telling anyone it exists.
- Flip `integrations.html` from "Rolling out" to "Live" per integration as each
  lands. 19 stale badges is worse than an honest short list.
