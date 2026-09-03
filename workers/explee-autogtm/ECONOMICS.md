# Does Explee pay for itself, for LinkFinder AI?

**Asked 3 September 2026.** Everything here is derived from `BASELINE.md`
(measured, 2 Sept), `SENDING.md`, `SOURCES.md`, `docs/outbound-angle.md`,
`docs/ai-sdr-offer.md` and `CHURN-PLAYBOOK.md`. Where a number is an assumption
it says so.

## The answer in three lines

| Selling this | Verdict |
|---|---|
| The **$89 subscription** | **No, and not marginally** — CAC is 2-10x the LTV of a cold-acquired subscriber. `brief.json` already says *"Never pitch the subscription"*. It is right. |
| The **per-record enrichment project** ($1-5k) | **Yes.** Needs 1 win per 148 interested leads to break even. That is the offer the campaigns already run, and it is the only one whose deal size can absorb a $157 call. |
| The **done-for-you meetings offer** ($150 / EUR 150 per meeting held) | **Not yet — the price and the delivery cost are the same number.** A meeting costs $157 to produce on Explee today and sells for $150. |

Keeping it is cheap; **scaling it is not decided yet**, because the number that
decides it has never been measured.

## What it costs, in context

At the current 22,400 emails/month (`SENDING.md`):

| | |
|---|---|
| Sending, at Explee's flat $0.03 | $672 |
| Lead data, at ~$0.025 a lead | $140 |
| **Monthly, all in** | **$812** |
| Interested leads produced | ~60 (374 emails each) |
| **Cost per interested lead** | **$13.54** |
| Cost per booked call, **measured** | **$157** (1 booking, $156.93 of spend) |

For scale: MRR is **$1,939** across 31 subscribers (`CHURN-PLAYBOOK.md`). This
channel spends **42% of all recurring revenue** and has produced one booked call.
That is the risk, stated plainly. It is also only $812, which is why the
recommendation below is *measure for a month*, not *cut it*.

> Note: `SENDING.md` shows "56 interested leads, $14.50 each" in one table.
> $812 ÷ 374 emails-per-lead gives ~60 and **$13.54**, which is the same figure
> that table uses two rows later. 60 / $13.54 is the consistent pair.

## The break-even, per offer

One number governs everything: **what share of interested leads turns into
money.** Everything upstream of it — reply rate, lead source, placement — is
already measured; this one is not.

Break-even is `$13.54 ÷ gross profit per win`:

| Offer | Gross profit per win | Break-even | = 1 win per |
|---|---|---|---|
| Subscription, 1 month of life | $63 | 21.5% | 4.7 interested leads |
| Subscription, 3 months | $188 | 7.2% | 14 |
| Subscription, nominal LTV (6.5% churn) | $962 | 1.4% | 71 |
| **Per-record project, $2,000** | **~$2,000** | **0.68%** | **148** |
| Per-record project, $5,000 | ~$5,000 | 0.27% | 369 |
| DFY meetings, *if* a meeting cost $50 | $1,500 (15 meetings) | 0.9% | 111 |
| **DFY meetings, at today's $157 a meeting** | **-$7 per meeting** | **never** | — |

Two of those rows deserve their own section.

### Why the subscription can never work here

`docs/outbound-angle.md` measured it: 14 of 30 subscribers made fewer than 20
lookups in their life, the power users ran one enormous list in one afternoon and
left, and "each new customer is worth roughly one month". The $962 nominal LTV
belongs to a retained subscriber; a cold-email-acquired one behaves like the
one-job cohort, so the honest row is $63-188 and the honest break-even is
**7-21% of interested leads becoming paying subscribers.** Only 25% of *replies*
are even interested. Nothing converts at that rate from cold email.

The project offer inverts it for free: the same person, the same list, the same
conversation — `steven@salesignition.com` ran 9,058 lookups on an $89 plan, which
is a $2,700 job at $0.30 a record. **The channel is not the problem with the
subscription; the price is.** Explee was never a subscription-acquisition
channel and the brief already knows it.

