# Outreach: complementary SaaS partnerships vs. agencies

**Date:** 2026-09-06 · **Sources:** this repo — `GROWTH-STRATEGY-REVIEW.md`,
`INTEGRATION-STRATEGY.md`, `docs/data-provider-angle.md`,
`docs/revenue-levers-2026-08.md`, `workers/explee-autogtm/BASELINE.md`.

The question: point outreach at **complementary SaaS** (co-marketing, API
integration, get embedded in their tool), or at **big agencies** (sell them the
tool, or white-label)?

## Verdict

**Agencies — 5-40 client lead-gen agencies and RevOps consultancies. Not "huge"
ones, and not white-label as the opening ask.**

Partnerships are not wrong, they are *later*. Their cost is 3-9 months of
calendar time you do not control; their payoff arrives in the one funnel that
does not work.

---

## The deciding argument: what each motion feeds

This is not a judgement about which audience is nicer. It is about where each
one delivers its return.

**A SaaS integration delivers self-serve signups.** That funnel converts signups
to paid at **1.2%** and loses **6.5% of subscribers per month**
(`GROWTH-STRATEGY-REVIEW.md`). Adding $2,000 MRR through it means ~32 net
subscribers at $62.50 ARPU, which needs **~2,700 signups** before churn is netted
out. No integration partner sends that.

And the bucket is documented as leaky at the structural level, not the
messaging level: **1,401 users have ever run an enrichment; 31 reached four
active days** (`docs/data-provider-angle.md`). ~2% retention.

**An agency deal bypasses the funnel entirely** — a call, an invoice, no
checkout. That matters more than it sounds, because checkout is measurably
broken: since 2026-07-01, 11 `checkout_error`, 11 `checkout_page_load_timeout`,
10 `checkout_redirect_stalled`, 13 `checkout_abandoned`, against 8 payments in
all of August (`docs/revenue-levers-2026-08.md`).

## Four supporting reasons

**1. Every account that retained is already an agency.** The business-domain
accounts in the retained set: `cambium.ai`, `salesignition.com`,
`theagilecoach.com`, `yieldergroup.com`, `kbscorporate.com`. This is not a guess
at an ICP — it is the only ICP the data confirms
(`docs/data-provider-angle.md` §4).

**2. There is no leverage for a partnership conversation yet.** Co-marketing is
a peer trade. Their BD asks how many users you send them; the honest answer at
31 subscribers ends the conversation. Agencies produce the customer count that
makes partnerships possible — the sequence only runs in that direction.

**3. Integration demand is already measured, and it is not partnership-shaped.**
Over 90 days: `api_key_copied` **157**, `hubspot_connected` **1**,
`integrations_hub_viewed` **1** (`INTEGRATION-STRATEGY.md`). Users reach for a
key by themselves; nobody browses an integrations hub. And the repo already
grades this work: integrations are *"distribution, not retention — prioritise
getting listed over building deeply."* **Getting listed on Zapier / Make / n8n
is a submission job, not an outreach motion.** It costs a week of calendar time
sitting in review queues and almost none of ours. Do that; do not staff a BD
function behind it.

**4. The agency motion can start this week; the partnership motion cannot.**
Explee AutoGTM is live and measured: 5,231 emails in 7 days, 55 replies,
14 interested, **$11.21 per interested lead**
(`workers/explee-autogtm/BASELINE.md`). Nine Instantly mailboxes are healthy
(warmup 100, 158/158 landed in inbox, 135/day capacity —
`workers/explee-autogtm/SENDING.md`). A partnership pipeline runs on someone
else's roadmap and returns nothing measurable for two quarters.

---

## Two corrections to the framing

### "Huge agency" is the wrong size

Large agencies bring procurement, security review, an incumbent Clay/Apollo
contract, and an SLA expectation. That last one cannot be honoured today:
`find_company_employees` still returns the actor's placeholder rows as people
and `find_leads_ai` was removed after 403ing for every user
(`docs/lead-search-bugs.md`, `docs/data-provider-angle.md`). Selling reliability
you do not have to a buyer who audits it is the one way this motion fails badly
rather than cheaply.

