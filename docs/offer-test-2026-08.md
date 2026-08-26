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
