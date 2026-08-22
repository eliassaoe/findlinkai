# The 55% problem

Not a recommendation to implement yet - a case for running one experiment, with
the numbers that argue for it.

## The shape of it

Sixteen weeks, real users, split by the existing low-conversion country list
(IN, PK, NG, BD, EG):

| tier | signups | enriched | **saw pricing** | paid | signup→paid | **pricing→paid** |
|---|---:|---:|---:|---:|---:|---:|
| standard | 820 | 637 | 214 | 20 | 2.44% | **9.3%** |
| low_conversion | 993 | 775 | 182 | 1 | 0.10% | **0.55%** |

The last column is the one that matters, and it is not what I expected.

**They reach the price.** 182 of them opened the pricing modal, against 214 from
the standard tier - near parity, from a group that is 55% of signups. They
activate too: 775 of 993 ran enrichments, a higher activation rate than standard.

So this is not a funnel problem, an onboarding problem, or a messaging problem.
They find the product, use it, go to the price, and stop. **Seventeen times more
often than everyone else, at the identical step.**

That is what a wrong price point looks like, as distinct from a wrong pitch.
Nothing in the credit wall - not the rescue, not the 40% code, not a call - fixes
a number that is out of range. All of that machinery is aimed at people who could
pay and are hesitating. These people mostly cannot.

## Why $25 is the wrong number here

The smallest thing anyone can buy is the $25 pay-as-you-go pack. Against median
local earnings, $25 in India or Nigeria is roughly what $150-250 feels like to a
US buyer. We are asking a hobbyist or a one-person agency to make a
multi-hundred-dollar-equivalent decision on a tool they have used for a few days.

One person in 993 said yes. That number is not a mystery.

## The experiment worth running

**A micro-pack, priced for the tier: 300 credits for $5.**

- Same per-credit rate as the $25 pack, so it does not undercut anything.
- Small enough to be an impulse rather than a decision.
- The point is not the $5. It is converting someone from a free user into a
  paying customer at all - the second purchase is a different, much easier sale,
  and today essentially nobody in this tier ever makes a first one.

Sizing, deliberately pessimistic. If a $5 pack converts this tier at even 2% of
those who reach pricing - a fifth of what the standard tier manages at $25 - that
is roughly 4 buyers per 16 weeks becoming perhaps 40. Small money. The reason to
do it is the cohort it creates: 40 people who have paid once, who can be sold to
again, in a market that currently produces one customer a quarter.

If it converts at under 1%, kill it. The answer is then that this tier is not a
market, and the right move is to stop spending credits on it - which the grant
cut to 10 already begins.

## What would have to be true

1. **Dodo has to support it.** A separate product at $5, restricted by country,
   or a country-priced variant of the existing pack. Worth adding to
   `docs/dodo-questions.md` if this gets picked up.
2. **Arbitrage has to be tolerable.** Someone on a VPN buying the $5 pack is a
   $20 loss on a pack that would otherwise not have sold. At this volume that is
   noise, not a threat - but it stops being noise if the tier ever converts well,
   which is the good problem.
3. **It must not appear to standard-tier users.** Same geo detection the signup
   worker already does (`request.cf.country`), so the mechanism exists.

## What not to do

**Do not spend on acquiring more of this traffic.** The deeper finding is not the
price at all - it is that 55% of signups come from a segment producing 5% of
revenue. Even at a perfect price point, the mix is wrong. Where those signups
come from - which pages, which keywords - is a bigger lever than anything on this
page, and nobody has looked at it yet.
