# Where the high-intent leads come from

Requirement: **pay as you go, API credits, no subscription.** That rules out most
of the intent market, which sells seats: Clay, Apollo, Ocean, LeadMagic (from
$49/mo), Crustdata ($95/mo minimum and demo-gated, not self-serve). The honest
answer to "is there anything besides Gojiberry?" is: not many, and the best one
is already on your card.

## 0. Instantly's AI Lead Finder — you already pay for it

The Growth Credits plan ($47/mo, 1,500 credits) includes SuperSearch, and its
`signals` filter carries **25 buying-signal categories**: `job_change`,
`promotion`, `reddit_buying_intent`, `reddit_competitor_mention`,
`reddit_churn_risk`, `website_funding`, `website_technology_adoption`,
`traffic_surge`, `linkedin_post_company`, `glassdoor_negative` and more, each
with a 30-90 day freshness window. It is on the API (and the MCP server), and
leads export as a CSV that feeds straight into `prepare`.

Measured on this account, same ICP, signals off vs on:

| Filter | Leads |
|---|---|
| Founders/Heads of Sales, software + business services, under 100 staff | **994,989** |
| ...**with** a job change, funding event or Reddit buying-intent signal in 90 days | **7,549** |

That is the whole bet in one table: the same audience, cut to the 0.8% who did
something this quarter that gives you a reason to write.

**Budget check, corrected.** SuperSearch charges **5 credits per lead**, not 1.
An earlier version of this file said 655 credits buys a 500-lead arm. It does not:

| | |
|---|---|
| Credits available today | 655 of 1,500/month |
| Leads that buys, at 5 credits each | **131** |
| A full month's 1,500 credits | 300 leads |
| 500 leads | 2,500 credits ≈ **$78** at $47 per 1,500 |

So the real per-lead prices are **$0.157 Instantly · ~$0.052 TheirStack ·
~$0.01 Explee**. Sending is ~$0.12 a lead (four emails at $0.03), so an Instantly
arm costs about **$0.28 all-in against $0.13** for the Explee control.

That is worth saying plainly: **the 2x bar is not arbitrary, it is break-even.**
An intent arm that costs 2.2x per lead has to reply about twice as well to be
worth running at all, which is exactly the threshold `verdict()` enforces.

Instantly is the *source* only. Sending stays in AutoGTM, per the plan.

**One signal per campaign.** AutoGTM's import takes five mandatory fields plus
`linkedin_url` and no custom variables, so the reason a lead is interesting -
the funding round, the new job title - cannot ride along per lead, and Explee's
copy will never mention it. The fix is to build the campaign on a single signal
and say so in the brief: "every company here has just raised - reference it".
A campaign mixing four signals can say nothing specific about any of them, and
then you have paid intent prices for a firmographic email.

---

Below, in order, if you want a second signal or a source Instantly does not have.

## Does any of this work for the French market? Mostly no.

Measured, not argued. French companies (250-1,000 staff), buyers titled
*responsable / directeur des achats, acheteur, purchasing manager*, 90-day
window:

| Filter | Leads |
|---|---|
| No signal at all | **2,535** |
| `job_change` — the best trigger there is | **0** |
| `reddit_buying_intent` | ~0 for this audience |
| `linkedin_post_company` | 880 |
| `website_expansion` + `technology_adoption` + `partnership` | 943 |

The two signals that mean *a person is in market* — someone changed job, someone
asked about the problem in public — **do not exist for French non-tech buyers.**
What is left is company-level website and LinkedIn activity: "this company posted
something", which is not intent, it is proof the company is alive.

Compare the same signals on a US/English software audience: 7,549 leads with a
job change, funding event or Reddit buying-intent signal. The data is real; its
coverage is Anglophone and tech.

**So do not buy Instantly credits for a French campaign.** Paying $0.157 a lead
for `linkedin_post_company` is paying an intent price for a liveness check. The
signal premise has to hold before the premium is worth anything, and here it does
not.

This also generalises to the customers being served: an ESN that wants
*responsables d'achat* at 250-person companies is not going to be helped by a
signal database built on Reddit threads and funding rounds. For those audiences
the lever is better targeting, not intent — Explee's `definition` search takes a
natural-language description and handles French roles and niches directly,
instead of matching against a fixed English taxonomy.

## Can a better lead source lower cost per QUALIFIED call at all?

Honest arithmetic, because this is the question the whole plan turns on:

    control arm   ~$0.13 per lead all-in   (Explee lead + four sends at $0.03)
    intent arm    ~$0.28 per lead all-in   (Instantly lead at $0.157 + the same sends)

