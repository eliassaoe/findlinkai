# "Capture the traffic into an email list to feed the high-ticket offer"

**Date:** 2026-08-31 · **Sources:** PostHog 263837 (last 30 days), Supabase
`snxhsboboatjywgwdeds`.

A piece of advice worth testing against the numbers rather than agreeing with:

> *Capture the traffic into something you own. Email list, even a basic one.
> Every visitor who lands from search and leaves is value you paid for and don't
> keep. This also directly feeds the high-ticket offer — the people reading about
> lead generation are the people who'd pay €3k/mo to not do it themselves.*

The general principle is sound. **Both specific claims are wrong for this site.**

## The traffic is real

7,922 visitors · 18,947 views · 9,303 sessions in 30 days. Bounce rate 23%,
average session 4m54s. More monthly traffic than the entire all-time user base
(6,880). So there is something to argue about.

## Claim 1 — "you don't keep it" — mostly already false

| step | last 30d | of visitors |
| --- | --- | --- |
| visitors | 7,922 | — |
| reached `/sign-up` | 1,022 | 12.9% |
| reached `/confirmation-signup` | 546 | 6.9% |

Signup **is** the email capture, it is prominent, and roughly 7% of all traffic
completes it. That is not a leaking funnel.

The problem is one step later:

| | count | of signups |
| --- | --- | --- |
| accounts | 6,880 | — |
| ever paid anything (`is_unlimited`) | 120 | 1.7% |
| subscribed (`subscription_id`) | 31 | 0.45% |
| no `auth.users` row at all | 4,616 | 67% |

**This is a monetization problem, not a capture problem.** A lead magnet adds
more addresses of exactly the kind that already fail to convert — and two thirds
of the list already owned is unverifiable (see
`docs/email-verified-is-wrong.md`). Volume is not the missing input.

## Claim 2 — "they'd pay €3k/mo" — contradicted by what they read

Top pages by visitors, last 30 days:

| page | visitors |
| --- | --- |
| `/` | 1,594 |
| `/linkedin-email-finder` | 1,286 |
| `/linkedin-phone-number-finder` | 1,231 |
| `/linkedin-search-by-email` | 1,133 |
| `/linkedin-profile-scraper` | 641 |
| `/instagram-profile-url-finder` | 597 |
| `/linkedin-url-finder` | 587 |
| `/company-employee-finder` | 240 |
| `/best-social-media-finder` | 131 |

**Nobody is reading about lead generation.** Every one of these is a
single-lookup tool page. The person searching "linkedin phone number finder"
wants one phone number, now, free. `/instagram-profile-url-finder` at 597 is not
even B2B sales.

This is the same structural mismatch as putting the done-for-you offer in the
pricing modal: **the intent that brings them is "do this myself, cheaply."** You
cannot sell "don't do it yourself" to an audience defined by wanting to do it
themselves. Volume does not fix a wrong-audience problem; it scales it.

Also: **€3k/mo is not the offer.** Done For You is $150 per meeting held, five a
month minimum — $750/month. See `docs/ai-sdr-offer.md`.

## Where the high-ticket signal actually is

Not in content consumption — in behaviour, and it is already observable:

- **Ran a large CSV** — felt the work, has volume, has budget.
- **Bought a credit pack and never activated** — 67 accounts, median 10,000
  credits idle. Paid to solve a problem, then did not solve it. The strongest
  qualification there is. See `docs/dfy-activation-campaign.md`.
- **Subscribers with heavy usage** — the 25-enrichment banner already targets
  these in-app.

## Verdict

Do not build a lead magnet to feed Done For You. If a lead magnet is built, its
job is converting tool-seekers into signups and trials — a legitimate goal, and
a different one. Keeping the two separate is the whole point.
