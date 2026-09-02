# Building an AutoGTM competitor on unlimited-leads.net

**The question:** can we build what Explee AutoGTM does, quickly, on the same
basis — the customer pays per email actually sent?

**The answer: yes, and the code is the easy part.** A product that does the same
loop is roughly four weeks of work. A product that *sends as well as they do* is
not a build at all — it is a sending pool with months of accumulated reputation,
and that is the only part of AutoGTM you cannot get fast.

The rest of this document is how to get around that, because there is a way, and
it changes the launch order.

## What AutoGTM actually is

Seven subsystems. Six are ordinary software.

| # | Subsystem | Hard? | Time |
|---|---|---|---|
| 1 | ICP description -> matched companies + verified emails | no — we sell this already | days |
| 2 | AI writes a per-lead sequence from a campaign brief | no — one prompt, one queue | days |
| 3 | **Sending: pre-warmed pool, prospect pinned to an inbox, throttling, rotation** | **yes — this is the business** | months |
| 4 | Unified inbox: IMAP reply sync, threading, AI classification, AI-drafted replies | medium | 1 week |
| 5 | Autopilot: budget across campaigns, pause losers, daily caps | no — it is a scheduler with a rule set | days |
| 6 | Metered prepaid billing: balance, per-send debit, spend caps, top-up | no | 2-3 days |
| 7 | **Abuse, suppression, unsubscribe, bounce handling, GDPR** | **yes — this is what kills you** | ongoing |

Items 1, 2, 4, 5, 6 are a normal CRUD app plus a queue plus an LLM call. Nothing
in there is novel and nothing in there is a moat. Explee's moat is 3 and their
discipline on 7.

## The three ways to send, and which to pick

| | What it is | COGS/email | Reputation risk | Time to live |
|---|---|---|---|---|
| **A. BYO inbox** | Customer connects their own Google / M365 / IMAP | ~$0 | **theirs, not ours** | days |
| **B. Rented managed pool** | Zapmail / Mailforge provision domains + mailboxes by API, we resell | ~$0.005 | ours, shared | weeks |
| **C. Own mail servers** | Postal / Mailcow on dedicated IPs, our own warmup network | ~$0.002 | ours, total | months |
| D. Transactional ESP | SES, Postmark, Resend | — | — | **never** |

**D is not an option.** Every transactional ESP forbids cold outreach in its AUP;
SES will terminate the account. Rule it out now rather than after the ban.

**Launch on A, sell B as the upgrade, never do C.** This is the whole
sequencing argument:

- A has no COGS, no warmup wait, and no shared-reputation blast radius. A
  customer who burns their own domain burns their own domain.
- A is live in days, so pay-per-send gets tested against real money before any
  inbox is bought.
- B is then a pure margin upsell to the customers A has already proven — and by
  the time it ships, the abuse controls in item 7 exist, which is the only safe
  order to build them in.
- Explee has A "coming soon" and has had it there a while. Shipping A *first* is
  the one place a new entrant is straightforwardly ahead.

The cost of choosing A first is that we cannot say "leads and inboxes included,
just add budget" on day one. That is a positioning cost, not a product one.

## The economics of $0.03 an email

Explee charges $0.03 flat, and separately about $0.025 a lead. Ours, on the
rented pool (option B), with leads and AI copy **included**:

| Line | Per email |
|---|---|
| Mailbox rent (~$3.25/mo, 20 sends/day) | $0.0054 |
| Burn + replacement, ~10% | $0.0006 |
| Lead data at ~$0.02/lead, 3 emails per lead | $0.0067 |
| AI copy (small model, per-lead sequence) | $0.0030 |
| Reply sync, storage, infra | $0.0010 |
| **COGS** | **~$0.017** |
| **Price** | **$0.030** |
| **Gross margin** | **~43%** |

On BYO inbox (option A) the first two lines vanish: COGS ~$0.011, margin ~63% —
or price it at $0.02 and keep 45% while undercutting Explee by a third.

