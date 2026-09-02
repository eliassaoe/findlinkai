# Building an AutoGTM competitor on unlimited-leads.net

## Verdict, added after the build plan below was written

**Do not build this as a standalone SaaS. Build it as a LinkFinder AI feature,
and point unlimited-leads.net at it as an acquisition asset.**

Two arguments, and the second one is the whole case.

### 1. Standalone, the wrapper has no defensibility and no distribution

The glue-only MVP is a UI over Instantly. So is the competition. A customer who
does the arithmetic finds that ~22,400 emails a month costs **$672 on AutoGTM at
$0.03** against roughly **$300 assembled themselves** — Instantly's plan plus
lead volume plus rented inboxes. We would be selling a 2.2x markup on not having
to assemble it, in a category where the assembly instructions are a blog post.

That markup is defensible only through distribution, and standalone we have
none. The buyers of cold-email tooling are, by definition, the most heavily
marketed-to people alive — they all run cold email. CAC in that category is the
entire game, `unlimited-leads.net` has "a little DR", and the SEO cold start is
months. Meanwhile every incumbent — Instantly, Smartlead, Lemlist, Apollo, Clay,
Explee — is already there with a brand.

### 2. As a LinkFinder feature, the same code stops being a commodity

Measured, `docs/dfy-activation-campaign.md`, 2026-08-31: **67 credit-pack buyers
have never run a single lookup, median balance 10,000 credits.** That doc's own
conclusion is the argument:

> they are someone who bought a tool to do a job and then did not do the job

The job was never "find an email". It is "get a meeting". We sell the noun and
stop at the verb — and sending is the verb. Those 67 accounts are holding roughly
**670,000 idle credits, about $13,400 already paid for**, against a feature they
would use tomorrow.

Everything the standalone version has to build, LinkFinder already has:

| Needed | Standalone | Inside LinkFinder |
|---|---|---|
| Users | 0, CAC unknown | **7,206**, 31 subscribers, 89 pack buyers |
| Auth, signup, account | build | exists |
| Metered prepaid billing | build Stripe + ledger | **the credit system, already live** |
| Lead data step | integrate + pay for it | it *is* the product |
| SEO distribution | cold start | large existing footprint |

And the pricing falls out for free. Packs are $25/1,000 and $200/10,000 — so
**1 credit = 1 email sent** prices sending at $0.020-0.025, landing exactly on
Explee's $0.03 while undercutting it, against a BYO-inbox COGS of ~$0.011. No new
billing system, no new pricing page, no new checkout. A dormant 10,000-credit
balance becomes a 10,000-email campaign.

This also turns the one differentiator we actually have into the headline:
**every competitor charges for data and sending separately; we would charge one
credit for both.** That sentence is only true because we own the data step, and
it is only sellable to people who already have credits.

### The one real risk of the feature path

Adding "send" to LinkFinder invites the spam segment into the core product, and
their chargebacks and complaints land on the business that pays the bills rather
than on a side project. Mitigation is a hard rule, not a setting: **bring-your-own
mailboxes only, inside LinkFinder, forever.** No shared pool in the main product.
The customer's domain, the customer's reputation, the customer's problem. If a
managed pool is ever worth selling, that is when a separate brand earns its
keep — not before.

### What unlimited-leads.net is for, then

Not a product. An acquisition asset: content and landing pages on the sending and
lead keywords, converting into the LinkFinder app. The DR gets used, nothing gets
split, and there is one login, one support queue and one thing to sell.

### What this changes about the build

It gets smaller again. No signup, no auth, no Stripe, no ledger, no pricing page —
all of it exists. What is left is a campaign wizard, an inbox tab, and the two
webhook handlers, debiting the credit balance that is already there. **Closer to
one week than four.**

---

*Everything below was written before this verdict, assuming a standalone product.
The architecture is unchanged and still correct — only where it is deployed and
who it is sold to have changed.*


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

## The glue-only MVP: own nothing, build the UI

The brief above assumes we build the loop. We do not have to. **Every subsystem
except the UI is an API somebody else already runs**, and the pay-per-send meter
— the one thing that looked like it needed real backend work — is a single
webhook.

### Confirmed, not assumed

Instantly's webhook event list, read off our own workspace on 2 Sept 2026:

    email_sent          <- this is the billing meter
    email_bounced       reply_received      lead_unsubscribed
    lead_interested     lead_not_interested lead_meeting_booked
    email_opened        email_link_clicked  campaign_completed
    account_error

