# Lead sources with real France coverage

The constraint, in order: **France coverage first, an API second, pay as you go
third.** The intent-first version of this file was wrong for this market - the
measurements are kept at the bottom because the reasoning still matters.

## "The list is the highest leverage in cold email" — true, and not what this file is about

It is the standard advice and it is correct. But *list* in that sentence means
**who you write to**, not **which vendor's row you bought**. Those are different
decisions worth wildly different amounts:

| Decision | Leverage | Why |
|---|---|---|
| **Targeting** — French *responsables d'achat* at 250-person ESNs, or SaaS founders under 25 staff? | **enormous** | changes reply rate by multiples. This is what "the list" means. |
| **Vendor** — Explee's row or Pharow's row for the *same person*? | small | both return roughly the same human. Worth 17% on cost, and 2.17x is what a swap must clear. |
| **Vendor, when only one can reach them at all** | **enormous again** | not a price comparison: there is no competing row. `leadsource_test.py overlap` measures exactly this. |

So the two claims sit together. Targeting is the biggest lever there is; swapping
data suppliers for the same audience is not, unless it buys reach you did not
have. Everything priced in this file is the second question. The first one is
free and lives in the campaign definition.

**And it is readable over the API for nothing:**

    python3 explee.py GET /public/api/v1/autogtm/campaigns/130465

returns `offer`, `target_role`, `target_geography`, `target_company_size`,
`positive_criteria`, `negative_criteria`, `example_clients` and the derived
`keywords` — the whole targeting, in one free call, for each of the three
campaigns. At a 1.05% reply rate that is the first thing to read, before any
invoice to anybody.

One caveat that is not a hedge: a list can only be judged once the mail arrives.
The pool is shared and a prospect has written back saying it landed in spam, so
some of that 1.05% is placement rather than targeting. Both are real; only one of
them is free to fix today.

## The one-line answer

There is no single "biggest French lead source" you buy. The biggest is the
**official company registry, and it is free**. What costs money is turning a
company into a named person with a working email. So the stack is three layers,
and each has a French-native winner:

    company universe   SIRENE / Societeinfo     25M companies, free to ~EUR 0.05/credit
    the person         Explee / LinkedIn        ~$0.01 per person
    email + mobile     FullEnrich / Dropcontact ~$0.058 per verified email, pay per success

Buying a monolithic database instead means paying for all three every time, at
worse French coverage than the registry you can have for nothing.

## Every source, measured or sourced

| Source | France coverage | API | Price | Per usable lead |
|---|---|---|---|---|
| **INSEE Sirene** (open data) | **25M companies, 36M establishments**, official, daily | free, OAuth2, 30 req/min | **free** | company only |
| **Societeinfo** | INPI + INSEE + SIRENE + BODACC, segmentation engine | API-first | PAYG credits, no expiry, EUR 0.25 down to EUR 0.05 | ~EUR 0.05-0.25 (company) |
| **Pharow** | 4M active French companies, 10M prospects, **78.7% email / 76% phone** | export + webhook, not a true API | EUR 105-169/mo, packs 500=EUR 90 … 10k=EUR 600 | **~EUR 0.18** |
| **Kaspr** | 90M phone numbers, the best source of French 06 mobiles | API | credits | phone only |
| **Dropcontact** | generates and verifies in real time, stores nothing, GDPR-native | API | from EUR 24 / 1,000 credits | ~EUR 0.024 |
| **FullEnrich** | waterfall over 20+ providers, ~80% hit vs 50-60% single-source | API | $29 / 500 credits, **charged only on success** | **~$0.058** |
| **Explee** (current) | 105M companies worldwide, natural-language `definition` | API | 1 credit/person, 1.5/email found | **~$0.025** |
| **Instantly** | **1M+ French contacts** (hits the count cap) | API | **5 credits/lead** | ~$0.157 |
| **Cognism** | deepest FR/DACH/Benelux, Diamond mobiles | API | **$15-35k/year** | out of reach |
| **Apollo** | strong US, weak and thin on France | API | $49/user/mo | not for France |

Two things fall out of that table immediately.

**Explee is already the cheapest lead in the list, by a lot.** At ~$0.025 a
usable lead it is 7x cheaper than Instantly and 3x cheaper than a
SIRENE + FullEnrich build. Nothing here beats it on price, so no source below is
worth switching to *for cost* - only for quality.

**The French-native tools win on French depth, not on volume.** Pharow's 78.7%
email and 76% phone coverage on French prospects is the number to beat, and it is
a number no American database publishes for France. That is the real test worth
running: not "intent vs no intent", but **Explee's French coverage against
Pharow's on the same 500 companies.**

## What "golden" has to mean, numerically

At EUR 0.18 a lead against Explee's ~$0.025, Pharow is not asking to be a bit
better. Sending is ~$0.12 a lead either way (four emails at $0.03), so:

    Explee   $0.025 + $0.12 = $0.145 per lead
    Pharow   $0.195 + $0.12 = $0.315 per lead   ->  2.17x

