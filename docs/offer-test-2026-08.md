# Which offer do we actually sell? — the 26 Aug test

## What was killed, and why

**AEO / listicle placement (workflow 11) — archived 26 Aug.** Eliasse's call:
it is not what the customer wants. It was a batch broadcast to cohort 514666
(155 business signups) with four touches at day 0/3/7/12; archiving stops the
touches that had not gone out yet.

**CRM cleanup as a standalone offer — dropped.** It is a feature inside a SaaS,
not a high-ticket offer. It stays as a product surface (`crm-audit.html`,
`crm-sync.html`) and as a reason to be on a plan. It is not a thing to sell on
its own.

## The offer that ranks best is the one we cannot fully deliver

Booked meetings is the best-selling B2B offer and it is the one we cannot
staff. Market rates, for reference: pay-per-appointment runs $150–600 and
enterprise targets exceed $900; pay-per-lead $200–500. The buyer is the owner,
the pain is countable, and it is recurring — every condition an easy offer needs.

**The delivery gap is narrower than it looks.** Booked meetings decomposes into
four steps:

| Step | Who does it | Do we have it? |
| --- | --- | --- |
| 1. Find the right people | us | **yes** — this is the product |
| 2. Live mailboxes on warmed domains | us | **yes, when reconnected** (see below) |
| 3. Write and send the sequence | us | yes — labour, but bounded |
| 4. Take the call and close | **the client** | no, and we should not claim it |

`done-for-you-outbound.html` already says this out loud: *"Four steps. We do the
first three."* That page is the offer. The thing we sell is **replies landing in
the client's inbox**, not meetings on our calendar. Same buyer, same urgency,
none of the SDR headcount.

Our own outbound history is evidence for exactly this split: **571 leads marked
interested, 0 meetings booked, 2 closed.** We can generate interest. We cannot
convert interest into a meeting. So sell the half that works.

## The blocker is not the business model, it is OAuth

All 38 Instantly mailboxes are still `status: -1`, `autofix_failed: true`,
several reporting `EAUTH — can't create new access token for user`. That is
unchanged since the 22 Aug audit in `OUTBOUND-CRM-AUDIT.md`. Domains are
healthy: SPF/DKIM/DMARC pass and warmup scores sit at 90–100.

Capacity once reconnected: 9 senders x 20/day = 180/day, ~900 prospects/month.

**Nothing about the done-for-you offer is deliverable until those mailboxes
reconnect.** Do not sell it before then.

## The test

Two arms, same audience shape, same day, one email each.

| | Arm A | Arm B |
| --- | --- | --- |
| Offer | "I run the outbound, you take the calls" | "Tell me who you sell to, 25 free" |
| Question it answers | does the service offer get bite? | does the list have any pull? |
| Subject | `want me to just run it for you?` | `want 25 of them, free?` |
| Cohort | 519564 (**192**) | 519565 (**198**) |
| Workflow | `01a03f35-0fc3-0000-1354-6aeff240b506` | `01a03f35-b44e-0000-8b2d-850b950a5b18` |

### Audience

807 people qualify. Both arms drawn from it by `modulo(cityHash64(person_id), 2)`
and capped at 200 for round one. Eligibility:

- performed `signup_google_clicked` — the deliverability gate, per
  `docs/email-verified-is-wrong.md`; Google accounts are confirmed by construction
- performed `enrich_started` at least once — actually used the product
- no `checkout_payment_success` — still free
- never bounced, never unsubscribed
- **never received any workflow email** — so this does not stack on the CSV
  activation batch

The split is balanced on usage, which is what matters for comparing arms:

| arm | people | avg lookups | 5+ lookups |
| --- | --- | --- | --- |
| 0 (A) | 374 | 4.5 | 75 |
| 1 (B) | 433 | 4.3 | 87 |

### Measurement is replies, counted by hand

Tracking is off on both: no open pixel, no link rewriting, no links in the body
except unsubscribe. Engagement in this project is bot-flagged, so a pixel buys
nothing and dropping URL rewriting helps deliverability. It is the same pattern
the Instantly campaigns use — first touch asks for a reply, not a click.

