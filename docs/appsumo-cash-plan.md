# Getting $20k–50k into your pocket — the arithmetic and the one-month plan

**Date:** 2026-09-05 · Model: `scripts/ltd-pocket.py`, `scripts/ltd-scenarios.py`
Reads on from `docs/appsumo-launch-spec.md`. That file is *how to launch*. This
one is *how much you actually keep, and what makes the difference*.

---

## 1. Two corrections before the numbers

### "In my pocket" is four deductions below gross

    gross  →  AppSumo's share  →  refunds  →  data COGS  →  tax  →  pocket

A $100,000 launch is **$20,612** in your pocket at a 30% seller share, and
**$49,112** at 70%. Same launch. That gap is the whole story of this document.

### The cash does not arrive next month

AppSumo holds payout until the 60-day refund window has closed. Launch in October
and the money lands around **December–January**, not November. If the $20–50k is
earmarked for something with a date on it, plan against that timing, not the
launch date. Nothing here is a reason not to launch — it is a reason not to
commit the money before it exists.

---

## 2. The single most important number, and you do not have it

**The seller share swings the required volume by 2.4×.**

Gross needed to put a given amount in your pocket:

| Target in pocket | at 30% share | at 50% | at 70% |
| --- | --- | --- | --- |
| **$20,000** | $97,029 | $57,369 | $40,723 |
| $35,000 | $169,802 | $100,395 | $71,265 |
| **$50,000** | $242,574 | $143,421 | $101,808 |

In units, at a $118 AOV — SendPilot did **1,219 units in 13 days**, which is a
very good launch:

| Target | at 30% | at 50% | at 70% |
| --- | --- | --- | --- |
| $20,000 | 822 (0.7× SendPilot) | 486 (0.4×) | 345 (0.3×) |
| $50,000 | **2,056 (1.7× SendPilot)** | 1,215 (1.0×) | 863 (0.7×) |

**Find out your actual share before you do anything else on this list.** It is
one conversation with your account manager and it decides whether $50k is a
stretch goal or a fantasy.

Specifically: **ask what Select and Launch Pad each pay.** The two listing types
differ on share and on how much AppSumo markets you. Conventional wisdom is that
Select buys distribution with a smaller share — but SendPilot ran **Launch Pad,
was never vetted, and still ranked #1 across every list on the homepage within
five days.** If Launch Pad pays materially better and can still get featured,
that one data point is worth more than everything else in this file. Verify it;
do not take it from me, and do not take it from one YouTube video either.

---

## 3. What you actually land, honestly

Four scenarios. Cash in pocket, after AppSumo's share, 5% refunds, data COGS at
$0.002/credit, and 25% tax:

