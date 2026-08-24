# The AI visibility offer — placements, not dashboards

Written 2026-08-24. Elias's idea, worked out with numbers.

The idea in his words: *we have the enrichment layer, so we can find the
listicles that matter and the people who own them, reach out, and deliver
placements that make our customers visible to AI.*

It is the best offer anyone has proposed for this business, and the reason
is in section 2. This document is the version I would take to a call.

---

## 1. The offer, in one paragraph

> When someone asks ChatGPT for a tool like yours, the model does not think —
> it reads. It reads about forty pages. We find out which forty, we find the
> people who own those pages, we get you onto them, and we re-measure every
> month.

Three sentences, three deliverables, and each one is checkable by the buyer.
That is what makes it sellable at $5k+ where "we do GEO" is not.

**Name:** `LinkFinder Cited`. Sits next to `linkfinder-vip.html` as the second
managed offer. Landing page would be `ai-visibility.html`.

---

## 2. Why this is ours and not the dashboard vendors'

The category already has money in it — Profound, Peec, Scrunch, Athena. Look at
what every one of them actually ships: **a dashboard that tells you that you are
not mentioned.** They measure. They stop there. The customer reads the report,
feels bad, and has to go and do something about it themselves.

The reason they all stop at measurement is that step two is a contact-data
problem, and they do not have a contact-data business.

    citation URL  ->  domain  ->  who owns this page  ->  their direct email

That is our exact primitive. `company_domain_to_employees` →
`lead_full_name_to_email`. It is the thing the product already does, ten
thousand times a day, for a different reason.

**So we are the only vendor in this category who can quote a delivery, not a
diagnosis.** That is the whole strategic argument and everything below is
implementation.

One honest correction to the framing, though: the enrichment layer is a
**speed and differentiation** advantage, not a **margin** advantage. Section 6
shows the data cost of a full campaign is about $56. Nobody is going to lose
this fight on data cost. They lose it on not being able to do the step at all,
and on not having anyone to send the email.

### The asset that actually compounds

The publication relationships. Client #1 pays us to establish a working
relationship with the editor of a "best CRM software" roundup. Client #12 in
the same category gets placed there in a week, because we already know her and
she already knows we send real products.

**The target list is roughly the same 300–600 publications for every client in
a given category.** The first client in a vertical is expensive; the twelfth is
nearly free. That is a real moat and it gets deeper on its own — which is more
than can be said for anything else on the roadmap.

---

## 3. The pipeline

Seven steps. Steps 1–2 are new engineering (small). Steps 3–4 are the existing
product. Steps 5–6 are labour. Step 7 is what makes it recur.

**1. Prompt set.** 30–60 buying-intent prompts for the client's category:
`best project management software for agencies`, `Asana alternatives`,
`cheapest tool for X`. Written with the client on the kickoff call — this is
also how you find out whether they understand their own category.

**2. Citation harvest.** Run the prompt set against ChatGPT, Claude, Perplexity
and Google AI Overviews. Record two things per run: is the client named, and
which URLs are cited. Repeat N times per prompt from clean sessions.

This is the only piece that does not exist. It is an API loop with citation
extraction — two days of work, not a project.

**3. The citation map.** Collapse the cited URLs to domains and rank by how
often they appear across the prompt set. It comes out as a short list:
20–60 domains carrying most of the answers, and they are mostly listicles,
comparison pages, review sites and a few Reddit threads.

**This is the artifact that sells the whole thing.** It is not an opinion about
where the client should get coverage. It is a log of what the models actually
read when someone asks the client's money question.

**4. Contact resolution — the LinkFinder step.**

    find_company_website        domain, if we only have a name        1 credit
    company_domain_to_employees people at that publisher              0.5 / employee
      -> filter to editorial, content, SEO, partnerships, founder
    lead_full_name_to_email     direct email                          7 credits
    linkedin_profile_to_email   fallback path for misses              10 credits
    linkedin_profile_to_phone   tier-1 targets only                   50 credits

Out the other end: ~180 named people with verified addresses at the exact
publications the models are citing.

**5. Outreach.** Instantly for sequencing, HubSpot for the pipeline. Both
already connected to this business. The pitch to a publisher is not a link
request — it is "your roundup is missing a tool in this category, here it is,
here is a free account, here is the data on it."

**6. Placement.** Negotiate inclusion, and — this matters more than it sounds —
**negotiate the sentence.** A listicle entry that reads "LinkFinder AI — a
LinkedIn enrichment API that returns verified emails from a profile URL, from
$49/mo" is extractable. "Another solid option" is not. Getting the entity, the
category and the differentiator into one clean claim sentence is the actual
craft in this offer, and it is invisible to competitors selling dashboards.

**7. Re-measure.** Same prompt set, same methodology, every month. The report is
one number: *cited in 14 of 40 prompts, up from 2.*

---

## 4. Why it recurs

`data-provider-angle.md` established the only test that matters for anything
we build: **does work arrive without the customer doing anything?**

This passes, for the same structural reason the CRM offer does:

