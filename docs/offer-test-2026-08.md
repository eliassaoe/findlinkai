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

## Results, 27 Aug morning

Both batches drained. Per campaign, over the two days:

| campaign | sent | delivered | bounced | unsubs | bounce |
| --- | --- | --- | --- | --- | --- |
| Arm A | 190 | 185 | 5 | 0 | 2.6% |
| Round 2 | 188 | 180 | 7 | 0 | 3.7% |
| **Booked calls, combined** | **378** | **365** | **12** | **0** | **3.2%** |

**Zero unsubscribes across 378 emails.** The offer is not irritating anyone, which
is the one thing a per-call pitch to a dormant list could plausibly have done.

Cumulative across every send: **1,016 sent, 32 bounced, 3.15%**, 5 unsubscribes.

### The 8.8% "today" figure was an artifact

A naive per-day query showed 34 sent / 3 bounced on 27 Aug. Those three bounces
are **late arrivals from arm A's 26 Aug send**, attributed to the day they
resolved rather than the day they were sent. Today's 34 event-triggered emails
bounced zero. Always split bounces by `properties.$workflow_id`, not by day.

### Why 3.2% on a Google-gated cohort

Higher than the gate predicts. The likely reason is age, not fakes: the cohort
is drawn from 180 days of history, and `signup_google_clicked` proves the address
was real **at signup**, not that it still resolves now. People change jobs and
work addresses die. **The gate protects against fake addresses; it does not
protect against stale ones.** For any cohort older than a few months, expect a
floor of a few percent no matter how clean the gate is.

### Batch 2 is on hold, and the bounce rate is the weaker reason

Cumulative sits at 3.15%, just over the 3% gate this document set. That alone
argues for waiting.

The stronger reason: **there is no evidence yet that the email converts.** 417
eligible people remain and they are the last of them. Spending them on an
unproven email is the one move that cannot be undone — if it turns out the copy
needs work, that budget is gone. Wait for booking data, then send.

### There is no click measurement, by construction

The CTA points at `calendly.com`, which is off-site and not instrumented with
this project's PostHog. **No `$pageview` will ever fire for
`utm_campaign=offer_test_a_booked_calls` or `booked_calls_round2`** — the zero
result is expected, not a signal that nobody clicked.

The only place a booking appears is the Calendly account itself, tagged with
those UTMs. That is a manual check, and it is the only real read on whether the
offer works.

---

## 2026-08-29 — VIP to rich countries: one-off + continuous

Two things now exist in PostHog. **Neither is live yet** — both are drafts,
because enabling is an outward-facing send and needs an explicit go.

### The cohorts (fixed — they were broken)

| id | who | count |
| --- | --- | --- |
| 529662 | high-income country + activated + **business** domain + never mailed | **70** |
| 529664 | same but **consumer** domain (gmail/outlook/yahoo/…) | **194** |

Both were created earlier the same day and **silently failed to calculate**
(`errors_calculating: 1`, `last_error_message: null`, `count: null`). Cause: the
cohort query used

    NOT match(email, '(gmail|googlemail|...)\\.')

and that regex literal is **not valid HogQL** — the same query fails in
`execute-sql` with "HogQL parsing error". A static cohort whose query fails to
parse is created successfully and just stays empty. `workflows-blast-radius`
reported `affected: 0`, which is what caught it.

**Fix:** replaced the regex with a chain of `email LIKE '%gmail.%' OR …`.
Both recalculated within a minute and now report 70 and 194.

**Rule for next time: after creating any static cohort, check
`last_calculation IS NOT NULL` and `count > 0` before pointing a workflow at
it.** A batch workflow aimed at a failed cohort sends nothing and reports
nothing wrong.

High-income list used in both (24 codes):
`US GB FR DE NL CA AU CH SE NO DK FI IE BE AT LU SG JP NZ IL HK AE ES IT`

### 1. One-off batch — `01a04f33-7ebe-0000-de93-26822917a169`

"VIP one-off — high-income + business domain". Batch trigger on cohort 529662.
Blast radius confirmed: **70 people**. Tracking ON. Conversion goal
`checkout_payment_success`, `exit_on_conversion`. Masking `{person.id}` / 3y.
Batch triggers do NOT fire on enable — dispatch is a separate
`workflows-run-batch` call.

Cohort 529664 (194 consumer-domain) is the second wave, and should only go out
if 529662 produces something.

### 2. Continuous — `01a04f37-5d0c-0000-e7bc-c867ea489568`

