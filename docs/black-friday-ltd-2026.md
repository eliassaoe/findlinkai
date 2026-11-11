# Black Friday 2026 lifetime deal through creators and deal platforms

Owner, 11 Nov 2026: sell the lifetime deal (`docs/ltd-campaign.md`) once, over
Black Friday (Fri 27 Nov to Cyber Monday 30 Nov), through partners with an
audience, so cash comes in upfront instead of slowly through subscriptions.

## Deal terms we offer partners

- A small fee upfront, or none, plus **25% of lifetime-deal sales from their link**.
- Each partner gets its own tracked link.
- One window for everyone, 27–30 Nov, **no seat cap** (owner, 11 Nov: sell as many as we can).
- Never pay a flat fee on views alone. Break-even is ~4–5 Core sales ($149)
  per $500 spent.

## Partners in talks (11 Nov)

| Partner | What they have | Terms on the table |
| --- | --- | --- |
| forgoodcode (Instagram, 2.1M) | carousel + story + newsletter + ManyChat DMs | we offered $500 + 25% of LTD sales, cap $1,500 (they asked $1,000 + $5 CPM, cap $3,500) |
| B2B Boosted (7k newsletter + 25k LinkedIn) | email Tue / LinkedIn Thu newsletters | we offered $300 + 25%, fallback the June deal: 4 features for $500 (they now ask $700 per mention) |
| SaaS Pirate | newsletter + socials | asked for rates for 24–30 Nov |

## Warm replies in Explee (project 30475) worth reopening

From campaigns *Deal-blast partners* (264589) and *Distribution partners*
(210723), read 11 Nov. Most of the 84 "hot" replies in 210723 are accelerators,
incubators and VCs, which have no audience to sell to. Only these fit:

| Domain | Type | Where it stopped |
| --- | --- | --- |
| dealmirror.com | LTD marketplace | reviewing the test account we gave them |
| saasmantra.com | LTD marketplace | asked for a calendar link |
| infostack.io | SaaS deal marketplace | CEO sent a calendar link |
| sendercircle.com | SaaS launch platform | CEO's calendar link, "potential launch" |
| nachonacho.com | SaaS marketplace | intake form |
| thebreakdownai.com | AI newsletter | asked deliverables, timeline, budget |
| gptoast.ai (Toast Media) | French AI newsletter | asked what the product is |
| structured.agency | email-marketing creator | asked timing, deliverables, budget |
| amplifiedgroup.com (CMO Circle) | marketing community | asked budget |
| creatortoolslist.com | creator tools directory | asked what's in it for creators |
| aitoolsexplorer.com | AI tools directory | will list it; paid tier adds MCP/LinkedIn pages |
| reviewai.in | tool review site | wants a 30-min call |
| logicielfrance.com | French software directory | "tu as quoi en tête ?" |
| joinbrands.com | influencer marketplace | calendar link |

Instantly has no influencer or newsletter campaign (only the 4 agency
campaigns), so nothing to recover there.

## Deal page state (set 11 Nov 2026, 19:00 Paris)

- `ltd_settings`: `seat_cap` **0 = no cap** (the column is NOT NULL; the page
  treats 0 as unlimited and hides the seat counter, see `closed` in
  `lifetime-deal.html`), `ends_at` 2026-12-01 07:59 UTC = Cyber Monday 23:59
  Pacific. The page is open now; partners post on 27 Nov.
- `/lifetime-deal` copy rewritten for new visitors (it was written for free
  account holders in October); visitors with no account get "Create a free
  account to buy" → `/sign-up`.
- Partner links carry `utm_source=<partner>&utm_campaign=bf2026`; the page
  passes them to Dodo as `metadata_attribution_source` / `_campaign`.