**Be clear-eyed about what that means.** Pay-per-send is not a 90%-margin SaaS.
It is a marked-up commodity with software wrapped around it, and gross margin
lands between 40% and 65%. It is a real business; it is not a software business,
and the pricing page should not be built as if support and failed sends are free.

The arithmetic that matters to a buyer, from our own measured baseline: 374
emails per interested lead. At $0.03 that is $11.21 of sending plus $2.33 of
data. **Include the data and price at $0.02, and the same interested lead costs
$7.48 instead of $13.54 — 45% cheaper, on identical performance.** That is the
offer. Not better AI, not a nicer inbox: the same result for half.

## What actually kills this, in order

1. **One customer torching a shared pool.** The moment strangers send through
   our mailboxes, one spammer's complaint rate burns every domain in the
   rotation, for everyone. Mitigation is not technical elegance, it is policy:
   manual approval of every account's first campaign, hard bounce-rate and
   complaint kill switches that pause automatically, per-account domain
   isolation for anyone above a volume threshold, and Google Postmaster
   monitoring. Option A defers this problem entirely — which is most of why it
   goes first.
2. **Deliverability is an operating discipline, not a feature.** Reputation
   accrues over months and decays in days. Domains must be bought ahead, warmed
   continuously, monitored, and replaced when they burn. There is no version of
   this that is done and then stays done.
3. **GDPR, and it is not optional here.** The measured pipeline is mailing French
   companies. B2B cold email in the EU runs on legitimate interest, and it
   requires a working opt-out in every message, disclosure of where the data came
   from, and honouring erasure requests. We become a processor for our
   customers' sending, which means a DPA, a suppression list that is global and
   permanent, and a real unsubscribe path — built in week one, not retrofitted.
4. **Prepaid balance abuse.** Metered billing with a positive-balance gate
   (exactly the 402 behaviour Explee has) plus a per-day spend cap. Charge the
   balance at *send* time, not at queue time.

## Build order

**Phase 0 — one week. Prove the loop on our own sending, for ourselves.**
Campaign brief -> lead pull -> AI sequence -> queue -> send through inboxes we
already control -> IMAP reply sync -> replies classified. No signup, no billing,
no UI beyond a table. If this does not beat the 1.05% reply rate we already
measure, nothing downstream matters.

**Phase 1 — weeks 2-3. Make it a product on BYO inboxes.**
Signup, OAuth mailbox connect (Google + Microsoft) and IMAP/SMTP, prepaid balance
with per-send debit, spend caps, suppression list, unsubscribe footer, bounce
handling, the inbox UI. This is the sellable MVP and it is the pay-per-send test.

**Phase 2 — weeks 4-6. Autopilot and the inbox that closes.**
Budget allocation across campaigns, auto-pause on bad metrics, AI-drafted
replies, auto-reply with two proposed times. Explee's own gap is documented: once
a lead replies their sequence ends for good and there is no win-back. **Build the
win-back in from the start** — it is the single feature where we are not copying
them, and our own baseline says it is where the money leaks.

**Phase 3 — month 2-3, only if Phase 1 sells.** Managed pool: automated domain
and mailbox provisioning through a reseller API, pool health monitoring, rotation,
KYC and abuse controls. This is where the margin is and where the risk is.

## Positioning on unlimited-leads.net

The domain says leads. The product sells sending. Reconcile it by making the
leads free and charging only for what goes out — which is what the economics
above already recommend and what the name already promises:

> **Unlimited leads. Pay only for the emails you send.**

Explee cannot answer that without giving up the $0.025 a lead they resell. We can,
because we generate the data instead of buying it.

## Open decisions

1. **BYO first, or wait and launch with a pool?** Recommendation above is BYO
   first. The counter-argument is that "connect your mailbox" is a worse landing
   page than "add budget and go", and it costs us the one-click promise.
2. **$0.02 with leads included, or $0.03 to match?** $0.02 is the sharper wedge
   and still clears 45% on BYO; $0.03 leaves room to discount later.
3. **Who can sign up on day one?** Open self-serve on a shared pool is how this
   business dies in month three. Manual approval until the abuse controls exist.

## Status

Nothing is built. This document is the decision record, not a report on work
done. Phase 0 has not started.
