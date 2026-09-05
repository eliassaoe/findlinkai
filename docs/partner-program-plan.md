# Two partner deals: white-label reselling, and Done For You overflow

**Date:** 2026-09-05 · **Sources:** Supabase `snxhsboboatjywgwdeds` (live),
`docs/partner-distribution.md`, `docs/outbound-close-motion.md`,
`docs/data-provider-angle.md`, `docs/ai-sdr-offer.md`.

Two proposals being planned:

- **A.** Email users, ask who likes the tool, put them on a call, sign them as
  white-label resellers on hard conditions.
- **B.** Ask agencies for the leads they cannot serve, pay **$200 per lead we
  convert** onto Done For You.

Both can work. **The sequencing has to be the opposite of the intuitive one**,
and the list is roughly 40× smaller than "all our agency customers" implies.

---

## 1. Size the list before designing the program

"Email all our agency customers" assumes a population. Measured today, business
domains only (free-mail excluded), against `enrichment_history`:

| filter | accounts |
| --- | ---: |
| business domain, 50+ lookups | **44** |
| business domain, 200+ lookups | **15** |
| business domain, 4+ active days | **10** |
| ever ran company expansion | 70 |
| 3+ active days **and** 100+ lookups | **6** |

Out of 7,318 accounts. And the 44 has a junk tail — four `example.com`, plus
`sdmjfgh.com`, `jctoto.com`, `14gmail.com`, `trialbuddy.eu.cc`.

**There is no agency customer base to email. There are about 15–18 real
candidates, and they can be named.** In rough order of how much they look like a
firm doing client work:

| domain | cohort | lookups | active days | types | expansion | last used |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| **cambium.ai** | pack | 1,185 | **22** | 5 | 1,141 | 2026-08-11 |
| **onlineresearchconsulting.com** | pack | 1,818 | 2 | 3 | 1 | 2026-08-13 |
| **endhunger.com** | sub | 4,827 | 4 | 1 | 4,827 | 2026-08-27 |
| **yieldergroup.com** | pack | 430 | 6 | 3 | 0 | 2026-06-09 |
| **impactic.de** | free | 115 | 5 | 3 | 0 | **2026-09-03** |
| **kbscorporate.com** | pack | **14,064** | 6 | 1 | 0 | 2026-06-26 |
| **salesignition.com** | sub | 9,058 | 4 | 1 | 0 | 2026-06-12 |
| **guidance.so** | sub | 6,043 | 2 | 1 | 0 | 2026-08-12 |
| **legistify.com** | sub | 3,912 | 2 | 1 | 0 | 2026-05-19 |
| **jdemand.com** | sub | 115 | 1 | 2 | 0 | 2026-05-19 |
| **iwantoverflow.com** | pack | 818 | 1 | 5 | 0 | 2026-07-28 |
| **topo.io** | pack | 193 | 1 | 1 | 0 | 2026-08-03 |
| **mobilunity.com** · **s-pro.io** · **devotedstudios.com** · **zimm.com** · **anacacia.com.au** | mixed | 51–1,016 | 1–2 | 2–5 | varies | Jun–Aug |

That is a **hand-written-email list, not a campaign.** Which is good news: it
needs no Instantly, no warmup, no deliverability risk, and it can go out today.

`cambium.ai` — 22 active days across 84 days, five enrichment types, 96% of its
volume in company expansion — is the single best-retained account in the
business and the closest thing to a working agency workflow you have. It is a
**pack buyer, not a subscriber.** It should be the first call, regardless of
which deal you choose.

## 2. The filter to use is behaviour, not satisfaction

"Email everyone and ask if they like the tool" has two problems:

- **Liking the tool does not predict being able to sell it.** The people who
  answer a satisfaction email are the enthusiastic, not the well-connected. The
  table above already identifies the ones doing client-shaped work, from
  behaviour, without asking anyone anything.
- **Emailing ~7,300 accounts is a deliverability event.** 4,616 have no
  `auth.users` row at all and `email_verified` is backfilled garbage
  (`docs/email-verified-is-wrong.md`). A broadcast to that list to find 15 people
  you can already name by query is a bad trade.

Send 15–18 personal emails. Not a campaign.

## 3. Deal A — white-label / reseller (the data deal)

**What they get:** your enrichment engine under their brand. Their clients never
see LinkFinder. They buy volume, mark it up, bill their client.

**Why this one works today:** it delivers **data**, which is your proven,
shipping product. No new capability is required. Auth is a single API key per
account (`openapi.json`), so the lightweight version needs **zero engineering** —
the agency calls the API server-side under their own brand from day one.

What does *not* exist: sub-accounts, per-client keys, a reseller tier, usage
splitting, or any `white-label` code path anywhere in the repo. So do not promise
a partner dashboard. Sell "our API, your brand, wholesale rate" and build
sub-accounts only when a partner's volume justifies it.

**Terms to open with:**