"VIP continuous — friction trigger, high-income countries".

    event trigger  →  wait 1 day  →  VIP email  →  exit

Trigger: any of `credits_exhausted`, `credits_exhausted_modal_shown`,
`bulk_results_gated_shown`, `vip_page_viewed`, AND person is in one of the 24
countries, AND has an email.

Three deliberate choices:

- **Not on signup day.** Someone who chose self-serve five minutes ago is the
  worst possible moment to pitch done-for-you — the pitch argues against the
  decision they just made. Friction is the moment it makes sense.
- **`exit_on_conversion` beats the delay.** Anyone who buys during the 1-day
  wait leaves before the email is sent. A self-serve purchase is the right
  outcome and should not be talked out of.
- **No consumer-domain exclusion here** (unlike 529662). The friction signal is
  a far stronger qualifier than the domain, and a US solo founder on gmail
  hitting the credit wall is a real prospect.

Masking is `{person.id}` at 3 years, so **one email per person, ever**.

**Expected volume**, from the last 6 months of the same events in the same
countries: 19 / 14 / 15 / 41 distinct people per month — call it **15–40/month**.
Event triggers only fire on *future* events, so August's 41 do not get
backfilled; it builds from whenever it is enabled.

**Known gap:** this does not dedupe against the one-off. Someone in 529662 who
later hits the credit wall can get a second, differently-timed touch. Accepted —
the copy is different and weeks apart.

### Copy

Same offer, one contextual line changed for the triggered version:

> You are running enough volume now that finding the contacts is no longer the
> hard part. The hard part is everything after it: the copy, mailboxes that have
> to stay warm, and someone reading every reply once it is live.

Both end on **Book a strategic call** →
`calendly.com/hamoureliasse/offre-linkfinder-ai-clone`, tagged
`utm_campaign=vip_rich_business` (one-off) and `vip_friction_trigger`
(continuous) so the two are separable.

Test-run results on the continuous workflow: US + `credits_exhausted` → matches
and advances to the delay; IN + `credits_exhausted` → `skipped`, trigger did not
match; email step renders with the right recipient, unsubscribe URL and CTA.

### The bounce number to watch

Established pattern in this project: **event-triggered sends bounce at 0.9%;
batch sends to old dormant cohorts bounce at 2.6–6.5%.** The Google-auth gate
stops *fake* addresses, not *stale* ones.

The one-off is a batch to a dormant list, so budget **2–5 bounces on 70**. SES
puts an account under review at 5%. The continuous workflow is the safe shape —
it mails people who were active yesterday.

---

## 2026-08-30 — the upsell is now the strategy

Decision: **the email's only job is to book a strategic call. The VIP
done-for-you offer is sold by Eliasse on that call, never in the email.**
Everything below serves that.

### AEO / listicle — stopped, confirmed

Workflow 11 (`01a038b0-a39c`) is `archived`. Last send **25 Aug, 153 emails**;
archived 28 Aug; nothing sent since. Verified against
`$workflows_email_sent`, not against the workflow's status field alone.

### The two upsell campaigns — renamed and corrected

| was | now |
| --- | --- |
| OFFER TEST A — booked calls, priced per call | **UPSELL — VIP done-for-you, book a strategic call (arm A)** |
| BOOKED CALLS — round 2, batch 1 (200) | **UPSELL — VIP done-for-you, book a strategic call (round 2)** |

Both verified in live config (not from notes): `tracking_enabled: true`,
CTA → `calendly.com/hamoureliasse/offre-linkfinder-ai-clone`, button reads
**Book a strategic call**, no staged draft, status active.

**Their descriptions were stale and actively dangerous.** Arm A's said
*"tracking is off (engagement here is bot-flagged so a pixel buys nothing)"*,
*"no links in the body except unsubscribe"*, and *"primary metric is REPLIES
counted by hand"*. All three false. Round 2's said *"Tracking off"* and quoted
arm A as *"191 sent / 2 bounced / 1.0%"*.

That stale text is exactly what caused 378 emails to go out blind — the
"engagement is bot-flagged" claim was carried forward and never challenged,
when the AEO campaign sent 153 the same week with tracking on and pulled 71
openers. **Both descriptions are now rewritten with the real numbers and a
dated correction note.**

### Real numbers, both campaigns

| campaign | sent | openers | Calendly clicks | bounced | unsub |
| --- | --- | --- | --- | --- | --- |
| Upsell arm A | 190 | 0 | 0 | 5 (**2.6%**) | 0 |
| Upsell round 2 | 188 | 0 | 0 | 10 (**5.3%**) | 0 |