`email_sent` fires once per email that actually goes out. Debit the customer's
balance on that event and pay-per-send is *done* — no send queue of ours, no
counting, no reconciliation. `lead_unsubscribed` and `email_bounced` keep the
compliance side honest, and `lead_interested` drives the hot-lead view.

### The stack

| Layer | Who runs it | What we write |
|---|---|---|
| Sending, warmup, rotation, throttling, sequencing, IMAP reply sync | **Instantly API** (or Smartlead) | nothing |
| Mailboxes | **the customer's own**, added by `POST /accounts` with their SMTP/IMAP | a connect form |
| Lead sourcing | LinkFinder AI / Apollo / Explee API | one call |
| Per-lead copy | Claude API | one prompt |
| Auth + database | Supabase | schema |
| Payments | Stripe Checkout, prepaid top-ups | one webhook |
| Hosting | Vercel or Cloudflare Pages | — |

We own no mailboxes, no domains, no IPs, no mail servers, no scheduler.

### The whole flow

1. Sign up -> Supabase auth, `balance = 0`.
2. Top up -> Stripe Checkout -> webhook credits `balance`.
3. Connect mailboxes -> our form -> Instantly `create_account` (SMTP/IMAP), every
   account tagged with the user id.
4. Describe the ICP -> lead API -> leads back.
5. Campaign brief -> Claude writes a 3-step sequence with variables.
6. `create_campaign` + `add_leads_to_campaign_or_list_bulk` + assign **only that
   user's accounts** + `activate_campaign`.
7. Instantly sends. Each `email_sent` webhook debits N credits. Balance hits
   zero -> `pause_campaign`.
8. `reply_received` / `lead_interested` populate the inbox; replies go back out
   through `reply_to_email`.

Five screens — signup, connect mailboxes, campaign wizard, dashboard, inbox —
and two workers: the Stripe webhook and the Instantly webhook. **About two weeks
for one person, and all of it is UI.**

### Three things that will bite, and they are not optional

**1. Instantly has no tenant concept, so multi-tenancy is entirely our bug to
make.** One workspace, one API key, and campaigns, accounts, lead lists and the
blocklist are all global inside it. Nothing at the vendor stops customer A's
campaign from sending through customer B's mailboxes — only our filtering does.
Prefix every object we create with the user id, never fetch without filtering by
it, and test that specifically. This is the highest-severity correctness risk in
the whole design and it lives in the part we write.

**2. Their plan limit becomes our ceiling and our COGS floor.** Measured on our
workspace: Growth, $47/mo, **1,000 active leads a month**, 222 used. The 25k-lead
addon reports `can_purchase: false — advanced_outreach_plan_required`. So the
third customer forces an upgrade, and from then on the vendor's per-lead price is
the floor under our credit price. Price with that in mind rather than discovering
it.

**3. Running other people's campaigns through one API key is reselling.** Ask
Instantly, in writing, whether the account tier permits it before launch — they
have an agency/white-label tier that exists for exactly this. If the answer is
no, Smartlead's white-label program is built for it and the flow above ports
unchanged. This is a ten-minute email that prevents the product being switched
off in month two.

And the one that does not go away by owning nothing: **the legal duty is still
ours.** Working unsubscribe in every message, a global permanent suppression
list, disclosure of the data source, a DPA with customers. The vendor sends the
mail; we are still the processor.

### What we must not build

Warmup, IP or inbox rotation, deliverability monitoring, IMAP sync, the sequence
scheduler, bounce parsing, spintax, tracking domains. All of it ships in the
sending API. Rebuilding any of it is the failure mode this section exists to
prevent.

## Open decisions

0. **Confirm reselling with the sending vendor before writing a line.** See the
   glue-only section — it is the one answer that can invalidate the design.
1. **BYO first, or wait and launch with a pool?** Recommendation above is BYO
   first, and the glue-only MVP only works this way — the customer's mailboxes
   are what makes owning nothing possible. The counter-argument is that "connect your mailbox" is a worse landing
   page than "add budget and go", and it costs us the one-click promise.
2. **$0.02 with leads included, or $0.03 to match?** $0.02 is the sharper wedge
   and still clears 45% on BYO; $0.03 leaves room to discount later.
3. **Who can sign up on day one?** Open self-serve on a shared pool is how this
   business dies in month three. Manual approval until the abuse controls exist.

## Status

Nothing is built. This document is the decision record, not a report on work
done. Phase 0 has not started.

The glue-only section is the current plan: assemble it from Instantly (or
Smartlead) + a lead API + Claude + Stripe + Supabase, and write only the UI and
two webhook handlers.