So **the metric is replies to support@linkfinderai.com**, counted manually, split
by which subject line they are answering. Bounces and unsubscribes are automatic
per arm.

At ~195/arm a reply-rate difference is readable if it is large (2% vs 8%). It
will not resolve a small one. That is the honest ceiling of this list size.

### Send both arms on the same day

Otherwise the comparison is confounded by the day. Batch triggers do not fire on
enable — dispatch with `workflows-run-batch`.

### The caveat that limits what this proves

This list is our own product signups: people who already chose a self-serve tool.
They are not a clean proxy for the cold market where an agency offer is normally
sold. **A weak result for arm A does not kill the service offer** — it says this
particular audience self-selected for DIY. Test cold before concluding.

## Deliverability budget

| Date | Sent | Bounced | Rate |
| --- | --- | --- | --- |
| 2026-08-22 | 24 | 3 | **12.5%** |
| 2026-08-23 | 49 | 1 | 2.0% |
| 2026-08-24 | 69 | 1 | 1.4% |
| 2026-08-25 | 255 | 13 | **5.1%** |
| 2026-08-26 | 187 | 2 | 1.1% |

Cumulative 584 sent, 20 bounced = **3.4%**. SES puts a sender under review at 5%.
The two spikes were both on days with the widest audiences; today's 1.1% is what
the Google-auth gate looks like when it holds.

390 more emails is roughly one day of current volume. Watch the bounce rate on
the first arm before dispatching the second, and stop if it clears 3%.

---

# Update, same day: the offer became booked calls

Everything above describes an offer that sold **replies**, because at the time
the booking step could not be staffed. That constraint is gone: **delivery is
delegated to an external agency.** The agency handles infrastructure, sending
and reply management, so the meeting itself is deliverable and there is no
reason to sell the weaker half of it.

## What is actually being sold

> We build the list from our own data, run the campaign, handle every reply,
> and a qualified call lands on your calendar. **You pay per booked call — no
> retainer.**

**Keep list-building in-house.** Delegate infrastructure, sending and reply ops;
never the data. LinkFinder builds the list at near-zero marginal cost and it is
the one component a white-label agency cannot match. Give it away and this is a
reselling business on someone else's margin.

**Price per booked call, not per month.** Wholesale sits around $150–600 per
meeting. Buying per call and selling per call means no volume is ever promised
that the agency controls, and "nothing up front for volume you did not get" is
literally true — which is the strongest line in the email precisely because it
is not a claim.

**No price in the email.** The quote happens on the call, once the agency's
wholesale number is known. Get that number before the first booking lands.

## What shipped

| | Arm A | Arm B |
| --- | --- | --- |
| Offer | booked calls, priced per call | free 25-lead sample |
| Subject | `want me to book your calls?` | `want 25 of them, free?` |
| CTA | **Calendly booking link** | reply with title/industry/country |
| Cohort | 519564 (**192**) | 519565 (198) |
| Status | **dispatched 26 Aug 19:18 UTC** | draft, not sent |

Arm A email is four lines and one button. CTA is
`calendly.com/hamoureliasse/intro-call` with
`utm_campaign=offer_test_a_booked_calls`, so Calendly shows which campaign each
booking came from. Link tracking stays off, which means no URL rewriting and
the UTMs survive intact — attribution without a pixel.

`intro-call` is a stand-in. It is the URL used 189 times across the site but it
is not purpose-built for this offer; a dedicated event type would keep these
bookings separate from research interviews and let the confirmation page speak
to the offer. Accepted deliberately for a water-testing send.

## The arms are no longer symmetric

Arm A asks for a booked call. Arm B asks for a three-word reply. **A will show a
lower response rate than B by construction**, because the ask is far more
expensive — that is not evidence the offer is weaker. Compare them on what the
responses are worth, not on rate. If a clean rate comparison is ever wanted,
both arms need the same ask height.

