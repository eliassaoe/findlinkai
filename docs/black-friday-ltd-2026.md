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

## US campaign in Explee (prepared 11 Nov, 23:00 — Not started)

Project 37934, campaign **412273** "US - Lead gen, outbound and
appointment-setting agencies (Black Friday)": US, 10–150 employees, founders /
heads of sales; offer + problem written for agencies. First-email
instructions are a **campaign override** (Email sequence → "First email
instructions for" → this campaign → Custom): project copy with S4 replaced by
the Black Friday line, no price ("Try it on your own list, and through Monday
it's one payment instead of monthly."). Preview checked. Follow-ups = project
default. Auto-replies are project-wide only: the English block now sends
`/free-list?email=…` + booking link and answers price questions with "pay once
instead of monthly", no figure (the FR block is untouched). The old English block
pointed at `/agency` with a wrong "$59/month" line.
To send: top up Explee (balance was −$8.13), then Start campaign on Tue 24 Nov.
Volume is capped by mailboxes (~380 first emails/day on the live FR campaign),
so a week is ~2,500–3,000 emails (~$90), not tens of thousands.

Update 11 Nov 23:15 (owner: "dis clairement Black Friday", "full US", two
campaigns): S4 now names the deal — "We're running a Black Friday deal: one
payment instead of a monthly subscription, for 3 days." (no price, no figure).
Second campaign **412321** "US - Recruiting and staffing firms, executive search
(Black Friday)", same override + "say candidates, never clients or leads". Both
Not started. The project's ~380 first emails/day are shared by every running
campaign: pause the FR ones 24–30 Nov if the US ones should get the full volume.
Expected, at last month's rates (1% reply, ~1/3 of replies hot): ~2,700 emails →
~27 replies → ~9 interested → 1–3 sales. Cold email is the test, not the $5k.

## Tracking: which channel sold each lifetime deal (11 Nov, 23:50)

| Channel | What the buyer clicked | `source` on the sale |
| --- | --- | --- |
| Emails to our base (PostHog workflows) | `/lifetime-deal?utm_source=email&utm_content=e1..e3` | `email` |
| Site banner | `utm_source=site_banner&utm_content=<page>` | `site_banner` |
| Partners / newsletters / lists | their own `utm_source` (saaspirate, rarebigdeal, blackfridaytimes, gauravtiwari, saasblackfriday…) | that name |
| US cold email | `/free-list` (sets `utm_source=explee`) → signup → deal page | usually `site_banner` (last click) with **`first_source = explee`** |
| InfoStack | codes on `/redeem-code` | not here: `appsumo_codes where partner='infostack'` |

- `/lifetime-deal` sends to Dodo: `attribution_source/campaign/content` (utm on the
  URL, else the session's last campaign touch, else `direct`) and
  `first_source/first_campaign` (from `lf-attribution.js`, first touch ever).
- `ltd_sales` (migration `20261111233000_ltd_sales_tracking.sql`): one row per
  payment, written by n8n "upgrade dodo" `Postgres46` (a `WITH rec AS (INSERT …)`
  in front of the grant). Rendered SQL tested in a rolled-back transaction.
  **The n8n change is saved as a draft; the owner must click Publish** (my
  publish was blocked).
- Morning report: `select * from ltd_sales_by_channel;` (day × source × first
  source × sales × revenue). Ask Claude for it each day of BF week.

## Paid placements and marketplaces (11 Nov, 23:59)

- **The Follow Up** (40K B2B salespeople, 54% open, ~200 clicks/send, Tue/Thu):
  Passionfroot request filled — $300 budget, main slot Tue 24 Nov (Cyber
  Monday as fallback). Submitting creates a Passionfroot account, so the
  **owner clicks "Submit request"** (tab left open on the review page).
- **AppSumo rejected LinkFinder AI on 10 Nov** ("not a good fit"); a new
  submission is allowed after 30 days (10 Dec), so not for Black Friday. The
  6,000 `LFAS-` codes stay unused.
- Site traffic for scale: 7,278 visitors / 15,547 pageviews in the last 30 days
  (PostHog) — the banner reaches ~1,700 people a week; a retargeting audience
  would be small.
- LTD marketplaces still open: PitchGround (agency tools), SaaSMantra (owner
  emailed), DealMirror (in), Dealify (pitched), DealFuel (live).

## Own audiences, by warmth (owner, 11 Nov 23:06)

| Audience | Size (11 Nov) | Emails |
| --- | --- | --- |
| Free LinkFinder accounts that **used the tool** (`ltd_campaign_audience.enrichments > 0`, segment `free`) | 1,562 | a sequence: Tue 24 early access, Fri 27, Sat 28, Sun 29, Mon 30 |
| Free accounts that never used it (`enrichments = 0`) | 1,272 | 2 max: Fri 27, Mon 30 |
| Past customers (`winback`) | 119 | sequence like the warm free accounts |
| **Unlimited Leads** users (`public.users`, owner's old product), minus anyone already in `linkfinderai_users` | 12,184 | 2 max, only after verification (below) |

Unlimited Leads list quality: only 1 of 15,175 has `Account_confirmed`, 6,461
signed up in Dec 2025 alone (a burst), and disposable domains appear
(fogdiver, chaineor, delaeb, forexzig…). Sending 12k unverified addresses from
`support@linkfinderai.com` two days before the main Black Friday send would
risk the domain's inbox placement for the emails that matter. Run it through
an email verifier first (~$40–60 for 12k), drop invalid/disposable/catch-all,
then send from PostHog after identifying the survivors (as for cohort 616375).

Reminder set for 23 Nov to build the warm cohort + sequence before Tue 24.

## Partner outreach at scale

The project 37934 campaign "Partnerships — newsletters, affiliates, creators,
resellers" exists and is paused with 0 sent. Restarted with a Black Friday
affiliate offer (30% of lifetime-deal sales from their link, free lifetime
account, no upfront fee), it reaches thousands of newsletters / creators /
communities instead of the dozen contacted by hand. Needs the Explee top-up.

## Passionfroot requests sent (11 Nov, 23:30) — nothing is paid until a creator accepts and the owner pays the link

| Newsletter | Audience | Package | Our ask |
| --- | --- | --- | --- |
| The Follow Up | 40K B2B salespeople, 54% open, ~200 clicks | Main sponsor | $300, Tue 24 (owner submitted) |
| GTM w/ AI | 22K founders/sales, 45% open | Dedicated email (list $400) | $300, BF week |
| B2B Whales | 42K founders/CEOs/sales, 90% US, ~200 clicks | Classified (list $300) | $300, BF week |
| Practical Prospecting (Jed Mahrle) | 22.7K sales, 49% open, 7% CTR | Classified (list $500) | $300, BF week |

Other storefronts found (not requested): Death to Fluff (Belal Batrawy, 8K
sellers + 60K LinkedIn), The Sales Journal (Positano Media, $750), Revenue
Squared (4.4K, €500), Failory (founders, $350–700), Founders' Fuel, SellersGrowth.
Each accepted request = a payment link to the owner; give it its own
`utm_source` (thefollowup, gtmwai, b2bwhales, practicalprospecting).

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

## Unlimited Leads list → Explee: refused (12 Nov, 00:30)

Explee's "Import leads" requires first name, last name, company domain and job
title on every row. `public.users` (Unlimited Leads) holds **only an email** —
all 1,000 test rows were skipped, no campaign was created, nothing was sent.
The temporary export function (`tmp_ul_export`) was revoked from anon and
dropped the same minute. Two ways forward (owner's call): enrich the business
addresses with our own email → LinkedIn (5 credits each; gmail rows won't
match), or send the 2 emails from a tool that accepts email-only leads
(PostHog, as for the free cohort, after an email verifier).

## submitlist.io triage (12 Nov) — what can still sell before 30 Nov

Catalog read through its API: 122 directories, 70 marketplaces, 37
newsletters, 25 communities, 13 launch sites, ~1,600 subreddits.

**Marketplaces: none lands before Black Friday.** Airtable Extensions wants a
built extension, a walkthrough video, a read-only example base and a review;
Zapier, HubSpot, Google Workspace and Microsoft all review in weeks. The only
fast one is the **n8n community node** (`n8n-nodes-linkfinderai`, ready): the
owner runs Actions → "Publish n8n node" → `dry_run: false`
(`integrations/SUBMITTING.md`). Long-term value, not BF cash.

**Launch sites worth a BF launch (owner signs in, week of 23 Nov):** Product
Hunt (DR 91), Peerlist (77), Uneed (75, paid skip-the-line), PeerPush (73),
TinyLaunch (73), OpenHunts (70), DevHunt (63, dev-leaning). Use
`utm_source=<site>&utm_campaign=bf2026`.

**Free directories (long-term SEO, not BF cash):** G2, Capterra, Gartner Peer
Insights, Findstack, SelectHub, Technology Advice, TechBehemoths, SaaSpo,
Future Tools, AI Tools directories. Do after 1 Dec.

**Newsletters on submitlist:** big generic lists, no rates; the B2B sales ones
are on Passionfroot (below).

**Passionfroot, 12 Nov:** request sent to **Death to Fluff** (Belal Batrawy,
8.6K sellers, 38% open, ~150 clicks/send) — Sponsor of the Week, $300,
24–30 Nov, `utm_source=deathtofluff`. Not requested, by the numbers: Failory
(34K founders but 60 clicks for $350–700) and Founders' Fuel (50 clicks for
$599) — under the 2x bar at $149 a sale.

### Reddit (owner posts from his account; most sales subs ban tools)

Where a tool post is allowed, per submitlist's rules snapshot: r/SideProject
and r/Emailmarketing (direct post, no cold-email talk), r/Recruitment and
r/SaaS (megathread / weekly promo thread only), r/GrowthHacking and r/AI_Sales
(ask mods first). r/Entrepreneur, r/LeadGeneration and r/LinkedInTips ban
promotion — don't post there.

Post (r/SideProject; trim for megathreads), link
`linkfinderai.com/lifetime-deal?utm_source=reddit_<sub>&utm_campaign=bf2026`:

> **I built a tool that turns a LinkedIn URL into a verified email and mobile
> number — doing a pay-once Black Friday deal**
>
> I run LinkFinder AI. You give it a LinkedIn profile (or a name + company, or
> a CSV of 500), it returns the work email, the mobile number and the full
> profile. Recruiters and agencies use it to reach people without InMail.
>
> For Black Friday (27–30 Nov) I'm doing something I won't repeat: pay once
> and get credits every month for life, instead of a monthly plan. Capped
> seats, price goes up as they sell.
>
> Happy to run 10 of your prospects through it for free in the comments if you
> want to check the find rate before buying anything.
