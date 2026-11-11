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

## Done 11 Nov, 21:15–22:00 Paris

- PRs opened from the owner's fork: trungdq88/Awesome-Black-Friday-Cyber-Monday
  **#2626**, danmindru/rare-big-deal **#851** (Sales Tools, `utm_source=rarebigdeal`).
- Deal submissions by email from the owner's Gmail: saas.blackfriday
  (`info@`), Gaurav Tiwari's deals page (25% affiliate offered).
- Ken Moo (Facebook LTD group, 9k+): inquiry form at kenmoo.me/contact filled,
  **blocked by a reCAPTCHA** — the owner ticks it and submits. Their terms:
  30–50% commission, buyers pay on our site, founder answers in the group.
- Black Friday Times needs an account (the owner signed in himself 11 Nov).
- **LTD fulfilment tested end to end on the live n8n webhook**: a
  `payment.succeeded` for the Core product with the token of
  hamoureliasse54@gmail.com took it 50 → 2,550 credits, `ltd_monthly_credits`
  2500, `is_unlimited` true, `plan_type` and `subscription_id` untouched. Test
  account reset afterwards. Side effect: one `ltd_purchased` PostHog event
  (attribution_source `internal_test`) — exclude it from sales counts.
- **Security gap found**: the n8n Dodo webhook
  (`scalelinkfinderai-production…/webhook/9ffa2c7e-…`) accepts a POST without
  Dodo's signature. Anyone with that URL can grant themselves credits. Fix in
  n8n: verify the `webhook-signature` header (Standard Webhooks, secret on the
  Dodo endpoint page), or re-fetch the payment from the Dodo API by
  `payment_id` and check `status = succeeded` before any grant.

## Phone lookups broken: the Apify token in n8n is dead (found 11 Nov, 22:40)

