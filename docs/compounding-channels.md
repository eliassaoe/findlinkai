# Compounding channels: what to automate, and what is already built

**Date:** 2026-09-06 · **Sources:** this repo —
`docs/channel-bet-youtube-vs-seo.md`, `docs/listicle-aeo-results.md`,
`docs/ai-traffic-2026-08.md`, `docs/third-party-roundups-aeo.md`,
`docs/g2-review-campaign-plan.md`, `integrations/SUBMITTING.md`,
`docs/data-provider-angle.md`.

Companion to `docs/outreach-partner-vs-agency.md`. That document decided founder
time goes to closing Done For You and the SaaS is left to compound. **This one
answers what "left to compound" should actually consist of** — which automated,
low-attention channels bring traffic, leads or partners.

Under that decision the metric for every channel below is **signups**, not MRR:
signups are the lead supply for the high-ticket offer.

---

## Killed by measurement, not by opinion

These are the three most commonly recommended compounding plays. All three are
already measured here, and all three failed.

**LinkedIn posting.** Referrals to the site, unique people per month, nine
consecutive months: 0, 3, 1, 3, 4, 1, 1, 4, 2. `docs/channel-bet-youtube-vs-seo.md`
concluded *"It is not a channel. No further argument needed."* Automating
publishing into it automates nothing.

**More listicles / roundups on our own domain.** 1,313 visitors since June
produced **17 signups and 2 payers** — a 1.3% signup rate, the worst landing
type on the site and ~10x worse than the homepage
(`docs/listicle-aeo-results.md`). The pages ranked; the traffic was
research-intent and did not convert.

**Chasing answer-engine visibility (AEO).** ChatGPT referrals are down ~75%
(69/mo in February to 18 in August); all AI referral traffic totals ~30
people/month. Separately, 415 AI *agent* page fetches produced 0 signups and 0
payments — bots are not traffic (`docs/ai-traffic-2026-08.md`). The humans
arriving from AI answers convert well (19.3%) but there are thirty of them.

---

## Tier 1 — already built, currently switched off

Each of these is one action away, and each keeps paying with no further
attention. This is the definition of the thing being asked for.

### 1. Publish the n8n node

`integrations/SUBMITTING.md`: *"Fully automated. No new credentials if
`NPM_TOKEN` is already set."* The dry run has already passed on the branch —
`npm ci`, build, lint and pack all succeed, and `n8n-nodes-linkfinderai@0.2.0`
is confirmed not yet on npm.

    Actions -> Publish n8n node -> Run workflow -> dry_run: false

A permanent listing in a directory the ICP already browses, for one button.

### 2. Register the Zapier and Make apps

Zapier needs the `ZAPIER_DEPLOY_KEY` secret plus a one-time `npx zapier
register` that a human must run (it creates the app under the account and cannot
be done from CI). After that the review queue runs for weeks without anyone.

`docs/data-provider-angle.md` §7 already made this call: *"Prioritise getting
listed over building deeply. Zapier and Make review queues take weeks of
calendar time and almost none of ours — submit early and let them sit."*

Marketplace listings are the purest compounding asset available here: submit
once, permanent, intent-qualified, zero maintenance, and they sit where agencies
and RevOps buyers already are.

### 3. Re-run the review-credit engine

`user_task_completions` and `pending_reviews` have been running since July and
already auto-verify G2 permalinks and pay credits without supervision:
19 `youtube_subscribe`, 6 `g2_review` complete with 8 pending, 3 `trustpilot_review`.

`docs/g2-review-campaign-plan.md`: **"This is not a new campaign to build — it is
an existing one to re-run."** The audience is 65, and includes 16 deliverable
Trustpilot reviewers who have never been through the G2 flow.

G2 reviews compound more durably than most content: the pages rank, buyers
filter on them, and they are heavily cited by answer engines. They also do not
decay the way a ranking does.

---

## Tier 2 — the one new build worth doing

### A mention monitor for Reddit and the communities, with a human send

**Reddit is the largest external referrer on the property: 720 people since May**
— ahead of YouTube (138) and of our own secondary domains
(`docs/third-party-roundups-aeo.md`). It converts at **10.3%** first-touch
against Google's 7.3% (`docs/channel-bet-youtube-vs-seo.md`). All of that is
happening with no system behind it.

Build: monitor Reddit, Hacker News, Quora and X for the category keywords, draft
a reply, queue it for approval. Roughly ten minutes a day.

**Do not automate the send.** Autonomous replying gets the account banned and
the domain blocked by moderators, which loses the channel permanently rather
than temporarily. The agent's job is finding the thread and drafting; a person
posts.

Why it compounds: comments rank in Google for years after posting and are cited
back by the answer engines, so each one keeps working.

**Caveat to hold honestly:** Reddit produced 37 signups and **0 payers**
(`GROWTH-STRATEGY-REVIEW.md`). Under the Done For You decision that is
acceptable — signups are lead supply — but do not expect self-serve revenue from
it, and judge it on signups only.

---

## The pattern worth keeping

**The more fully automatable a channel is, the more likely it is already
saturated and worthless.** LinkedIn auto-posting is trivial to automate and
returns two people a month. Marketplace listings need one human action, once,
and then pay indefinitely.

The genuinely hands-off compounding assets here are **marketplace listings, the
review engine, and the SEO pages that already rank**. Everything else needs a
person in the loop; the work is making that loop ten minutes rather than ten
hours.

## Not assessed here

- **The affiliate and referral programs** (`affiliate.html`,
  `referral-program.html`, commission capped at $500 per referred customer) are
  a partner channel that runs itself once seeded. Their traction was not
  measured while writing this — worth a look before either investing in or
  retiring them.
- **`docs/ai-keyword-outreach.md`** is an already-automated machine that finds
  who cites competitors and emails their content people. It is relevant to the
  partner question, but note that `docs/third-party-roundups-aeo.md` measured
  roundup referrers at 4-5 people each, so its value is citation surface rather
  than direct traffic. It also spends credits on every keyword — read that
  document before adding any.
