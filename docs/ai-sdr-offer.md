# Outbound done for you

The service offer, sold from inside the app as the step up from doing it
yourself. $150 per meeting held, minimum five a month.

The tab reads **Done For You**; the panel's eyebrow reads *Outbound done for
you*. It was called "AI SDR" for about an hour — the internal names still say
so (`ai_sdr_requests`, `ai_sdr_request()`, `AI_SDR_*` in app.html) and are not
worth renaming. The user-facing words are the ones that changed.

A tab appears in the app nav, opens a three-field panel, stores the answers, and
sends the person to Calendly. Code is in `app.html` (search `AI SDR`), data in
`supabase/migrations/*_ai_sdr_requests.sql`.

## Who sees it

Everyone signed in. It is an upsell, and the tab sits **after** the self-serve
tabs — Data Enrichment, API & MCP, CRM Sync, Integrations, History — and before
Account, so it reads as the step up rather than as the thing being sold instead
of the product.

An earlier cut hid it from anyone actively using the tool, to protect the
subscription. That had the trade backwards. A client at $150 a call starts at
$750/month against an $89/mo subscription: an active user taking it is an
upgrade, not a loss, so there is nothing to protect and no reason to make it
hard to find.

What survived from that idea is the **segment** stamped on every row —
`paying, active` · `paying, never activated` · `paying, dormant 30d` ·
`free, has used it` · `free, never used it`. Worth a lot on the call, nothing at
the door.

An earlier version of this section read *"of 120 paying accounts, 68 had never
run a single enrichment"*. **The count was right and the label was wrong.** That
120 was `is_unlimited`, which CLAUDE.md warns is not a subscriber flag — credit
-pack buyers carry it too. Measured 2026-08-31: **31 subscribers, of whom 1 has
never run anything**, and **89 pack buyers, of whom 67 never have** (median
balance 10,000 credits, the $200 pack). Subscribers are not dormant; the idle
money is one-off pack buyers. See `docs/dfy-activation-campaign.md`.

## Price

**$150 per meeting held, minimum 5 a month — from $750/month.** Set in `app.html`:

    const AI_SDR_PRICE_PER_CALL = 150;
    const AI_SDR_MIN_CALLS = 5;

Both the sentence above the button and the live figure under the selector are
derived from those two numbers, so changing the price is a one-line edit. The
selector shows what the month costs as it changes — 20 calls x $150 = $3,000 a
month — because a number someone works out themselves lands harder than one
buried in a paragraph, and it qualifies before anyone reaches the calendar.

## Why the answers are stored before the redirect

Whoever fills the form in and never books is the warmest untouched lead there
is. Capture on booking alone and they are invisible. So `ai_sdr_request()`
writes the row, and only then does the browser navigate to Calendly. The answers
also ride along as a Calendly prefill param so they land on the calendar invite.

Read what came in:

    select * from ai_sdr_inbox;

`credits_at_request` and `enrichments_at_request` are snapshotted, so a call can
open with what the account actually looks like rather than with a form.

## Things that were decided, with the reasoning

**It does not use the customer's credits.** The work runs on our own engine.
That is stated in the panel, because the first thing a paid user wonders is
whether this eats the balance they already bought.

**It cannot be "AI Agent".** `app-prospects.html` used to carry "AI Columns" and
two `AI ___` items in one nav, one software and one a service, reads as a
bait-and-switch. "AI SDR" is the category buyers already search — it is in
`supabase/seed/ai-keywords.txt` as *best AI SDR tools*, *11x alternatives*,
*Artisan alternatives* — and those competitors charge thousands a month, which
is the price frame this wants.

**The panel says a human runs it, above the fold.** The entire point is a
pre-warmed call. Someone who clicks expecting software and lands on a booking
form arrives annoyed instead of ready.

**Bundling a plan into the service was considered and dropped.** It would give a
customer who quits the service somewhere to land instead of leaving. Worth
revisiting after the first sale; not worth engineering before it.

**Gating it was considered and reversed.** See "Who sees it" above — the trade
was backwards, and hiding an upsell worth 8x a subscription is the wrong
instinct.

## What it promises

> **You only pay for meetings that happen.** Every one is qualified against the
> brief you write below before it reaches your calendar, and a no-show is never
> billed — we book you another.

That is the guarantee shown in the panel, and it is the pricing model said out
loud rather than a separate promise: billing is per meeting held, so a meeting
that does not happen cannot be charged for. **The replacement clause is the one
part that is a commitment beyond the pricing** — worth being sure of before it
sells at volume.

There is no inbox and no weekly report in this offer. Nothing reaches the client
but a booked meeting.

Booking goes to `calendly.com/hamoureliasse/offre-linkfinder-ai-clone`,
prefilled with their email and a summary of the three answers.

## Limits worth knowing

- The panel lives in `app.html`. The other five app pages (`account`, `history`,
  `crm-sync`, `app-integrations`, `api-access`) carry the tab, but it links to
  `/app?token=...&sdr=1`, and app.html opens the panel when it sees `sdr=1`.
  That avoids five copies of the panel and its JavaScript.
- It is a panel, not a page, so the nav highlight is put back on Data Enrichment
  when it opens.
- `ai_sdr_request()` refuses a second submission from the same account within 60
  seconds. A form anyone can post to is a form that gets posted to.
- The tables are RLS-on with no policy: the anon key cannot read them, verified
  with a row present. Everything goes through the two `SECURITY DEFINER`
  functions, which validate the token against `linkfinderai_users` first.