- SaaS Pirate: paid $129 on 11 Nov, link `?utm_source=saaspirate&utm_campaign=bf2026`.
- Fulfilment is the n8n node in `docs/ltd-campaign.md` ("The n8n node that
  grants it"), keyed on the buyer's token. It has never processed a real LTD
  payment: make one test purchase before 27 Nov.

## Email to our own free users (built 11 Nov, sends 27 Nov)

- Audience: PostHog static cohort **712192** "Black Friday 2026 LTD — confirmed,
  never paid (all countries)", 2,084 people on 11 Nov. Source is Supabase
  `refresh_ltd_campaign_audience()` (confirmed email, never paid anywhere, no
  colleague of a payer) joined to PostHog persons with no payment event.
  Refreshed on 11 Nov: 2,832 rows in `ltd_campaign_audience`.
- Workflow **`01a1cbcf-82d9-0000-1fb9-97bdd54d69ed`** "Black Friday 2026 —
  lifetime deal (free accounts)", **draft**. Batch trigger on cohort 712192,
  from support@, marketing category, 600/hour, exits on any payment.
  - Fri 27 (at dispatch): "Black Friday: LinkFinder AI for life, paid once"
  - Sun 29 (+2d): "the math on the Black Friday deal"
  - Mon 30 (+1d): "last day: the Black Friday deal closes tonight"
  - Links `utm_source=email&utm_campaign=bf2026&utm_content=e1..e3`.
  - All three steps test-ran clean (mocked) on 11 Nov.
- **26 Nov (reminder set in the session):** refresh the audience, re-create the
  cohort, check the page, then blast-radius preview → owner confirms the count
  → enable → one-off dispatch Fri 27 Nov 14:00 UTC.
- October's LTD email to 559 free users sold 0. Black Friday is the reason to
  try again, at 4x the audience; don't size anything on it.

## Sent 11 Nov 2026, evening

- Explee (project 30475, Deal-blast campaign), replies in-thread: Chase Dimond
  (structured.agency), Nicola (CMO Circle), The Breakdown AI, Toast Media (FR),
  CreatorToolsList (30% affiliate), InfoStack (listing — sent by mistake: owner had already won InfoStack, do not contact again). Newsletters: $100 +
  25% of LTD sales from their link.
- Gmail (owner's main account): The AI Valley (media kit + fee + 25%), Spry PR
  (30% affiliate), blackfridaydeals.dev (email submission).
- GitHub: LinkFinder AI row added at the end of "Marketing Tools" in
  trungdq88/Awesome-Black-Friday-Cyber-Monday on the owner's fork
  (eliassaoe, branch patch-1); the PR itself is opened by the owner.
- DealMirror: owner already in. SaaSMantra and SenderCircle: owner sent.
- Each partner has its own `utm_source`; filter `utm_campaign=bf2026`.

## Site-wide banner (live from 11 Nov 2026)

`js/lf-bf-banner.js`, loaded by `js/lf-attribution.js` (258 of 268 pages,
including `/app`, the home page and every free tool). "Early Black Friday" bar
until 27 Nov, "Black Friday" + countdown in the last 5 days, gone after
1 Dec 07:59 UTC on its own. Hidden on `/lifetime-deal`, `/redeem-code`,
`/account`, after a dismiss (24 h), and for accounts that already paid or hold
a lifetime plan (`ltd_eligibility`). Link `utm_source=site_banner`,
`utm_content=<page path>`. PostHog events `bf_banner_shown / _clicked /
_dismissed`. Idea from a founder video the owner shared (11 Nov): banner +
short countdown, start before Black Friday. `tests/bf-banner.test.mjs`.

## Platforms checked 11 Nov

- Dealify: the old **UnlimitedLeads** LTD ran there (payouts to May 2026) and
  was ended by Dealify on 1 Sept 2026 for a 36% refund rate. LinkFinder AI is
  not listed. Pitched LinkFinder AI for BF in the same Gmail thread (Raul).
- DealFuel: **LinkFinder AI is live** ($79–149). Asked them in the deal thread to
  feature it in their BF page and newsletter; apologised for the unanswered
  May support ticket.
- RocketHub: rejected UnlimitedLeads in Aug 2025 because it had run LTDs
  elsewhere ("we are the first stop"). LinkFinder AI is on DealFuel, so not
  pitched.
- StackSocial: inbound-only and weak founder results; not pitched.

## What worked for other founders (research, 11 Nov)

- **Usermaven** sold $120k self-hosted in 3 weeks (373 buyers, 5.7% refunds,
  30-day guarantee). Biggest driver: **Facebook LTD groups** (MarTech Wise,
  SaaS Warrior, Ken Moo, Lifetimo), whose admins got a free lifetime account to
  post it. Then their own list (3 emails) and Twitter. Their page had one CTA,
  a demo video, a timer, testimonials and a live FAQ.
- Another founder made **$6k in 15 days** with Facebook LTD groups (Ken Moo,
  LTDHunt, "LTD deals with Kabir", DownloadSilo) at **25% commission** instead
  of AppSumo, plus giveaways in the groups. Find more by searching "LTD" on
  Facebook.
- Hive Index sizes: MarTech Wise 10k, Ken Moo 9k, Use your LTDs 3k.
- Founder video the owner shared: start early, timer only in the last days,
  top banner, founder face on video, a Cyber Monday bonus.
- Free listings: `danmindru/rare-big-deal` (PR, Marketing → Sales Tools, gives a
  page + backlink on rarebigdeal.com), on top of the trungdq88 list.

### Facebook group admin DM (owner sends from his own Facebook account)

> Hi {name}, I run LinkFinder AI (finds emails, phones and LinkedIn data from a
> name, company or LinkedIn URL). We're doing a Black Friday lifetime deal,
> $149 once for 2,500 credits every month, 27–30 Nov. Would you post it in
> {group}? You get a free lifetime account for yourself and 25% of every sale
> from your link, paid in December. Happy to send a demo account now so you can
> try it first.

Each admin gets `?utm_source=fb_<group>&utm_campaign=bf2026`.

## Cold email variant (prepared, NOT live)

Owner, 11 Nov: "il faut tester" selling the lifetime deal in cold email instead
of a subscription. Proposal: 27–30 Nov only, **half of the new leads** of the
SaaS campaign (Explee 37934) get this, half keep the normal sequence, so we can
compare. Risk: a cold prospect who would have paid $49/month takes $149 once.
Sales from it carry `utm_source=cold_ltd`.

1. Subject: `{company}'s prospect emails, for life`
   > Hi {first_name}, LinkFinder AI turns a LinkedIn URL, a name or a company
   > into a verified email and phone. For Black Friday only, it's $149 once
   > instead of a monthly plan: 2,500 credits every month, for life. Ends Monday
   > night. Want me to run 10 of your prospects through it first so you can
   > see the find rate?
2. (+1 day) Subject: `re: {company}'s prospect emails, for life`
   > The math: 2,500 credits a month is ~250 emails found from LinkedIn
   > profiles. Our Starter plan is $49/month for 5,000. Paying once and keeping
   > it beats 3 months of subscription. Link: linkfinderai.com/lifetime-deal
3. (Mon 30) Subject: `closes tonight`
   > Last note: the lifetime deal closes at midnight Pacific tonight, then it's
   > back to monthly plans only.

Buying needs a free account first (the page says so), so step 1 offers the
10-prospect test, which gets them to sign up.

## Own audience, widened (11 Nov evening, owner: "bourriner")

- **Past customers are allowed to buy**: 119 added to `ltd_allowlist` (reason
  `bf2026_winback`) — paid before, no lifetime plan, no AppSumo code, and not an
  active subscriber (anyone with a subscription who used the product in the
  last 60 days is left out, so we don't swap $49+/month for $149 once).
  The 28 legacy Gumroad payers are NOT included: Gumroad renewals still run and
  we can't tell who churned there without Gumroad access.
- `ltd_campaign_audience` has a `segment` column: 2,834 `free` (confirmed,
  never paid) + 119 `winback`.
- Second workflow **`01a1cc36-40eb-0000-a5e4-dbbc968bebe7`** "past customers
  win-back", cohort **712475**: Fri 27 "Black Friday: LinkFinder for life, for
  past customers", Mon 30 "last day". Test-ran clean. Draft.
- Reminder set for 26 Nov 17:05 Paris: re-create both cohorts (free cohort gets
  `segment = 'free'`), show the owner the counts, schedule both for Fri 27 14:00 UTC.
