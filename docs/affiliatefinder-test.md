# AffiliateFinder.ai test (started 23 Nov 2026)

Owner's idea: a MentionAgent for affiliates. Account created 23 Nov (owner set the
password), monthly plan ~€100/month; Black Friday offer $799/year (Pro, 200 email
credits/month, done-for-you list of 100) open until ~1 Dec — owner undecided.

## Setup (app.affiliatefinder.ai, brand linkfinderai.com, US)
- Search: competitors Apollo, ZoomInfo, Lusha, Seamless.AI, Cognism (5/5), 15 keywords,
  10 hashtags (pre-filled by the tool). 1,182 affiliates found; the trial shows the top 50.
- Outreach settings: 25% per sale, recurring on every renewal, 90-day cookie (matches
  `lf_ref` cookie, 90 days), up to $500 per referral, PayPal monthly from $50, free test
  credits, no paid sponsorships, program page `/affiliate`, first ask "reply and we send
  details", tone "Warm and polished", Never: no earnings/traffic promises, no claims of
  being better/cheaper than a named competitor, no invented numbers.
- Sending: owner's Gmail (hamoureliasse@gmail.com), 30/day, Mon–Fri 9:00–17:00 Paris.
  Bug hit: typing into the brand-name field appended to a pre-filled value
  ("LinkFinder AILinkFinder AI"); fixed and every draft regenerated before launch.

## Campaign "Test 1 - B2B sales creators & review sites" (launched 23 Nov ~12:00)
15 contacts (trial cap: 15 email credits): YouTube (Georgey Tishin, Software Scope, Matt
Lucero, LeadLoft, Vincent Robin, Savvy Search Solutions, Atishay Jain), TikTok (Xiao Zeng,
Ravi Abuvala, Mr Freelancer), sites (revpilots.com, dimmo.ai, aitoolstribe.com, bravado.co,
pearllemonleads.com, coldemailkit.com — one had no email). Competitor tools in the list
(Wiza, Saleshandy, Waalaxy, HeyReach, Snov.io, Evaboot, Scalelist…) deliberately left out.
4 AI emails each: day 0, 3, 7, 12.

## Replies
Answered in AffiliateFinder's Inbox. A yes → send them to linkfinderai.com/affiliate
(they need a LinkFinder AI account; the page gives their link) and add free credits.

## Decide by ~30 Nov (before the BF offer ends)
At least 1–2 serious affiliates interested out of 15 → the yearly offer can pay for
itself (one referral on Pro annual ≈ $178 commission-side cost, ~$713 kept). None → cancel
the monthly plan.

## Affiliates onboarding (first one: 23 Nov 2026)
- First "yes" came 30 min after launch (a TikTok creator from the list). Reply sent from
  AffiliateFinder's Inbox: sign up with Google on /sign-up, reply when done → we add
  **500 test credits** (~50 LinkedIn→email lookups); affiliate link on /affiliate.
  Contact details stay in AffiliateFinder, never in this public repo.
- Test credits: once the account exists, add 500 to that account's `credits` in
  `linkfinderai_users` (check the row first; never touch subscription fields).
- **Country block:** /sign-up refuses countries outside the allowlist, see
  `workers/signup/README.md`. We told them to say so if refused; the account then has to be
  created by hand. For a known affiliate with credits we chose, that is fine.
- 23 Nov 13:00: the first affiliate was refused at sign-up (country not on the allowlist).
  Account created by hand in `linkfinderai_users` (Gmail, 500 credits, email_verified
  true, 16-char token like normal accounts). Login with Google works from any country:
  the country rule only sits in the signup worker. He was told: 10 credits per email,
  50 per phone (best on US/Canada profiles).