| Scenario | Units | Gross | **30%** | **50%** | **70%** |
| --- | --- | --- | --- | --- | --- |
| **No featuring** — own push only | 140 | $16,520 | $3,405 | $5,759 | $8,113 |
| **Featured**, own push = 20% of total (SendPilot's ratio) | 475 | $56,050 | $11,553 | $19,540 | $27,527 |
| **Strong launch**, own push = 12% | 790 | $93,220 | $19,215 | $32,499 | $45,782 |
| **SendPilot-equivalent units** | 1,219 | $143,842 | $29,649 | $50,147 | $70,644 |

Read the row you think is realistic, then the column for your real share.

**The blunt version:**

- **At a 30% share, your target is barely reachable.** You would need a
  SendPilot-equivalent launch to clear $29k, and $50k is out of range at any
  plausible volume.
- **At 50–70%, $20–50k is a realistic band** on a strong-but-not-exceptional
  launch.
- **Without featuring, every column fails.** $3–8k. That is the real downside
  case and it is entirely avoidable — see §4.

The difference between row 1 and row 3 is not luck. It is reviews in week one.

---

## 4. The four levers, in order of what they are worth

### Lever 1 — Get the share right · worth up to 2.4× · costs one conversation
§2. Do this first. Everything else is optimising a number this one multiplies.

### Lever 2 — The day-one push · worth the difference between row 1 and row 3

This is the lever nobody else has and the one the SendPilot founder says most
founders skip:

> *"You don't make the first push yourself. You just expect AppSumo to market you
> and do everything for you."*

Featuring is algorithmic and it responds to early sales and reviews. **Your own
audience is what buys the first 100 units, and the first 100 units are what buy
the featuring that delivers the other 700.**

What you actually have:

| Asset | Size | Realistic yield |
| --- | --- | --- |
| Accounts confirmed in `auth.users` (the only trustworthy signal — `docs/email-verified-is-wrong.md`) | **1,955** | 38–77 codes at 2–4% |
| minus current subscribers — do not cannibalise them | −31 | — |
| Site traffic over a 2-week launch, banner on every page | ~3,700 visitors | 37–56 codes at 1–1.5% |
| **Total own push** | | **75–115 codes** |

Warmest segments inside that list, in order — all already profiled in `docs/`:

1. **1,319 users who ran an enrichment and never uploaded a CSV.** Bulk is the
   behaviour that predicts payment (8.3% vs ~1%).
2. **114 who integrated (API/MCP/webhook/CRM) and never paid.** They wired you
   into their stack already.
3. **67 credit-pack buyers who never ran a lookup.** They have proven they pay.

**Do not email the 4,616 unconfirmed accounts.** Per
`docs/email-verified-is-wrong.md` they are largely unreachable, and burning your
domain reputation in launch week is the worst possible time.

### Lever 3 — Support speed · this is what converts lever 2 into lever 3's volume

Covered in `docs/appsumo-launch-spec.md` §5.5. Fast support → 5-star reviews →
featuring → 80% of revenue. SendPilot held **3min19s across nights and
weekends**. Deploy `support-worker/` before launch — it is the only thing that
makes that reachable solo. **This is not customer service during the launch. It
is the launch.**

### Lever 4 — AOV · worth ~40%

$83 (two tiers) → **$118** (three tiers, T3 loaded with non-COGS extras). Already
specced in `docs/appsumo-launch-spec.md` §5.5. SendPilot ran $131, so $118 is not
optimistic.

---

## 5. The one-month plan

**Submit the AppSumo form this week, before anything is ready.** Vetting and
listing prep take real calendar time you do not control, and it runs in parallel
with the build. That single decision is what makes a one-month timeline possible
at all.

### Week 1 — the two things that gate everything
- **Submit to AppSumo. Ask about share and about Select vs Launch Pad.** (Lever 1)
- **Get COGS per credit from the supplier invoice.** Still the open gate-1 item
  from `docs/appsumo-decision.md`; every number in this file assumes $0.002.
- Close the checkout leak — 35 of 42 plan selections never reach a payment page.
  The upsell has nowhere to land without it.
- Deploy `support-worker/` and auto top-up (`workers/auto-topup-charge/`, built,
  correctly priced, **never deployed**).

### Week 2 — the guards that cannot slip
- `source='appsumo'` column + the monthly non-rollover reset cron (G1, G7).
  Nothing like this exists yet; it is the whole safety mechanism.
- Phone blocked **server-side**; reactions capped; the 0.5 vs 1.0 employees price
  reconciled (G2, G3, G4).
- Fix the `find_company_employees` placeholder bug (G10). A data product that
  returns `⚠️ No Leads found` as a person cannot go in front of a review-driven
  audience.
- Fix the `auto-topup-settings` token leak (G8).

### Week 3 — the listing and the push
- Listing page: copy, screenshots, demo video. **SendPilot converted at 4.91%** —
  the listing is a conversion surface, not a form to fill in.
- Audit the redeem worker for single-use, stacking, revoke-on-refund (G9).
- Write the day-one email sequence to the 1,924, segmented by the three warm
  groups in lever 2. Build the site-wide launch banner.
- Turn PostHog engagement events ON — it does not backfill.

### Week 4 — launch, then do nothing but support
- Day 0: email the list, banner live, post founder-led on LinkedIn.
- Days 1–5: **the featuring window.** Respond to everything within minutes.
  Resolve, then ask for the review by hand, in the thread.
- Do not start anything else for two weeks.

---

## 6. What kills it

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| **No featuring** | $3–8k instead of $20–50k | Lever 2 + lever 3, both in week 4 |
| Launching before the guards are done | Featuring window spent on bug reports; a permanent 3-star page | The launch date is the date the guards are done |
| A 30% share you did not check | Target unreachable, discovered too late | Lever 1, week 1 |
| Refunds above 5% | Straight off the top | Support speed; SendPilot ran 3.5% |
| COGS above $0.004 | Not fatal — 86–93% still kept under the monthly cap | The cap in §3 of the launch spec is what makes this true |
| Spending the money before it arrives | — | §1: cash lands ~month 3–4 |

**The single biggest risk is not financial.** It is spending the five-day
featuring window fixing things that should have been fixed in weeks 1–3. That
window does not reopen.

---

## 6.5 · Working capital — the COGS lands before the revenue

The real cash-flow question, and the answer is better than it looks.

**Consumption is front-loaded into exactly the window AppSumo withholds payment.**
A code's first month is **41%** of its lifetime credits and month two another
**16%** — so **58% of all data cost lands in the first two months**, while the
payout waits behind the 60-day refund window.

### What you actually have to float

Cash out on data before AppSumo pays anything:

| Codes | COGS $0.001 | $0.002 | $0.004 | $0.008 |
| --- | --- | --- | --- | --- |
| 475 | $164 | $328 | $657 | $1,314 |
| **790** | $273 | **$546** | $1,092 | $2,185 |
| 1,219 | $421 | $843 | $1,686 | $3,371 |
| 2,000 | $691 | $1,383 | $2,765 | $5,531 |

**Hundreds to a few thousand dollars, not tens of thousands.** On the strong-launch
scenario at a mid COGS estimate it is about **$550**.

### And money does come in during the hold

Auto top-ups and subscription upgrades are charged through Dodo and land in your
account **immediately** — AppSumo holds none of it:

| Codes | top-up 3% / sub 1% | top-up 5% / sub 2% |
| --- | --- | --- |
| 475 | $822 | $1,525 |
| **790** | **$1,367** | **$2,536** |
| 1,219 | $2,109 | $3,913 |

At 790 codes you are taking **$1,367–2,536** in direct revenue against **~$546**
of data cost. **Cash-positive through the hold window**, before AppSumo pays a
cent.

That only works if `workers/auto-topup-charge/` is deployed. It is built,
correctly priced, and **has never been deployed**. It is already item 4 in the
launch order; this is the second, independent reason it belongs there: **it is
the only launch-period revenue that is not held for 60 days.**

### This is the monthly cap paying for itself again

A one-time stockpile would put the same customers' entire lifetime consumption
into these two months. At a 50,000-credit stockpile and $0.004/credit that is
**~$14,000 of data cost inside the refund window**, against a payout that has not
arrived and refunds that have not settled. The monthly non-rollover cap does not
only protect margin — **it converts a lump working-capital risk into a small
monthly one.** That matters more when you are waiting on a marketplace payout
than it does on the P&L.

### Three things to do about it

1. **Ask your account manager about payout timing, and whether a partial or
   milestone payout is possible.** You have the relationship now. Worst case they
   say no and you have lost nothing.
2. **Deploy auto top-up before launch.** §above.
3. **Get the COGS number.** The spread between $0.001 and $0.008 is the spread
   between $273 and $2,185. It is still the open gate-1 item and it is now
   blocking a cash-flow decision as well as a pricing one.

**Do not commit the $20–50k before it arrives.** Float requirement is small; the
mistake that costs real money is spending the payout on the strength of a launch
dashboard while refunds are still open.

---

## 6.8 · Target revised to $10k — 2026-09-05

Elias: *"if I end up with 10k in my pocket I am happy with the launch."*
That is now the operating target, and it changes what to optimise for.

### $10k is hit in every scenario except one

| Scenario | Codes | 30% share | 50% | 70% |
| --- | --- | --- | --- | --- |
| **No featuring** | 140 | $3,405 | $5,759 | $8,113 |
| **Featured** (SendPilot ratio) | 475 | **$11,553** | **$19,540** | **$27,527** |
| Strong launch | 790 | $19,215 | $32,499 | $45,782 |

Units needed for $10k: **411** at a 30% share, **243** at 50%, **173** at 70% —
against SendPilot's 1,219.

**Two consequences, and they matter more than the target change itself:**

1. **The share stops being decisive.** At $50k it was the difference between
   possible and impossible. At $10k every share clears it, provided you get
   featured. Still worth knowing — it is free to ask — but it is no longer the
   thing the launch hangs on.
2. **Your own audience nearly covers it alone.** The day-one push is 75–115
   codes (§4, lever 2). At a 70% share the target is 173. **You are 50–65% of
   the way to $10k before AppSumo sends a single visitor.** That is the whole
   risk profile changing shape.

**The only failure case left is not getting featured.** Everything that matters
now runs through that one gate: the day-one push, and support speed in week one.

### So optimise for MRR, not units

If $10k is enough cash, the marginal code is worth less than the marginal
subscriber. What the same launch is worth recurring:

| Codes | at 3%/2% upsell | at 5%/3% |
| --- | --- | --- |
| 300 | $478/mo · $5,738/yr | $761/mo · $9,137/yr |
| **475** | **$757/mo · $9,086/yr** | **$1,206/mo · $14,467/yr** |
| 790 | $1,259/mo · $15,111/yr | $2,005/mo · $24,060/yr |

**475 codes converted well beats 790 converted badly** — $14,467/yr against
$15,111/yr, from 40% fewer customers, 40% less support load and 40% less data
cost. At a $10k cash target that trade is obviously right, and it was not
obvious at $50k.

Practically:

- **Tier 3 is now optional.** It existed to lift AOV from $83 to $118, which
  mattered when volume was the constraint. Ship it if it is easy; drop it if
  week 3 is tight and seats are the thing holding it up.
- **Serve a smaller cohort better.** Fewer customers at the same effort is a
  higher review rate and a higher upsell rate — the two numbers that actually
  decide both the featuring and the MRR.
- **Report the two upsell rates weekly.** They are the scoreboard now, not units
  sold.

### What does NOT relax

**Every guard in `docs/appsumo-launch-spec.md` §4 stays.** They are downside
protection, not upside optimisation — a $10k launch with a permanent 3-star page
and a data product that returns `⚠️ No Leads found` as a person is still a bad
outcome, and a lower cash target buys no slack there. If anything the guards
matter proportionally more: there is less margin to absorb a bad week.

The launch date is still the date the guards are done.

---

## 7. The honest bottom line

**Target as of 2026-09-05 is $10k** (§6.8), which every featured scenario clears
at any share. **$20–25k is the stretch** if the share is 50%+ and you run levers
2 and 3 properly.

**$50k requires either a 70% share or a SendPilot-equivalent launch** — 1,219+
units. Plan for $20–25k, build so that $50k is possible, and treat anything above
as upside rather than as the number you have already spent.

And keep the second number in view: **1,000 codes converting at 3%/2% is ~$1,600
of new MRR**, which is roughly a doubling of the business. The cash is the
impulse. The subscribers are what the cash was for.
