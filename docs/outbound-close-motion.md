# Selling by cold email at $2–3k LTV — what has to be true

**Date:** 2026-09-05 · **Sources:** Instantly workspace (live), Supabase
`snxhsboboatjywgwdeds` (live), `docs/ai-sdr-offer.md`, `docs/outbound-angle.md`,
`docs/data-provider-angle.md`, `docs/dfy-activation-campaign.md`.

Goal being tested: *cold email → a call → I close → the account is worth
$2–3k over its life.*

**Verdict: the instinct is right and the arithmetic supports it — but not on a
subscription, not from the cold mailboxes this month, and not until one offer is
picked.** The part that can run today is a warm list of ~190 people, from a
personal inbox.

---

## 1. State correction — the mailboxes were rebuilt on 29 Aug

`docs/revenue-levers-2026-08.md` and `docs/outbound-angle.md` both say all 38
Instantly accounts are dead on OAuth and nothing can send. **That is no longer
true.** The workspace was rebuilt:

| | |
| --- | --- |
| Mailboxes | **9**, all `status: 1` (active) |
| Domains | 3 — `linkfinderai-outbound.com`, `-contact.com`, `-with.com` |
| Created / warmup started | **2026-08-29** (7 days old today) |
| Warmup score | 100 on all nine · CTD tracking active |
| Daily limit | 15/mailbox · warmup limit 12, increment 3 |

The 38 broken accounts and the five drafted sales campaigns are gone with the old
workspace. **One campaign exists, and it is not a sales campaign:**

| Campaign | Status | Purpose |
| --- | --- | --- |
| **Listicles** | **Active** | backlink / mention outreach to article authors |

Its results to date:

    emails sent 44 · human replies 0 · auto-replies 1
    bounced 3 (6.8%) · interested 0 · meetings 0

**So: no cold email selling anything has ever gone out.** The blocker is no
longer OAuth. It is that the machine exists, is seven days old, and is pointed at
backlinks.

Two things follow immediately:

- **6.8% bounce is a red flag on week-old domains.** The tolerance is ~2%. Three
  more sends like that and the three domains are damaged before the first sales
  campaign. The list needs verifying before it is sent to — and email
  verification is a thing this company sells.
- **Do not launch a sales campaign from these mailboxes this week.** Nine
  mailboxes at a 12/day warmup limit is not a sales channel yet. Mature capacity
  is ~9 × 20 = 180/day ≈ 900 prospects/month, and reaching it takes roughly three
  more weeks of ramp.

## 2. $2–3k LTV rules out the subscription — permanently

| Offer | Monthly | Months to $2–3k | Reachable? |
| --- | ---: | ---: | --- |
| Starter $49 | $49 | 41–61 | no |
| Professional $89 | $89 | 23–34 | no |
| Enterprise $149 | $149 | 13–20 | no — at 6.5% churn the average life is ~15 months, and the one Enterprise account has used 0 credits |
| Blended ARPU $62.50 | $62.50 | 32–48 | **no — ceiling is ~$940** |
| **Done For You** — $150/meeting, 5/mo floor | **$750** | **3–4** | **yes** |
| **Account-list maintenance** — per record maintained | **$500–1,500** | **2–4** | **yes** |
| Per-record bulk project (one-off) | $1–5k once | 1 deal | yes, but no second month |

A founder-closed call cannot be paid for by a $62.50 account. **Cold email into
the self-serve plans is not a motion that can ever work**, at any reply rate.
Above ~$750/month it works comfortably. That is the whole decision.

## 3. Three offers in the repo is zero offers on the wire

- `docs/outbound-angle.md` (23 Aug) — sell the job: per-record bulk projects, $1–5k.
- `docs/data-provider-angle.md` (23 Aug) — **explicitly supersedes the above**:
  per-record "produces cash but not a relationship". Sells monthly account-list
  maintenance at $500–1,500.
- `docs/ai-sdr-offer.md` — Done For You, $150/meeting held, 5/month floor.

All three are live in the product or the docs and none has been retired. At 15
sends a day you cannot learn which one works; you can only dilute. **Pick one
before the first send.**

**Recommendation: Done For You for the closing motion.** It needs no build (the
panel, the form, the Calendly and the `ai_sdr_requests` table all ship already),
it clears the LTV floor at $750, and it is the natural thing to say to the lists
in section 4. Keep account-list maintenance as the *expansion* offer sold to
clients after they are closed — it is the better long-term shape but it needs the
monthly re-check cron, which does not exist.

## 4. What can be sent today — ~190 warm prospects, personal inbox, no warmup