**Pharow has to produce 2.17x the calls per lead just to draw level on cost per
call.** Not 20% better. More than double.

Now the part that should decide how much attention this whole question deserves.
At $50 a call and $0.145 a lead, one call costs about 345 leads - and of that $50,
**the lead data is $8.62 and the sending is $41.38.**

| Scenario | Cost per call |
|---|---|
| Today | $50.00 |
| **Leads become free** | **$41.38** (-17%) |
| Pharow leads, same conversion | **$108.62** (+117%) |

So the entire prize available from lead pricing is 17%, and the downside from
getting the source wrong is more than double. **The lead source is a small lever
on cost and a large lever on risk.** Anything that moves the reply-to-call rate
moves the number several times harder, in both directions, and costs nothing.

### Which does not mean Pharow is a bad idea - it means test the right claim

Pharow's published claim is not "our leads convert twice as well". It is
**78.7% email and 76% phone coverage on French prospects**, which is a
reachability claim, and reachability is testable in an hour without sending a
single email:

- Can Explee even fill 500 French *responsables d'achat* at 250-1,000 person
  companies? If it can, Pharow is a luxury and the 2.17x bar sinks it.
- If it cannot - if Explee returns 120 usable French buyers where Pharow returns
  400 - then Pharow is not competing on price at all. It is the only source that
  can run the campaign, and its price stops being the question.
- Bounce rate is the third number and it is not priced anywhere: a French list
  that bounces at 8% costs sending domains, which are worth more than EUR 105.

**So: do not buy the EUR 105 yet.** Pharow's 15-day trial gives 100 credits.
Pull 100 leads on the exact ICP, ask Explee for the same 100 companies, and
compare fill rate, title accuracy and bounce rate. Buy the month only if there is
a visible gap - and if there is, the 2.17x argument above is moot, because you
would be buying an audience you otherwise cannot reach.

### The same bar, at the price actually being paid

**$169 for 2,000 credits = $0.0845 a lead**, less than half the EUR 90 / 500 pack
this file was originally costed against. That changes the verdict, so it is worth
being explicit about how much:

| | per lead | all-in with sending | Pharow must beat |
|---|---|---|---|
| costed at EUR 90 / 500 | $0.195 | $0.315 | 2.17x |
| **at $169 / 2,000** | **$0.0845** | **$0.2045** | **1.41x** |

Against the measured seven days - 5,231 emails, $156.93, 14 interested, four
emails a lead:

| Pharow's reply rate vs Explee's | Interested | Cost per interested lead |
|---|---|---|
| today, Explee | 14 | **$13.54** |
| 1.00x (same) | 14 | $19.10 |
| 1.25x | 18 | $15.28 |
| **1.41x** | 20 | **$13.55** — break-even |
| 1.50x | 21 | **$12.73** |
| 2.00x | 28 | **$9.55** |

**1.41x is a different question from 2.17x.** Doubling a reply rate on data
quality alone is a stretch; beating it by 40% on French buyers with a
French-native database is an ordinary outcome. At $169/2,000 this stops being a
bad bet and becomes a reasonable one - and at 2x it is a 29% cut in cost per
interested lead.

What has not changed: reply rate is driven by offer, then targeting, then inbox
placement, then data accuracy. A prospect has said in writing that these emails
land in spam (see BASELINE.md), and Pharow leads go to the same spam folder from
the same domains. The 1.41x is winnable, but not while placement is broken.

**One lever lowers the bar further: sequence length.** The lead is paid once and
the sends are paid per email, so more follow-ups amortise it. At $0.0845 a lead:

| Emails per lead | Leads for the same 5,231 sends | Pharow must beat |
|---|---|---|
| 4 | 1,308 | 1.41x |
| 6 | 872 | **1.29x** |

Budget: 2,000 credits is 2,000 leads at 1 credit each - a 500-lead test arm costs
$42 and leaves 1,500 credits for the winner. Phone numbers cost 10 credits each,
so do not enable them on a test. If the $169 is the monthly Advanced plan rather
than a one-off pack, it recurs: cancel it if the test loses, and note the credits
themselves do not expire.

If expensive leads are bought, buy fewer of them and work each one harder. A
six-email sequence makes Pharow a materially easier bet than a three-email one.

## If the leads are unique, the price argument does not apply

The 2.17x above compares two prices for the same person. It says nothing about a
person who exists in one source and not the other - that lead has no Explee
price, because there is no Explee lead. Then the question stops being "is this
worth 2.17x" and becomes "is this audience worth reaching", which is a different
decision with a different answer.

`leadsource_test.py overlap` measures it directly, for about a dollar:

    python3 leadsource_test.py overlap --leads pharow.leads.json --apply

Same companies, same titles, asked of Explee, then counted person by person into
three buckets: Explee has the same person · Explee has the company but not this
person · Explee does not have the company at all. The last two are the leads that
only exist in Pharow.