Target instead: lead-gen / outbound agencies with **5-40 clients**, and RevOps
consultancies running HubSpot/Salesforce for mid-market clients. They rebuild
lists every month by contract, and contact data is their cost of goods.

### White-label is the wrong opening ask

White-label removes your brand from the product, transfers first-line support
onto you, commits you to uptime, and compresses margin — in exchange for volume
you cannot yet forecast. Against a product whose `openapi.json` is still a
**2-path stub** (`INTEGRATION-STRATEGY.md`), that is taking on the obligations of
a platform before having one.

White-label is what an agency asks *you* for in month 3 because reselling you is
already working. Leading with it turns the easiest motion available into the
hardest one.

## What to sell an agency

**Not the $89 seat.** That is the usage shape that dies — one list, resolved in
one afternoon, never seen again (`docs/outbound-angle.md`).

Sell **account-list maintenance**, priced per record maintained per month
(`docs/data-provider-angle.md` §3.2). Their file decays ~2%/month because people
change jobs and nobody tells the CRM:

    5,000 records re-checked monthly x 10 credits = 50,000 credits/mo -> $500/mo
    25,000 records                                 = 250,000 credits  -> $1,500/mo

That number is naturally in the hundreds-to-thousands because it is priced per
record maintained, not per lookup performed. Open with a **free audit of their
data**, not a demo of ours — `crm-audit.html` already produces that artifact.

Do not open with credits, per-lookup pricing, or plan tiers. Those frame us as a
tool and cap the deal at $89.

The `Done For You` offer ($150/meeting held, 5/month minimum = $750/month floor,
`docs/ai-sdr-offer.md`) is the other shape that clears the same bar, and it is
already built and priced in-app.

## Work the warm list before the cold one

Cheaper and better-qualified than any sourced agency list, and already in the
database:

- **67 credit-pack buyers who never ran a lookup**, median balance 10,000
  credits — the $200 pack. They paid to solve a problem and then did not solve
  it, which is the strongest qualification for done-for-you there is. Send from
  a personal inbox, not Instantly — see `docs/dfy-activation-campaign.md` for
  the copy and the two constraints (only 12 of 67 have a first name; only 18 are
  confirmed in `auth.users`).
- **The churned power users.** `simon@institution.co.uk` ran 4,076 lookups in one
  afternoon in June and never returned; likewise `steven@salesignition.com`
  (9,058), `slater@guidance.so` (6,043), `richardwen97@protonmail.com` (4,999),
  `srivastava.atul@legistify.com` (3,912). Six calls from a list of six people
  who have already paid (`docs/outbound-angle.md`).

## The test, and the number that decides it

Do not commit six months to this on argument alone. The agency motion is
falsifiable in ~3 weeks for roughly $200 of sending:

1. Source 200-300 agencies at 5-40 clients. Send the free-audit opener that asks
   for a reply, not a click (`OUTBOUND-CRM-AUDIT.md`).
2. Send from your own domains as yourself — not Explee's `Brian Carter
   <b@usetidegrove.com>` personas, which have already drawn a spam complaint
   from a prospect (`workers/explee-autogtm/SENDING.md`).
3. **Measure replies and booked calls only.** PostHog flags 100% of email opens
   and clicks as bot traffic; opens and clicks measure nothing
   (`docs/revenue-levers-2026-08.md`).

Kill criterion: **fewer than 3 booked calls from 300 sends** means the offer, not
the channel, is wrong — go back to the audit artifact before spending more.

Prior art to not repeat: `docs/outbound-angle.md` records **571 leads marked
interested and 0 meetings booked.** Interested is not booked. The gap between
those two is the only number in this plan worth watching, and the whole reason
`workers/explee-autogtm/BASELINE.md` exists.

## What this does not say

- It does not say stop building integrations. It says **submit to the
  directories and stop there** until the ICP is proven — Zapier and Make review
  queues take weeks of calendar time and almost none of ours.
- It does not say partnerships never. It says they are a **month-6+ motion**,
  unlocked by having customers a partner cares about.
- It does not close the door on white-label. It moves it from the opening ask to
  the expansion ask, where the risk is carried by a relationship that already
  works.
