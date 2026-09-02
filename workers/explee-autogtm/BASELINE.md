# The real numbers, 2 September 2026

Read off the AutoGTM dashboard for project `linkfinderai.com`. This replaces
every illustrative figure in the original plan — those were placeholders, these
are measured.

## Seven days

| | |
|---|---|
| Emails sent | 5,231 |
| Spend | $156.93 (at $0.03/email) |
| Replies | 55 — **1.05%** |
| Interested / hot | 14 — **25% of replies** |
| **Cost per interested lead** | **$11.21** |
| Emails per interested lead | 374 |

| Campaign | Sent | Reply | Hot | $/hot | Spend | Cap |
|---|---|---|---|---|---|---|
| High ticket linkfinder AI | 3,119 | 1.2% | 9 | $10.40 | $93.57 | $15 |
| high ticket offer linkfinder ai 2 | 2,114 | 0.9% | 5 | $12.68 | $63.42 | $15 |
| high tickets leads from instantly | warming up, 0 sent | — | — | — | — | — |

Autopilot is ON, so per-campaign budgets are agent-managed — `PATCH
…/campaigns/{id}/budget` returns 409 and so does `start` on anything Autopilot
owns. Turn it off to take manual control.

## The only number still missing, and it decides everything

Cost per call is `$156.93 ÷ (14 × the share of interested leads that book)`. That
share is not on the dashboard and nobody has written it down:

| If this share of the 14 books | Calls | Cost per call |
|---|---|---|
| 50% | 7.0 | **$22** |
| 35% | 4.9 | **$32** |
| **22%** | 3.1 | **$51** — the $50 target lands here |
| 20% | 2.8 | $56 |
| 10% | 1.4 | $112 |

**The $50 goal is a 22% interested-to-booked rate.** Nothing else in the plan
moves the number as hard: the lead data is $11.21 of it and the sending is the
rest, so even free leads leave you at $41. Getting from 10% to 35% booking halves
the cost per call twice over, and costs nothing.

Prior art in this repo, same failure: `docs/outbound-angle.md` records **571
leads marked interested and 0 meetings booked.** That is the number this baseline
exists to stop repeating.

## Three things wrong right now

**1. A hot lead has been waiting three days.** Jérôme BLAZY (datacorp.fr) replied
to *high ticket offer linkfinder ai 2*: "L'approche au résultat me plait. Open
pour un 1er échange de 15 min max." That is a yes to a call, sitting unanswered,
flagged *Needs reply* for 3 days. The dashboard's own banner says hot leads go
cold within 24 hours. One reply here is worth more than the entire lead-source
question — it is `recover.py`'s `send_info` case, live.

**2. The balance is -$46.32.** Every Explee API request needs a *positive*
balance, free-tier requests included — an org at or below zero gets a 402 on
everything. So none of the tooling in this directory can run until it is topped
up, and the daily budget is throttled meanwhile.

**3. Deliverability is a live complaint, not a theory.** Louise Condevaux
(foxpilot.io) replied: "il faudrait déjà apprendre à envoyer des mails qui ne
partent pas dans les [spams]". A 1.05% reply rate is low — good cold email runs
3-8% — and a prospect telling you the mail landed in spam is the cheapest
diagnostic you will ever get. Fix inbox placement before paying more per lead:
better leads in the spam folder reply at the same rate as worse ones.

## What this does to the Pharow question

It does not kill it, it reorders it. At $11.21 per interested lead, a Pharow lead
at ~EUR 0.18 against Explee's ~$0.025 has to clear the same 2.17x bar as before —
but the measured booking rate is now the variable that decides whether a call
costs $22 or $112, and it is worth between 2x and 5x. Run the free
`overlap` check on the Pharow trial 100, and answer Jérôme first.