Both sent 26 Aug with tracking off, so **the zeros are unmeasured, not zero.**
Round 2's 5.3% is the worst in the account and sits on the SES review line —
gate any further dormant-cohort batch on that.

### Dashboard: VIP upsell — booked calls funnel (id 2048493)

Three tiles:

1. **Upsell email funnel** — sent → opened → Calendly click → bounce %, across
   all four VIP campaigns.
2. **In-app VIP doors** — where people meet the offer in-product.
3. **Calendly clicks per day** — the leading indicator.

**The measurement ceiling:** Calendly is off-site and uninstrumented. PostHog
can show the *click* and never the *booking*. Bookings and closes are read in
Calendly. Do not build a funnel that pretends otherwise — an earlier attempt
built a UTM pageview check that could never return a row.

### The in-app numbers that matter

    sales_call_intercept_shown        36 people
    sales_call_intercept_cta_clicked   5 people   -> 14%
    vip_card_clicked                   3 people
    vip_page_viewed                    1 person

**14% on the intercept is the best-converting surface in the product** — and it
is the one with no VIP door on it in production.

### Still blocking, unchanged

The live `linkfinderai.com/linkfinder-vip` page still reads
*"Managed CRM Enrichment & Automation"* and all 7 of its CTAs book
`compensated-interview-unlimited-leads-clone` — **a call where Eliasse pays the
prospect.** The email path dodges this (its CTA goes straight to the right
Calendly), but every in-app door lands on it.

The fix — page rewritten to booked calls, right Calendly, `n >= 25` banner fix,
bordered pricing card, VIP door in the intercept — is written and sitting
unmerged on `claude/b2b-sales-offers-research-1j90q9`.

---

## 2026-08-30 — one Calendly link for every call

**Rule: every call CTA anywhere points at
`https://calendly.com/hamoureliasse/linkfinder-ai`.** Product, marketing site,
workers, and every email campaign. Do not introduce a second booking link.

Three links were in use. All are retired:

| retired slug | was used | count |
| --- | --- | --- |
| `intro-call` | marketing-site CTAs and footers | 190 |
| `compensated-interview-unlimited-leads-clone` | app.html, account.html, crm-sync.html, the live VIP page, the support worker | 16 |
| `offre-linkfinder-ai-clone` | the four VIP/upsell email campaigns, linkfinder-vip.html | 7 |

**Why `compensated-interview…` had to go regardless.** It books a *compensated
research interview* — a call where Eliasse pays the prospect. It was on the
"clicked upgrade, didn't upgrade" surfaces, so the highest-intent people in the
product were being routed to a call that costs money instead of makes it.

### Repo — 209 links across 197 files

Rewritten with sed across every `.html`, `.js`, `.json`, `.py`, `.mjs`.
`docs/*.md` deliberately left alone: those are dated records of what was
configured at the time, and rewriting them would falsify the history. Four old
links survive there and should stay.

`tests/credit-wall.test.mjs` picked the new link up on its own — it reads the
constant out of `app.html` rather than hardcoding it, which is why the swap
needed no test edit.

**Pre-existing test failure, not caused by this:** `low_conversion is offered
credits to earn, never a discount` fails on `must name the G2 reward`. Verified
by stashing — 15 pass / 1 fail both before and after. Unrelated to Calendly;
still open.

### PostHog — 4 of 5 call campaigns needed the change

| workflow | action |
| --- | --- |
| UPSELL arm A `01a03f35` | patched, **published v8** |
| UPSELL round 2 `01a03f99` | patched, **published v5** |
| VIP one-off `01a04f33` | patched (draft, applied directly) |
| VIP continuous `01a04f37` | patched (draft, applied directly) |
| `5. Pricing seen, no payment — offer a call` `01a02878` | **already correct** — verified, not assumed |

Both publishes previewed clean first: `in_flight_runs: 0`, no deleted steps, no
schedule conflicts. utm_campaign values are unchanged
(`vip_offer`, `vip_offer_r2`, `vip_rich_business`, `vip_friction_trigger`) so
the dashboard tiles keep working across the swap.

**Not exhaustively verified:** the remaining workflows (1, 2, 3, 4, 6, 7, 7b, 8,
9, 10, offer test B, CRM audit follow-up) were not opened one by one. They are
transactional or product emails with no obvious call CTA, but that is a
judgement, not a check. If a stray booking link turns up, it will be in one of
those.