None of this touches the cold mailboxes or their deliverability.

### a. The vanished power users — the best list on the property

Everyone with 800+ lookups who has not returned in 30 days (measured today):

| account | cohort | lookups | active days | last used | days gone |
| --- | --- | ---: | ---: | --- | ---: |
| digitalmarketing@kbscorporate.com | pack buyer | **14,064** | 6 | 2026-06-26 | 71 |
| steven@salesignition.com | **subscriber** | **9,058** | 4 | 2026-06-12 | 85 |
| richardwen97@protonmail.com | **subscriber** | 4,999 | 2 | 2026-07-04 | 63 |
| simon@institution.co.uk | **subscriber** | 4,076 | **1** | 2026-06-08 | 89 |
| srivastava.atul@legistify.com | **subscriber** | 3,912 | 2 | 2026-05-19 | 109 |
| ayamit05@gmail.com | free | 3,274 | 5 | 2026-06-19 | 78 |
| azertyutulolo@gmail.com | free | 1,674 | 2 | 2026-08-01 | 35 |
| f.wenger@zimm.com | pack buyer | 1,016 | 2 | 2026-07-16 | 51 |
| davidcarroll8180@gmail.com | **subscriber** | 863 | 2 | 2026-06-28 | 69 |
| martin@iwantoverflow.com | pack buyer | 818 | 1 | 2026-07-28 | 39 |

Ten people, ~43,000 lookups between them, all gone. **Five are still paying** —
still billed, 63 to 109 days without opening the product. `simon@institution.co.uk`
ran 4,076 lookups **in a single afternoon** and has not returned in 89 days.

This is the exact buyer for a $2–3k engagement: demonstrated the pain, at volume,
with a credit card, and then stopped because the job was a project and the
project ended. Ten emails, written by hand, is the highest-expected-value hour
available.

### b. 67 pack buyers who never ran a single lookup

Copy is already written in `docs/dfy-activation-campaign.md`, EN and FR, plus the
4-day bump. That doc's instruction stands and is right: **do not run this in
Instantly** — 49 of the 67 are unconfirmed in `auth.users`, and putting them
through week-old domains risks the sending infrastructure for nothing. Personal
inbox, 18 confirmed addresses first, check bounces, then the rest.

### c. 114 integrated non-payers

From `FUNNEL-REVIEW.md`: 122 people wired an API key, MCP URL, webhook or CRM
into their stack and 114 never paid. They did the hard part already.

## 5. The dependency that decides whether this is real

Done For You promises **booked meetings**. Delivering it means running cold
outbound on a client's behalf. Your own cold outbound has so far produced **0
human replies from 44 sends**.

Selling a meeting-booking service before you can book meetings produces refunds
and a one-month life — precisely the opposite of a $2–3k LTV.

The saving grace is that this is not two projects. **Proving your own outbound is
building the product.** The same nine mailboxes, the same list-building, the same
sequences: first they sell LinkFinder, then they are the thing being sold. So the
order is forced, and it is not a detour:

1. Warm sends now (section 4) → first calls, first closes, first cash.
2. Ramp the cold mailboxes over ~3 weeks, on a verified list, one offer.
3. When the cold machine books meetings for you, it is provably able to book them
   for a client — and only then does Done For You scale beyond hand-sold deals.

## 6. You cannot run a closing motion you cannot measure

Still true from `docs/revenue-levers-2026-08.md`, and now blocking:

- Open and click tracking is off in Instantly (`open_tracking: false`,
  `link_tracking: false` on the Listicles campaign) — correct, keep it.
- PostHog flags **100%** of email engagement as `$virt_is_bot`. Opens and clicks
  measure nothing.
- **A booked call is invisible.** Calendly is off-site and nothing reports back.

Fix before spending a month on this: send a Calendly webhook into PostHog, or
redirect the Calendly confirmation to a thank-you page on `linkfinderai.com`
carrying the UTMs. Replies and booked calls are the only two metrics this motion
has, and one of them is currently untracked.

## 7. What the ceiling looks like if it works

At mature capacity, with industry-normal cold numbers:

    900 prospects/month  ->  1-3% reply  ->  9-27 replies
                         ->  3-8 calls   ->  1-3 closes
    2 closes x $750/mo  =  ~$1,500 new MRR per month

Against ~$1,939 MRR today, a working cold motion at two closes a month is close
to doubling the business — and each close is worth 12× a Starter subscription.
That is why this is worth doing, and also why it must not be launched on week-old
domains with a 6.8% bounce rate and three competing offers.