Cost per call is `cost per lead ÷ (reply rate × calls per reply)`. At 2.15x the
lead cost, an intent arm has to convert **more than twice as well just to draw
level**. Anything less and cost per call goes *up*.

That is a defensible thing to buy — better-qualified calls that close at a higher
rate can be worth more than they cost — but it is a different purchase from the
one the plan asked for. **Intent data is a quality bet. It is not a cost lever,
and it cannot be argued into being one.**

The cost lever is the conversion step, and the number that proves it is already
in this repo: `docs/outbound-angle.md` records **571 leads marked interested and
0 meetings booked.** Those leads were paid for in full and produced nothing. No
lead source fixes a 0% reply-to-call rate, and no lead source is as cheap as
re-working replies you already own.

## 1. Your own product — the signal Instantly does not have

The plan's "engaged with a competitor's post" signal is a LinkFinder AI feature.
No new vendor, no new contract, and the credits are yours:

| Signal | How | Cost |
|---|---|---|
| Engaged with a competitor's post | post likers/commenters on Clay, Apollo, Instantly, Lusha, Surfe posts (`find_linkedin_post_reactions`) | scrape + 10 credits/profile→email |
| Hiring for a role that buys data | LinkedIn job scraper, "SDR", "RevOps", "growth" | scrape |

500 engagers enriched to email ≈ 5,000 credits. Someone who liked a Clay post
last week is in-market for contact data this week — that is a harder signal than
anything a firmographic database can produce, and it costs you no cash at all.

Worth pairing with #0: Instantly's `linkedin_post_company` signal watches
companies, not the individuals who engaged with a *competitor's* post. That
specific signal only exists in your own scraper.

## 2. TheirStack — the only real pay-as-you-go intent API

Job postings from 315k+ sources (LinkedIn, Indeed, 16k+ ATS), deduplicated.
**1 credit per job record**, credits from ~$0.042 down with volume, **unused
credits roll over 12 months**, cancel anytime, and a free tier of 200 API credits
a month to test the data before paying.

The two queries worth running:

- companies hiring SDRs / RevOps / growth (they are building an outbound motion
  and need data to feed it)
- job posts whose text mentions Apollo, Clay, Lusha, ZoomInfo (they already buy
  contact data, and the posting says which tool)

500 job records ≈ 500 credits ≈ **$21**, then `POST /search/people-by-domains` on
Explee at 1 credit per person to get the actual buyer at each company — about $5.
**A 500-lead intent arm for roughly $26**, against $99/month for Gojiberry.

## 3. PredictLeads — if funding and news triggers matter too

Seven signal types over 123M companies: job openings, financing events, news
events (37 types, including `receives_financing` and `increases_headcount_by`),
technology detections. From **$40/month** with 100 free API credits a month.

Not strictly pay-as-you-go, but it is the cheapest way to get funding-round and
headcount triggers, which TheirStack does not carry. Add it only if the job-post
arm wins and you want a second signal.

## What was ruled out, and why

- **Gojiberry ($99/mo)** — named in the plan, but it is a subscription and the
  signals overlap what #1 and #2 give you for ~$26. Its 7-day trial is worth one
  export as a benchmark, not a card on file.
- **G2 buyer intent** — genuinely in-market data (people comparing tools in your
  category), but it needs a claimed G2 product listing on a paid intent tier.
  Checked: this account owns no G2 product, so it is not available.
- **Crunchbase, Harmonic, ZoomInfo intent** — annual contracts. Out of scope.
- **LeadMagic ($49/mo), Crustdata ($95/mo, demo-gated)** — good data, but both
  have a floor you pay whether or not you search that month.
- **Parallel** — genuinely per-request, no seats, no subscription (~$0.001-0.005
  per 10 search results). It is a web-search API for agents, not a lead finder:
  you would be building the finder yourself. Keep it in mind only if all three
  above disappoint.

## Feeding a source into the test

Any of them ends up as a CSV with the five mandatory columns, then:

```bash
python3 leadsource_test.py prepare --csv theirstack-export.csv --out variant.leads.json
```

`prepare` reports every row it drops and why, so a thin export is visible before
you spend anything on sending.

Sources: [TheirStack pricing](https://theirstack.com/en/pricing) ·
[PredictLeads](https://predictleads.com/) ·
[PredictLeads on Datarade](https://datarade.ai/data-providers/predictleads/profile)
