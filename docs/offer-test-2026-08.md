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
