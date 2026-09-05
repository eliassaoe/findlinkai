# "They'll say yes and never use it" — the objection is right, and it re-orders everything

**Date:** 2026-09-05 · **Source:** Supabase `snxhsboboatjywgwdeds`, live.
Supersedes the sequencing in `docs/white-label-outbound.md` §"Reselling is a
better cold-outbound angle".

## The number that settles it

Credit-pack buyers — people who have already handed over money:

| | |
| --- | ---: |
| Pack buyers (`is_unlimited`, no subscription) | **89** |
| **Never ran a single lookup** | **67 (75%)** |
| Active in the last 30 days | **3** |
| Credits sitting unused by people who never ran anything | **923,292** |

At the $200 / 10,000-credit pack rate that is roughly **$18,500 of product paid
for and never touched.** Three-quarters of everyone who has ever paid this
business money did nothing afterwards.

Add the other two readings already on file: 114 people wired an API key, MCP URL
or webhook into their stack and never paid (`FUNNEL-REVIEW.md`), and 36 accounts
out of 7,318 have ever used the product on four separate days.

**Saying yes has never been the constraint here. Doing the work afterwards is.**

## So this is the wrong test for an offer

The question I was asking was *"can we deliver it?"* — which is why
`docs/white-label-outbound.md` put reselling first: it ships the enrichment API,
which works, rather than booked meetings, which have produced 0 replies from 44
sends. That reasoning was sound and **it weighed the wrong risk.**

The question that actually predicts revenue in this business is:

> **Does the money depend on them changing their behaviour?**

| offer | what they must do | activation risk | your delivery risk |
| --- | --- | --- | --- |
| **White-label reseller** | integrate the API, change process, migrate off Apollo/Clay, train staff, then sell it | **highest of anything discussed** | low |
| Subscription | remember to log in monthly | high — 7 of 31 subscribers active | low |
| Done For You | pay; nothing else | **none** | **high — cannot book a meeting yet** |
| **Per-record list build** | **email a CSV** | **none** | **none — it is the engine that works** |

White-label asks for *more* behaviour change than the subscription that already
fails at 75%. An agency signing a reseller agreement then never shipping volume
is not a risk; on this evidence it is the base case.

**The per-record project is the only row with a zero in both columns.**

## It also matches what your best customers actually did

Every large account in the database did a project, not a subscription:

    kbscorporate.com   14,064 lookups   6 days    then gone
    salesignition.com   9,058 lookups   4 days    then gone
    guidance.so         6,043 lookups   2 days    then gone
    endhunger.com       4,827 lookups   4 days
    institution.co.uk   4,076 lookups   ONE afternoon, then gone

`docs/outbound-angle.md` already read this correctly: *"They are not users. They
are people who arrived with a list, ran it, and left."* The mistake was selling
them a subscription. Sell them the thing they actually did.

And the deal size is there: `steven@salesignition.com` ran 9,058 lookups on an
$89 plan. **At $0.30/record that same job is $2,718** — the $2–3k figure from
`docs/outbound-close-motion.md`, in a single transaction, from a customer type
that has already appeared here ten times over.

## The wedge: the 67 who paid and never ran

This is the best email available, because it costs nothing and cannot fail on
delivery. They have already paid. The credits exist. You are offering to do the
part they did not do.

> **Subject:** your 10,000 credits
>
> You bought 10,000 credits and never ran a single lookup.
>
> That is rarely the tool. Loading the list, mapping the columns and babysitting
> the run is a job of its own, and it is the first one that gets dropped.
>
> So send me the list instead. A CSV, whatever shape it is in. I run it and send
> it back filled — emails, direct dials, company data. Your credits cover it.
> You have already paid for this.
>
> How many rows have you got?
>
> Eliasse

What it produces, in order: dormant credits become usage · a delivered list build
· a case study with a real row count and turnaround · **and a working
relationship with an agency that has now seen you deliver.**

Personal inbox, per `docs/dfy-activation-campaign.md` — 49 of the 67 are
unconfirmed in `auth.users`, so this must not go near the week-old sending
domains.

## The cold version, once the mailboxes mature

Same shape, priced. This is the campaign the nine mailboxes should carry —
not reselling, not Done For You.

> **Subject:** send us the list
>
> You build lists for clients every month, so someone on your team is filling in
> the missing emails and direct dials — by hand, with a tool, or with a VA.
>
> Send us the list instead. You get it back the same day, filled. Priced per
> record we fill: you pay for what we find and nothing for what we do not.
>
> A client sent 4,000 rows last month and had them back that afternoon.
>
> What size are your lists?
>
> Eliasse

Both true statements, both from the table above.

## Where white-label goes

Not dead — **downstream.** An agency that has paid for three list builds has
demonstrated a recurring need, willingness to pay, and a working relationship.
At that point *"want to run this under your own brand at wholesale?"* is a
promotion, not a cold ask, and the activation risk is gone because they are
already sending you lists every month.

**Activation gets earned, not asked for.** That is the whole correction.

## Revised order

1. **Now** — the 67 idle pack buyers, personal inbox, free list builds on credits
   they already own. Zero risk, zero delivery uncertainty.
2. **Now** — the same offer, paid, to the eight live business accounts and the
   ten vanished power users from `docs/outbound-close-motion.md`. Per-record
   pricing, $1–5k deals.
3. **~3 weeks** — cold campaign B above, once the mailboxes are warm and the
   bounce rate is under 2%.
4. **After 2–3 delivered projects** — offer white-label to whoever came back with
   a second list.
5. **After a booked meeting exists** — Done For You.

## The caveat worth keeping

Per-record projects produce cash, not recurring revenue —
`docs/data-provider-angle.md` rejected them for exactly that reason and it was
right about the endpoint. But it assumed you could get an agency to adopt a
recurring product directly, and 75% never-activation says you cannot. **The
project is how you earn the right to sell the recurring thing.** Take the cash
first; the relationship is what you are actually buying with it.
