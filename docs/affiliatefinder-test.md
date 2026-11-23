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
