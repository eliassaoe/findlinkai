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

**First real data point: Jérôme BLAZY (datacorp.fr) booked.** That is 1 of the 14
interested leads. If it stops there the rate is 7% and a call costs $157; the
table below is what the rest of them are worth.

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

## Explee confirms the leak, and blesses the fix

Asked whether AutoGTM follows up on hot leads who never booked, Explee support:

> **No — once a lead replies, the automated sequence is over for them for good;
> there's no automatic win-back for someone who showed interest and then went
> quiet.** Re-opening that thread is manual today: Inbox → Needs reply, where each
> hot lead already has an AI-drafted reply waiting (and Auto-replies can send that
> one answer with your booking link).

And asked whether it could be automated over the API:

> Yes — that's buildable on the public API: poll `GET /autogtm/hot-leads` (with
> `?since=`) or `GET /autogtm/campaigns/{id}/inbox?tab=replied` to spot who went
> quiet, then send your nudge with `POST
> /autogtm/campaigns/{id}/inbox/{person_id}/reply`. It's poll-based (no webhooks).

That is exactly what `recover.py` does, endpoint for endpoint. The leak is not a
misconfiguration to hunt for — it is how the product works, by design, and the
vendor's own answer is "build it on the API".

**There is also a zero-code partial fix nobody has switched on: Auto-replies.**
The API exposes it at `PATCH /autogtm/projects/30475/autopilot` —
`auto_reply_enabled` and `auto_reply_delay_minutes`, plus project-level
`reply_instructions`. Turned on, every hot lead gets the AI-drafted answer within
minutes instead of whenever someone opens the inbox. Set `reply_instructions` to
**propose two specific times rather than a booking link** and it does most of what
`recover.py`'s `send_info` bucket does, today, for nothing.

What it does *not* do is the win-back: the lead who replied warmly, got an answer,
and then went silent. That one still needs the API, and it is where the 45
leaking replies a month actually sit.

## Three things wrong right now

**1. ~~A hot lead has been waiting three days.~~ Answered and booked.** Jérôme
BLAZY (datacorp.fr) replied to *high ticket offer linkfinder ai 2* with "Open
pour un 1er échange de 15 min max", waited three days, and has now taken the
call. Kept here because it is the shape of the whole problem: a yes that sat in
*Needs reply* while the dashboard warned that hot leads go cold in 24 hours. He
converted anyway; the next one might not, which is what the loop is for.

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