- **50%+ unreachable through Explee** - it is a reach decision. Buy it if the
  audience is worth having; cost per lead is not the argument any more.
- **Mostly overlapping** - the premium is buying a slice of extra audience and
  still has to clear 2.17x on everything else.

Run this on the trial's 100 credits before the EUR 105. It is the one number that
decides which of the two arguments applies.

## And if the booking rate really does double

Entirely plausible, and worth being precise about what it buys. Break-even is
2.17x, so a **2.0x booking rate roughly draws level on cost per call** - about
$52 against $50. What you get is not a cheaper call, it is **twice as many calls
at the same unit cost.**

That is a good thing to buy. It is a pipeline lever, not a cost lever, and the
original goal - get cost per call under $50 - is not what it delivers. Worth
knowing which one is being bought before the invoice, because the two get judged
by different numbers: this one is judged on calls per month, not dollars per call.

## The decision: Pharow gets a shot

One Pharow campaign against one Explee campaign, same brief, same week - the
runbook is in the README. Pharow is the only source in the table that publishes a
French coverage figure (78.7% email, 76% phone), and it is the number Explee has
to beat on French buyers. It is France-only and export-based rather than a true
API, so the arm costs a manual CSV step each round; acceptable for a test, worth
remembering before standardising on it.

The cheap version below is still worth an hour on the trial credits first,
because it answers the same question in a day without sending anything.

## The cheaper version of the same question

A fill-rate test, and it costs almost nothing:

1. Take 500 French companies from SIRENE or Societeinfo - free, and the same list
   for both sides, which removes the targeting variable entirely.
2. Ask Explee for the buyer at each (`people-by-domains`, 1 credit a person).
3. Ask Pharow (15-day trial, 100 credits) or FullEnrich ($29) for the same.
4. Compare **fill rate and bounce rate**, not reply rate. Whoever finds more
   real people at the same companies wins, and you find out in a day instead of
   a month, without sending a single email.

That answers "is my lead data the problem?" for about $30 and no domain risk.
Only if the winner is materially better does it earn a sending test.

## GDPR, since the market is France

Dropcontact stores nothing and generates on demand, which is the cleanest posture
for French B2B. Societeinfo and SIRENE are public legal data. Cognism runs
legitimate interest with Article 14 notices. American databases holding French
personal data without a lawful basis are the exposure - worth caring about when
your customers are ESNs with their own compliance teams.

## What was measured on Instantly, and what it means

The France universe is **not** the problem: an unfiltered French company search
returns 1,000,000+ contacts, which is the API's cap, not the ceiling. Instantly
is a perfectly good volume source for France.

**The signals are the problem.** French companies of 250-1,000 staff, buyers
titled *responsable / directeur des achats, acheteur, purchasing manager*, 90-day
window:

| Filter | Leads |
|---|---|
| No signal at all | **2,535** |
| `job_change` - the best trigger there is | **0** |
| `reddit_buying_intent` | ~0 for this audience |
| `linkedin_post_company` | 880 |
| `website_expansion` + `technology_adoption` + `partnership` | 943 |

The two signals that mean *a person is in market* do not exist for French
non-tech buyers. What is left is company-level website and LinkedIn activity:
"this company posted something", which is not intent, it is proof the company is
alive. The same filters on a US software audience return 7,549. The data is real;
its coverage is Anglophone and tech.

So: **do not pay $0.157 a lead for `linkedin_post_company`.** That is an intent
price for a liveness check. An ESN that wants responsables d'achat at 250-person
companies is not helped by a signal database built on Reddit threads and funding
rounds - for those audiences the lever is targeting, and Explee's `definition`
search already takes a natural-language description instead of matching an
English taxonomy.

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

## Ruled out

- **Cognism** - the best European data in the list and the only one with real
  French mobile depth, at $15-35k a year on an annual contract. Revisit when the
  service is selling six figures.
- **Apollo** - strongest in North American SMB, thin on France. Wrong hemisphere.
- **Gojiberry ($99/mo)** - named in the original plan; a subscription whose
  signals are the Anglophone ones that just tested empty for France.
- **G2 buyer intent** - genuinely in-market data, but it needs a claimed G2
  product on a paid intent tier. Checked: this account owns no G2 product.
- **Parallel** - truly per-request (~$0.001-0.005 per 10 results) but it is a
  web-search API for agents, not a lead finder. You would build the finder.

Sources: [Pharow pricing](https://www.pharow.com/tarifs) ·
[Societeinfo](https://en.societeinfo.com/) ·
[INSEE Sirene open data](https://www.data.gouv.fr/dataservices/api-sirene-open-data) ·
[Dropcontact pricing](https://www.dropcontact.com/pricing) ·
[FullEnrich](https://fullenrich.com/blog/waterfall-enrichment) ·
[Cognism vs Apollo](https://www.cognism.com/cognism-vs-apollo-io) ·
[Salesdorado comparatif](https://salesdorado.com/fichiers-prospection/comparatif-bases-de-donnees-b2b/)