### Why DFY inverts, and this is the sharp finding

The done-for-you offer sells **meetings held at $150** (`docs/ai-sdr-offer.md`),
or **150 EUR flat** on the French page. Explee is also the machine that would
*deliver* those meetings. So the two numbers meet:

| Delivering 5 meetings/month for one client | Emails needed | Explee cost | Revenue | Margin |
|---|---|---|---|---|
| at the measured 7% interested→booked | ~26,000 | **$785** | $750 | **-$35** |
| at the 22% target in `BASELINE.md` | ~8,500 | $255 | $750 | +$495 (66%) |
| at 35% | ~5,300 | $160 | $750 | +$590 (79%) |

**At the rate measured today, the offer is sold at a loss before anyone's time is
counted**, and there is no time-free version of "we handle every reply and book
the meeting". The `$50 cost per call` target in `BASELINE.md` was set against a
general goal; the number that actually matters for this business is **$75 — half
the sale price** — because that is a 50% gross margin on the thing being sold.

This is also the strongest argument *for* keeping Explee running even if it never
closes a customer: at $812/month it is the cheapest possible proof of whether the
product being sold at $150 a meeting can be delivered at all. Right now the proof
says no, and that is worth knowing before the French landing page gets paid
traffic.

## The number nobody has, and the two priors that bracket it

Interested → won is unmeasured. The two data points available disagree by 10x:

| Prior | Rate | Cost per win at $13.54/interested |
|---|---|---|
| `docs/outbound-angle.md`: 571 interested, 2 closed (older Instantly-era list, different offer) | **0.35%** | **$3,869** |
| Today: 14 interested, 1 booked (7.1%) × an assumed 50% close | **3.5%** | **$387** |

At $387 a win the project offer returns 5x. At $3,869 it loses on a $2,000
project and barely clears a $5,000 one. **The entire verdict lives in that
spread, and one month of honest bookkeeping collapses it.** That is what
`recover.py`'s sheet and `baseline.py --won --revenue` are for.

## What is *not* worth arguing about

- **The lead source.** `SOURCES.md` already settles it: leads are 17% of the
  cost, Explee at ~$0.025 is the cheapest in the market, and Pharow has to clear
  2.17x to draw level. Park it.
- **Buying leads from a data vendor while selling data.** True, and worth ~$140 a
  month at most. Sourcing from our own engine is a dogfooding and credibility
  argument, not an economic one. Don't confuse the two.
- **Explee vs Instantly + our own mailboxes.** Worth ~$300/month of
  infrastructure (`SENDING.md`), which is real but small. The reason to care is
  **placement**, not price: 1.05% reply against a 3-8% benchmark, sending as
  "Brian Carter" from `usetidegrove.com`, and a prospect who wrote back to say it
  landed in spam. A placement fix that doubles reply rate is worth about $400 a
  month here and roughly halves cost per interested lead — more than every lead-
  source decision in this directory combined.

## What to do

1. **Keep it one more month, at unchanged spend, against the project offer only.**
   $812 to collapse a 10x uncertainty is a good trade.
2. **Do not sell DFY volume until a meeting costs under $75.** Today it is $157.
   The lever is interested→booked (worth 2-5x), not the lead source (17%).
3. **Record wins, not just calls.** Every month:
   `python3 baseline.py --project 30475 --booked N --showed N --won N --revenue N --save`.
   Cost per call was the old target; cost per *dollar of revenue* is the one that
   answers this file's question.
4. **Kill criterion, written down now so it is not re-argued later:** after two
   full months, if revenue attributable to the channel is under the spend
   ($1,624) — i.e. under roughly one $2,000 project — stop, and put the money
   into the placement fix or into the churned power users in
   `docs/outbound-angle.md`, who cost nothing to reach.