| | |
| --- | --- |
| Price | wholesale credits at 40–50% off list, minimum monthly commitment |
| Commitment | 3 months minimum, monthly minimum spend (this is the "hard condition") |
| Their margin | they set client pricing; the spread is theirs |
| Cap | **none** — the $500 lifetime affiliate cap (commit `c46acc2`) must not apply here or they stop after one client |
| Exclusivity | none, ever, at this stage |

**Why the economics beat everything else:** per `docs/data-provider-angle.md`,
one agency with 20 clients does 20 list builds a month, forever. The revenue
scales with *their* client count, not with your traffic. This is the only partner
shape that clears the $2–3k LTV bar from `docs/outbound-close-motion.md` without
you doing any delivery work.

## 4. Deal B — Done For You overflow referral

**The $200 is priced correctly.** DFY is $750/month at the five-meeting floor;
at 3–4 months that is $2,250–3,000. A $200 referral fee is **7–9% CAC**. That is
cheap, and for an agency a lead they cannot serve is worth $0, so it is found
money. The structure is sound.

Two things to change before offering it.

### Fix the adverse selection

"Leads you can't deliver" asks for an agency's **rejects** — and they are rejects
for a reason: no budget, unrealistic expectations, an ICP nobody can source, a
difficult buyer. You would be buying, at $200 each, the prospects a functioning
agency has already declined, and then failing to serve them for the same reasons
they did.

Ask for the two categories that are *not* adverse:

1. **Overflow at capacity** — good clients they are turning away because they are
   full. Pure timing, no quality signal.
2. **Out-of-ICP** — the lead is fine but wrong for them (they do US SaaS, the
   lead wants EU manufacturing; they do enterprise, this is SMB).

Say those two out loud in the ask. It changes what lands in your inbox entirely.

### Pay on retention, not on signature

$200 on signature means paying full CAC for a client who churns in month one —
and at a five-meeting floor, month one is your most expensive month to deliver.
Split it:

    $100 on the first invoice paid
    $100 after the third month is paid

Same $200, and it aligns the partner with sending clients who stay — which is
exactly the "hard condition" instinct, expressed as a payment schedule instead of
a contract clause.

## 5. The sequencing correction — run A before B

The intuitive order is B first (it is easier to ask for). It is the wrong order,
because the two deals have inverted delivery risk:

| | you must deliver | proven? | if it fails |
| --- | --- | --- | --- |
| **A — white-label data** | enrichment API | **yes — it is the product** | a credit refund |
| **B — DFY referral** | **booked meetings** | **no** | you burn the partner *and* the client they staked their name on |

Per `docs/outbound-close-motion.md`, your own cold outbound has produced **0
human replies from 44 sends**. Taking a referred client onto DFY today means
promising meetings you have not yet proven you can book, to someone an agency
personally vouched for. That is the most expensive possible place to discover the
service does not work yet.

**So:** open Deal A with the 15–18 now. Open Deal B with the same people *after*
DFY has booked meetings for one client — and the natural first DFY client is one
of these same accounts, sold directly.

## 6. The emails

Short, personal, one question, no deck. Send from the personal inbox.

### A — to the behaviour-qualified list (white-label)

> **Subject:** the way you're using LinkFinder
>
> You ran about {n} lookups on LinkFinder across {days} different days — that is
> not someone trying it out, that is someone doing this for clients.
>
> If that is right: we are setting up a small number of agencies to run our
> enrichment under their own brand. Wholesale rate, your pricing to your client,
> we never appear. There is a monthly minimum, so it only makes sense if you are
> already billing for this.
>
> Worth 15 minutes?
>
> Eliasse

### B — the overflow ask (send later, after DFY is proven)

> **Subject:** the clients you turn away
>
> Quick one. When you are at capacity, or a lead comes in outside your ICP —
> what happens to them right now?
>
> We run done-for-you outbound. If you send those our way we pay $200 per one
> that converts and sticks — half on their first invoice, half at month three.
> No exclusivity, nothing signed.
>
> Do you get enough of those for it to be worth setting up?
>
> Eliasse

## 7. Two things to fix before either goes out

1. **Attribution.** `referral_partners`, `referral_clicks`, `referral_attributions`
   and `referral_commissions` all exist and are **all empty**; `refered_by` is
   free text holding the literal string `'null'` 5,131 times. You cannot pay a
   partner $200 per converted lead if you cannot say which leads were theirs, and
   a partner who suspects miscrediting leaves and tells people.
2. **Booked calls are still invisible.** Calendly is off-site with nothing
   reporting back. Both deals are measured in calls; one of the two metrics does
   not exist yet.

Neither is a big job. Both gate the program.

## 8. Honest expectation

15–18 emails → maybe 5–8 replies → 2–4 calls → **1–2 partners**. One agency
partner doing 20 client list-builds a month is worth more than every referral the
program has produced in its life (12 referrers, $0.28 paid out). But it is one or
two relationships, worked by hand — not a channel that switches on.

The upside is that it costs a morning, risks nothing, and the list is already
written above.