| that file's argument | here |
|---|---|
| contact files decay ~2%/mo because people change jobs | listicles get re-edited, competitors get added, positions shift |
| we re-verify monthly, so the work recurs | we re-measure monthly and defend the placement |
| priced per record maintained | priced per category monitored |

Model versions change under you. A competitor pays for the #1 slot on the
roundup you fought to get onto. A publication rewrites the page and drops you.
**AI visibility rots faster than a contact database does**, and unlike a contact
database, the client can watch it rot in a dashboard you own.

There is no version of this where the customer buys once and is finished — which
is precisely the failure mode of every other thing this business has sold.

---

## 5. Packaging and price

Three products. The audit is the wedge and it must be paid.

### AI Visibility Audit — $2,500, one-time, 10 business days

The prompt set, the citation map, the competitor comparison, and the
contact-resolved target list with named editors and verified emails.

Sold standalone, and it is genuinely useful standalone — the client could hire
someone else to do the outreach with it. Say that out loud; it is what makes the
price believable.

**Charge for it.** `linkfinder-vip.html` gives the CRM audit away free and it is
right to, because that audit is generated by a machine in minutes. This one is a
week of work and it is the deliverable people are already buying from Profound
at $1k+/mo. Free audits here train prospects to think the citation map is worth
nothing, which is the opposite of true.

### Placement Sprint — $7,500, 90 days

**8–12 confirmed placements** on publications from the client's own citation
map. Includes the audit (credited if already bought), all outreach, all
negotiation, and a before/after measurement.

### Cited Retainer — $4,000/mo (Growth) · $8,000/mo (Scale)

- Continuous monitoring of the prompt set — 40 prompts (Growth), 120 (Scale)
- 4–6 new placements per month (Growth), 10–15 (Scale)
- Defence of existing placements: re-check, correct, re-pitch when dropped
- Monthly report: citation rate by prompt, by engine, versus named competitors
- Scale adds: multi-category, multi-region, and the sentence work on owned pages

Twelve-month value of one Scale account: **$96,000.** Current entire MRR of this
business: ~$1,000. One client changes the shape of the company.

### What we guarantee, and what we refuse to

**Guaranteed:** the number of placements. We control outreach.

**Never guaranteed:** that ChatGPT will recommend you. We do not control the
model, nobody does, and every agency currently promising it is either lying or
about to have a bad renewal conversation.

Put that refusal in the sales deck. In a category this full of grifters,
**being the vendor who names the thing they cannot promise is a differentiator**,
and it is the same instinct that makes the VIP page say "we'll tell you honestly
if self-serve is the better fit."

---

## 6. Unit economics

Per client, first campaign, 60 target publications:

    employee lookups     60 domains x 25 employees x 0.5      750 credits
    emails               180 contacts x 7                   1,260 credits
    fallback on misses   72 x (1 + 10)                        792 credits
                                                        --------------
                                                          ~2,800 credits

At the $200 / 10,000 pack rate that is **$56 of retail credits**, and internally
it is a fraction of that. Monthly maintenance — re-checking 180 publisher
contacts at 10 credits — is another 1,800 credits, about $36.

Measurement: 40 prompts × 4 engines × 3 runs = 480 model calls/month.
Call it $25.

**Machine cost per client per month: under $100. Against $4,000–$8,000.**

Which means the P&L of this offer is entirely determined by two things that are
not data:

1. **Human hours on outreach and negotiation.** This is an agency. Gross margin
   lands at 50–70%, not the 90% of a software line. Do not model it as SaaS.
2. **Placement fees.** Covered below, and it is the real risk.

---

## 7. What could kill it

**1. Half the listicles are pay-to-play.** Many "best X" roundups sell slots at
$500–$2,500. If that is the median, COGS goes from $56 to $15,000 a campaign and
the whole shape changes. *Mitigation:* media budget is a passthrough, billed at
cost, disclosed in the contract from day one — we charge for finding, reaching
and negotiating, not for the slot. **Find out the real number in week 3 before
pricing anything.** This is the single largest unknown in the document.

**2. Attribution.** We can prove citation rate went from 2/40 to 14/40. We
cannot easily prove it produced pipeline. *Mitigation:* sell the leading metric
explicitly, write it into the contract, and offer to instrument
referral traffic from cited pages so there is at least one lagging number.

**3. Measurement noise.** LLM answers are personalised, session-dependent and
version-dependent. Sloppy methodology produces reports that look like noise and
churn the client in month three. *Mitigation:* fixed methodology — pinned model
versions, clean sessions, no memory, N≥3 runs per prompt, report a **rate**
never a binary, and publish the methodology to the client. Being rigorous here
is also a sales asset against competitors who are not.