## Do this before the first booking

Get the agency's per-meeting price. The email promises a number on the call and
it cannot be answered without theirs. Three or four booked calls in hand is also
leverage in that negotiation — demand in hand beats a hypothetical.

## Arm A result — dispatched 26 Aug 19:18 UTC

| | |
| --- | --- |
| Sent | **191** of 192 |
| Delivered | 186 |
| Bounced | **2 — 1.0%** |
| Unsubscribed | 0 |

Best bounce rate of any send to date, against a ledger of 12.5% / 2.0% / 1.4% /
5.1% / 1.1% on the preceding days. Cumulative moves from 584 sent / 20 bounced
(3.4%) to **775 / 22 = 2.8%**.

The Google-auth gate is doing exactly what `docs/email-verified-is-wrong.md`
predicted: a cohort built on `signup_google_clicked` is deliverable by
construction. The two spikes in the ledger were both sends with looser audiences.

Well under the 3% gate, so arm B is clear to dispatch on deliverability grounds.
Whether it *should* dispatch is a separate question — see below.

## Round 2, batch 1 — dispatched 26 Aug 20:25 UTC

Same email, same subject, `utm_campaign=booked_calls_round2` so its bookings are
distinguishable from arm A's in Calendly.

| | |
| --- | --- |
| Cohort | 519781 (200 built, **191** resolved) |
| Workflow | `01a03f99-e9ec-0000-1d89-d3f2931b0fcf` |
| Total sent on 26 Aug | **578** |
| Previous single-day max | 255 |

Split deliberately: 617 people remained eligible after arm A, and sending all of
them would have put the day near 1,000 — roughly 4× the previous daily maximum.
Volume ramp matters to receiving providers independently of bounce rate, so the
remaining **417 go out as batch 2 the following day**.

Arm B is not being sent. It sells a lead list, which is off-strategy: the offer
is now booked calls. Left as a draft rather than archived in case the ICP
research is wanted later.

## The business model behind the offer

Delivery runs through **Explee** (AutoGTM — their pre-warmed domains, their
sending, their reply handling and booking). Not disclosed to clients; the stack
is not something an agency owes anyone, and "we run it" describes a service that
is genuinely being orchestrated and stood behind.

| | |
| --- | --- |
| Explee cost per **booked** call | $15–30 |
| Show rate on AI-booked meetings | 60–70% |
| **True cost per *held* call** | **$23–46** |
| Sell price | **$100–150** |
| Gross margin per held call | **$54–127 (55–85%)** |

For comparison: cheapest AI SDR platform lands near $80–150/meeting, human
agencies $300–600 for a qualified held meeting. Explee is the only pay-as-you-go
option with no subscription, which is what makes it viable before there is a
customer.

**Bill on held, not booked.** Roughly a third of AI-booked meetings never show.
Billing on booked means invoicing for no-shows, which the client notices by month
two. Billing on held puts the risk where it can be managed — by tightening ICP.

**Write the qualification definition before the first client.** Seniority,
company size, showed up, stayed N minutes. "Qualified" is vendor-defined and
disputes are routine; we are the vendor now.

### Make "our own data" true

The email claims *"we build the list from our own data, not a reseller's."*
That is only accurate if the list comes out of LinkFinder rather than Explee's
database. **Build lists in LinkFinder and import them into Explee**, using Explee
purely for sending and booking. Costs nothing — it is our own engine — and it
makes the strongest line in the email a fact rather than a claim.

### Open questions that gate the model

1. **Does Explee's ToS permit reselling?** Could end the business on day one.
2. **Sub-accounts or workspaces?** Ten clients through one login is an
   operational and data-privacy problem.
3. **Volume ceiling.** 77–154k emails/month is a different customer than $30 PAYG.
4. **Shared or dedicated domains at that volume?** Their pre-warmed pool means
   client sender reputation is shared with every other Explee customer.

Also: sub-processors must be named in a DPA under GDPR. That is a legal
disclosure, separate from marketing, and any client with procurement will ask.
