# Lead sources with real France coverage

The constraint, in order: **France coverage first, an API second, pay as you go
third.** The intent-first version of this file was wrong for this market - the
measurements are kept at the bottom because the reasoning still matters.

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