**4. Instantly is still dead.** All 38 sending accounts, OAuth revoked
(task #29). Same blocker as every other outbound motion in this repo. Nothing in
this offer sends until that is fixed.

**5. It competes with the roadmap.** The 2026-08-23 decision was
CRM → monitoring → integrations. This is not on that list, it is an agency
rather than a machine, and it needs the founder's attention for calls, outreach
and negotiation — the scarcest resource here. **This is the real decision, not
the copy.** Same sentence `outbound-angle.md` had to write, and it was right
then too.

My read: it does not replace the CRM work, it funds it. But it cannot be run
half-heartedly alongside it — one placement campaign delivered badly, to a
client paying $8k, costs more reputation than 6,000 free signups ever built.

---

## 8. Case study zero: run it on ourselves

We are sitting on the proof and it costs nothing but time.

**This site has 68 listicle and alternative pages.** We rank on them. We already
run this play from the publisher's side, which means we know what an editor
responds to — because we are one.

So: run the full pipeline on LinkFinder AI. Prompt set around
`best LinkedIn email finder`, `Apollo alternative`, `linkedin scraping api`.
Measure where we stand today. Do the outreach. Publish the before/after.

Three things fall out of it at once:

1. **A case study with real numbers**, which is the only thing that sells a
   $7,500 sprint to a stranger.
2. **A dogfooding test of the pipeline** before a paying client is exposed to it.
3. **Better traffic.** `seo-audience.md` closes on the finding that 55% of
   signups come from a segment producing 5% of revenue, and that where signups
   come from is a bigger lever than anything else on that page. Being cited in
   AI answers for buying-intent queries is about as far from the Instagram
   cluster as traffic gets.

### One thing to be careful with

We could sell placement on our own 68 pages. It is real inventory and clients
would take it. But charging for editorial outreach while quietly billing for
slots on our own property is exactly the conflict that makes people distrust
this category. *If we do it:* one placement on an owned property, disclosed as
owned, free, and **not counted toward the placement guarantee.**

---

## 9. Who to sell to

Not the $49 self-serve user. The buyer is whoever owns the number that "we are
invisible in ChatGPT" threatens:

- **B2B SaaS, $2M–$50M ARR, in a crowded category with established listicles.**
  Project management, CRM, HR tech, security tooling. The crowded category is a
  feature — it means the roundups already exist and are already being cited.
- **VP Marketing / Head of Growth / Head of Demand Gen.** Has budget, has a
  pipeline number, and has already been asked by their CEO why the company does
  not come up in ChatGPT. That question has been asked in every marketing
  meeting for two years and almost nobody has an answer to it.
- **Agencies serving the above** — same multiplier logic as section 3 of
  `data-provider-angle.md`. One contract, twelve clients.

**Warm list first.** Existing subscribers and the churned power users in
`outbound-angle.md` are all companies that sell into B2B and all of them have
this problem. `salesignition.com`, `guidance.so`, `fiber.ai`, `cambium.ai`.
Six calls, from people who have already paid us money once.

### The cold email

The citation map is the whole email. Do the work first, for free, for ten
prospects — it is 20 minutes of machine time each.

> Subject: 40 prompts, you appear in 2
>
> Ran the 40 questions a buyer asks ChatGPT before choosing a {category} tool.
> {Competitor} comes up in 31 of them. You come up in 2.
>
> The models are mostly reading the same 12 pages. I have the list, and the
> names of the people who edit them.
>
> Want it? No charge, it is already built.

Same structure as the CRM audit campaign: a number about **their** business, no
link, asks for a reply. `data-provider-angle.md` is explicit that this is the
only cold email that gets answered at this price point.

---

## 10. Thirty days, with two kill switches

Nothing gets built beyond the harness until someone pays for an audit.

**Week 1 — the harness.** Prompt runner + citation extractor. Run it on
LinkFinder and on 10 prospects. Output: 11 citation maps.

**Week 2 — prove the moat.** Run enrichment over the citation map for our own
category. The number to watch: **what percentage of cited domains yield a named
editor with a verified email.**

> **Kill switch 1:** under 50% and the central claim of section 2 is weaker than
> we think. Fix the resolution path before selling anything.

**Week 3 — prove the economics.** Do real outreach for LinkFinder. Measure reply
rate, and record every price quoted for a slot.

> **Kill switch 2:** if the median listicle wants more than ~$1,500, this is a
> media-buying business with an enrichment layer bolted on, not a service
> business. Different offer, different price, possibly not worth doing.

**Week 4 — sell three audits at $2,500.** To the warm list. Not the sprint, not
the retainer — the audit. If three people who already trust us will not pay
$2,500 for the citation map, the $8,000 retainer is a fantasy and we have spent
one month finding that out instead of six.

---

## 11. The bet, stated plainly

Every previous offer in this repo tried to make a $49 self-serve funnel produce
$1,000 accounts, and the honest conclusion of `data-provider-angle.md` was that a
human clicking a UI cannot generate the volume that would require.

This one does not try. It sells an outcome that is worth $8,000/mo to a company
with a pipeline number, and it uses the enrichment engine as the thing that makes
delivery possible rather than as the thing being sold.

The cost is that it is an agency, and agencies are bought with founder attention.
That is the trade. It is worth making, on the condition that week 4 produces
three paid audits — and not on the strength of this document.
