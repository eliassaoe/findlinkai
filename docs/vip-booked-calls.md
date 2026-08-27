# LinkFinder VIP — rewritten as the booked-calls offer, 27 Aug

## Why it had produced nothing

Not an offer problem. Three separate reasons, all mechanical.

### 1. The page sold a dead offer

`linkfinder-vip.html` was *"Your CRM, enriched and automated"* — CRM enrichment,
data hygiene, "Book Your Free CRM Audit". That is the offer already ruled out as
a feature rather than a product. Nothing on the page mentioned booked calls.

Worse, **all six CTAs pointed at
`calendly.com/hamoureliasse/compensated-interview-unlimited-leads-clone`** — the
*paid research interview*. Anyone who clicked "Book Your Free CRM Audit" was
booking a compensated user interview.

### 2. Almost nobody could find it

Ninety days of traffic:

| event | events | people |
| --- | --- | --- |
| `vip_page_viewed` | 3 | **1** |
| `vip_card_clicked` | 8 | 3 |
| `vip_cta_clicked` | 4 | 1 |

**One person reached the page in three months.** Two entry points, both broken:

- **A 12px grey footnote** in the pricing modal, sitting below two other grey
  footnotes.
- **A usage banner gated on `n === 25 && isExistingSubscriber`.** Exact equality
  on the enrichment count — but a bulk CSV run increments by more than one, so a
  user going 24 → 41 skips the trigger permanently. And `isExistingSubscriber`
  narrowed it to ~30 accounts. Between them the banner was close to unreachable.

### 3. No campaign was ever running

Instantly campaign states: **"Done-for-you outbound — B2B SaaS (G2-sourced)" is a
draft.** So is "CA B2B SaaS - Lead Gen Guarantee Offer". The only *active*
campaign is "email marketing PAID credits USED", a product email.

And all 38 mailboxes remain `status: -1` / `autofix_failed: true`, unchanged
since the 22 Aug audit. Even activated, the campaign would send nothing.

## What changed

**`linkfinder-vip.html` rewritten end to end** for the booked-calls offer:
qualified calls into the client's calendar, priced per call that actually
happens, no retainer. All CTAs now point at `intro-call` with
`utm_campaign=booked_calls`. Title, meta description and JSON-LD updated. The
form now qualifies on **average deal size** and market instead of CRM size —
deal size is the gate that decides whether $100–150 a call can work for them.

**Three entry points in `app.html`**, replacing the footnote:

| Where | Why there |
| --- | --- |
| Pricing modal | Its own bordered card, not a postscript. A different product at a different price point. |
| Usage banner at 25+ enrichments | `n >= 25`, subscriber gate removed. 25 manual enrichments *is* the volume proof; a free user who has run 25 by hand wants this more, not less. |
| Sales-call intercept | Best-converting surface we have — 21 shown, 4 clicked, **19% CTR**. Someone who opened the plans and closed them is weighing whether they will actually do the work. VIP answers that exact hesitation. |

## The benchmark: Instantly VIP

Worth knowing precisely, because it is the model being copied.

| | Instantly VIP | LinkFinder VIP |
| --- | --- | --- |
| Price | **$2,000–10,000/month** | $100–150 per booked call |
| Structure | Retainer, paid from day one | Paid only when a call happens |
| Staffing | Dedicated GTM Engineer + Account Manager | — |
| Includes | AI Sales Agent + AI Inbox Manager setup, domains, accounts, campaign launch, ongoing scaling | list, copy, sending, reply handling, booking |
| Partners | **50/50 revenue split** with VIP partners on managed campaigns | — |

Three things follow.

**The pricing gap is enormous.** Ten calls a month at $125 is ~$1,250 — the
*bottom* of Instantly's range, against a service that includes two named humans.
There is real room to charge more once the offer is proven; the current price is
a floor chosen for a market that has never bought this, not a ceiling.

**The differentiator is structural, not price.** They charge $2,000 before a
single meeting exists. We charge nothing until one is on the calendar. That
contrast is stronger than being cheap, and it is what the pricing table on the
page now argues.

**Their 50/50 VIP partner split is a delivery route worth a conversation.** We
are already an Instantly customer. Worth asking what partner terms look like
before committing to any other white-label vendor.

## Still open

- **The mailboxes.** 38 accounts OAuth-dead since at least 22 Aug. Nothing
  outbound sends until they reconnect — this gates every campaign, not just VIP.
- **No campaign is live for this offer.** The DFY draft exists; it has no leads
  attached and could not send anyway.
- `intro-call` is a stand-in Calendly. Fine for now, but a dedicated event type
  would keep VIP bookings separate from research interviews.