n8n `primary-fie-production.up.railway.app`, workflow "linkfinder ai app v 4"
(`LntSghdJrXAAFYmr`): LinkedIn → phone goes through `HTTP Request31`, Apify actor
`x_guru~linkedin-phone-scraper-no-cookies`, credential **"apify api key"**
(httpQueryAuth). Apify answers **401 `user-or-token-not-found`** ("User was not
found or authentication token is not valid"). The same credential is used by
**23 Apify nodes** in that workflow (phone, skip trace, HarvestAPI profile,
LinkedIn rescue…): 28 of the last 100 executions (2 h) hit that 401. The phone
find rate fell from 85% (late Sept) to ~11% from mid-October, which is probably
when the token stopped working; misses are refunded, so nobody was charged.
Fix (owner, needs the secret): Apify console → Settings → API & Integrations →
copy the personal API token → n8n → Credentials → "apify api key" → paste it as
the query parameter value (`token`) → save. Then re-test 3 US profiles that had a
number in September (`enrichment_history`, type `linkedin_profile_to_phone`,
week of 28 Sept). Check the free-tools workflow (`KmQzVWHBMOXOWXZD`) uses the same
credential.

**Fixed 11 Nov, 22:31 Paris**: the owner put the API token of his current
Apify account in the n8n credential "apify api key" (the SaaS-only Apify account
is no longer reachable). Re-test: 9 of 9 US profiles that had a number in
September returned one again (app path), the free tool `business_phone_finder`
too. Rotate that token once things are stable (it was pasted in a chat).

## InfoStack price renegotiation (sent 11 Nov, 22:45)

Owner: $99 for 10,000 credits/month is too low next to our own $299/7,500 and
$599/25,000. Reply in Cary's thread "LinkFinder LTD: Codes, Guarantee and Dates":
option 1 = $199 for the same 10,000/month; option 2 = keep $99 with 3,000/month.
Split, guarantee, dates and codes unchanged. If he picks option 2:
`update appsumo_codes set monthly_credits = 3000 where partner = 'infostack';`
(before redemption; redeemed codes also need `ltd_monthly_credits` updated).

## Cold email: no price (owner, 11 Nov 22:22)

Prices in cold email land in spam. `brief.bf-us.json` now has no figure at all:
"Through Monday, you can pay once for it instead of every month."

## Price ladder + Agency tier (owner, 11 Nov 22:00: "plusieurs paliers, $150 pour le volume, une offre bien plus chère pour les gros payeurs, augmentation par palier")

| Tier | Credits / month | Price steps (Dodo product) |
| --- | --- | --- |
| Core | 2,500 (adds up, as before) | $149 first 50 sold (`pdt_0Np6hfk426N6l9EhVrFYO`) → $179 next 50 (`pdt_0Nrk0zRIGgPyuicb1YawD`) → $199 (`pdt_0Nrk16AWNOG8WwyM8ydyN`) |
| Plus | 7,500 (adds up) | $299 (`pdt_0Np6hjktXBH06Wqf5OT5o`) |
| Agency | 25,000, **topped back up to 25,000** each month, no rollover (owner didn't answer; my call) | $599 first 10 (`pdt_0Nrk1CAeR4RthDkU58OL6`) → $699 next 15 (`pdt_0Nrk1GkNaPFgE4eM6Icn4`) → $799 (`pdt_0Nrk1K7pLE4Mr6oxcocYY`) |

- `ltd_price_steps` (migration `20261111230000_ltd_price_ladder.sql`): one row per
  Dodo product. `ltd_public_state()` returns, per tier, the current step's price
  and product, `left_at_price` and `next_price`; the page shows "N left at $149,
  then $179" and the buy button follows the current product. Sales per tier =
  accounts whose `ltd_monthly_credits` equals the tier's amount.
- n8n "upgrade dodo" (`Azd5dYtQWHKqWcUm`, scalelinkfinderai instance), published
  11 Nov "LTD price ladder + Agency tier": `Switch2` rule 10 now *matches regex*
  over the 7 product ids, and `Postgres46` takes the monthly credits from
  `ltd_credits_for_product(product_id)` instead of a hard-coded CASE. Adding a
  step later = a Dodo product + a row in `ltd_price_steps` + the id in that regex.
  `Postgres47` (old Tier 2 branch) is no longer reached.
- Tested: Agency payment on the test account → 50 → 25,050 credits,
  `ltd_monthly_credits` 25,000; reset afterwards. Ladder moves to $179 / $799 when
  50 Core / 25 Agency sales are simulated (rolled back).
- Page: headline "Pay once for your sourcing tool…", Agency card (setup call with
  the founder), math table with Professional monthly and Agency rows.
  `tests/ltd-price-ladder.test.mjs`.
- Cold email (`brief.bf-us.json`): "pay once for your sourcing tool instead of
  every month", only price quoted is "from $149"; Agency is offered by hand when
  a reply shows a team.

## US cold campaign (owner, 11 Nov evening: "go, US, I'll fund it")

**Page:** `/free-list` — English copy of `/liste-gratuite` (same flow, same
download-after-signup, events `us_list_*`, `utm_campaign=us_free_list_bf2026`),
plus a Black Friday line in the end-of-run popup; the site banner shows on it.
`tests/free-list.test.mjs`.

**Copy:** `workers/explee-autogtm/brief.bf-us.json`, derived from
`brief.saas.json` (same 5-sentence form, no link in cold emails, link sent by
hand on "yes"). The 4th sentence becomes the Black Friday reason: "Through
Monday, it's $149 once for life instead of a monthly plan." Last follow-up on
Mon 30: "It goes back to monthly plans after tonight." When it's set up in
Explee, the reply instructions for this campaign must send `/free-list`, not
`/liste-gratuite`.

**Economics (from `BASELINE.md`):** $0.03 per email sent, ~1% reply, **$11.21
per interested lead**. If 1 interested lead in 10 buys: ~$110 per sale; 1 in 20:
~$225. Core ($149) roughly breaks even, Plus ($299) pays. A Starter subscriber
is worth ~$49 / 0.22 churn ≈ $220, so a $299 lifetime sale is worth more than a
subscription from the same lead. A $500 test ≈ 16,000 emails ≈ 45 interested
leads ≈ 2–5 sales. Research (firstsales.io): B2B buyers ignore retail "Black
Friday sale" language; keep it a plain, checkable offer with a real deadline.

**Blocker — phones:** `linkedin_profile_to_phone` found 5 numbers in 44 lookups
since 12 Oct (85% in late September); re-running 3 US profiles that had a
number in September returned nothing, in the app and in the free tool
(`business_phone_finder` answers empty in <1 s). The copy leads with mobile
numbers, so the campaign launches only after the phone step in n8n is fixed and
checked on 10 known US profiles. `/free-list` does not look up phones.

**To launch:** phone fixed → Explee balance funded (it was negative) → campaign
created in project 37934 from `brief.bf-us.json`, US filters, start Tue 24 Nov →
reply instructions point at `/free-list`.

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