## 23 Nov 2026 (evening): Pro bought, wave 2 launched
- Owner said go: trial ended early, **Pro monthly $99** charged on the card on file (annual $799 was pre-selected in the paywall; switched to monthly). Monthly Pro = **150 email credits / month** (resets the 23rd), not 200.
- Full results list pulled through the app's own tRPC call (`affiliateResults.getAffiliateResults`, `offset`/`limit<=100`, `filters:{}`): **1,607 affiliates** (461 YouTube, 551 TikTok, 162 Instagram, 433 websites).
- Saved by brand-fit score, skipping vendors/competitors (regex blocklist: Wiza, Saleshandy, Snov, lemlist, HeyReach, Apollo, ZoomInfo, Lusha, Evaboot…): `affiliateResults.saveAffiliate` + `emailFinder.startEmailResearch` per result. Credits are only charged when an email is found: 229 saved for 150 credits.
- **Campaign "Wave 2 - 230 B2B creators & review sites"**: 227 leads, **147 with an email**, AI-written 4-step sequence (day 0/3/7/12), same offer as Test 1 (25% recurring, $500 cap, 30-day hold, PayPal, free test credits). Launched; first sends 24 Nov 9:00 Paris.
- Bottleneck now = **sending capacity**: one inbox (owner's Gmail), 30 emails/day shared by both campaigns incl. follow-ups → ~588 emails ≈ 4 weeks. A second connected inbox doubles it.
- "Add your own" in AffiliateFinder takes a URL and spends an AF enrichment credit; you cannot paste an email you found elsewhere. So emails found with LinkFinder for the remaining ~340 websites must be sent from Instantly/Explee, not AF.
- 80 saved leads have no email (mostly TikTok/Instagram).

### The ~310 remaining websites → Explee (23 Nov, 18:40)
- Owner: send them from Explee. Script `workers/explee-autogtm/affiliate_sites.py` + workflow `explee-affiliate-sites.yml` (dispatch with the domain list; dry run by default): one decision-maker per site (founder/editor/owner/partnerships) via `people-by-domains`, emails via `enrich/email/batch`, imported into project **37934** as *"Affiliates - B2B tool review sites (AffiliateFinder)"* with an English affiliate brief, created *Not started*. Worst case ~$7.70 for 308 domains.
- **Blocked: Explee balance is negative** (`billing/balance` = -3021, i.e. about -$30). `people-by-domains` returns 402 `insufficient_credits`; nothing was spent or imported. Rerun the workflow with `apply=true` after a top-up. The domain list (public sites, filtered: no vendors, no off-topic) is rebuilt from AffiliateFinder: websites not saved there.
- LinkFinder's own API was not usable for this: every call with our key returns 500 `text is not defined` (see below).

### Bug found: API worker `linkedfinderapiaccess` turns 401/403 into a 500
In the sync path, `const text = await response.text()` is declared inside the `try` block, then `text.slice(0, 500)` is used outside it in the `if (response.status === 403 || 401)` log line → `ReferenceError: text is not defined` → the caller gets 500 *Internal server error / text is not defined* instead of the real 401/403 (bad key, no credits). Seen 23 Nov on the smoke test: even the "wrong key" case returns 500. Fix: declare `let text = ''` before the `try`. Also, our own key (GitHub secret `LINKFINDER_API_KEY`, used by the MCP server and the smoke test) is now refused upstream; it passed on 13 Nov. Check which account it belongs to and its credits.

### 24 Nov 2026: the remaining websites are in Explee — campaign 488202 (project 30475)
- Project 37934 (linkfinderai-outbound) no longer exists for our key; owner: put it in the LinkFinder AI project → **30475**, campaign *"Affiliates - B2B tool review sites (AffiliateFinder)"*, id **488202**. Imported campaigns start **Active** (not "Not started").
- Emails found with LinkFinder itself (app, bulk `company_name_to_email` on the 308 domains, test account): 280 answers, **only 169 on the site's own domain** (see bug below); 3 role addresses dropped (copyright@, newsletter@, a "flast@" placeholder) → 166 sent to Explee, **162 imported**, 4 refused (country not allowed).
- Import path: `explee-affiliate-import.yml` + `affiliate_import.py`. The leads go in the dispatch payload and are read from `$GITHUB_EVENT_PATH`, never echoed (the repo is public).
- Explee import rules learned the hard way: language must be `en-US` (not `en`); **no URL anywhere** in the first email or follow-up instructions; every lead needs `first_name`, `last_name`, `job_title` (role addresses get "there" → "Hi there", site name as last name, "Website team" as title); the brief's sample email goes through content moderation (one attempt was refused, the next passed).
- Booking link of the campaign set to Custom → `https://linkfinderai.com/affiliate` (the project default is the outbound-offer Calendly).

### Bug: `company_name_to_email` given a domain returns another company ~40% of the time
On these 308 sites, 111 of 280 emails were on an unrelated domain (b2bpowerhour.com → @bamboohr.com, damgun.com → @dunkinbrands.com, ageofai.tools → @zerobounce.net). The lookup treats the input as a name and matches look-alikes. When the input is a domain, results on another domain should be discarded (or the domain searched directly). Logged also in `docs/workflow-fixes-from-videos.md`.

## 24 Nov 2026, evening: inbox replies answered

- Sandeep Sharma (asked for details): full program terms sent + signup link, test credits on signup.
- Work-Management Team (paid content, link swap only above DR 70): declined paid, offered the affiliate program.
- Fahim Joharder / FahimAI ($1,500 sponsored review, 204k audience): declined paid, offered the affiliate program + test credits. Status "Negotiating".
- Inbox at 0 "Needs reply".

## 25 Nov 2026
- AI Made For (Apollo review, Outreach vs Salesloft vs Apollo): affiliate only with paid placement ($350–$900). Declined paid, affiliate left open.
- Fahim Joharder: sponsored only. Closed politely.
- Work-Management Team: "will look at the program". Acknowledged.
