# AI SDR by LinkFinder AI

The service offer, sold from inside the app to the people the self-serve tool
has already failed — and to nobody else.

A tab appears in the app nav, opens a three-field panel, stores the answers, and
sends the person to Calendly. Code is in `app.html` (search `AI SDR`), data in
`supabase/migrations/*_ai_sdr_requests.sql`.

## Who sees it, and why only them

Of 120 paying accounts when this was built:

| | |
| --- | --- |
| Never ran a single enrichment | **68** |
| Dormant 30+ days | 39 |
| Holding >1,000 credits, untouched a month | 99 |
| **Actively using the tool** | **13** |

Those 13 never see the tab. That is the whole design. Someone paying $89 a month
and getting value from it is the last person who should be offered a service —
offering it is how a healthy subscription becomes a one-off conversation.

The other 107 already paid and got nothing. They are going to churn at renewal.
Offering them a service costs no self-serve revenue, because that revenue is
already lost; it just has not been recognised yet.

`public.ai_sdr_eligibility(token)` is the single definition — paying
(`subscription_id IS NOT NULL` **or** `is_unlimited`, which includes credit-pack
buyers), and either never activated or no enrichment in 30 days. Both the tab
and the submission call it, so they cannot drift apart.

    select public.ai_sdr_eligibility('<token>');

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

**No price is shown yet.** `AI_SDR_PRICE_NOTE` in `app.html` is empty and the
line is hidden while it is. Set it to a floor — "From $X/month" — and it
appears. The argument for setting it: qualifying the call is the reason this
panel exists, and price is the strongest qualifier there is. An empty calendar
of people who cannot afford it is the failure mode this was built to avoid.

**Bundling a plan into the service was considered and dropped.** It would give a
customer who quits the service somewhere to land instead of leaving. Worth
revisiting after the first sale; not worth engineering before it.

## Limits worth knowing

- The tab is in `app.html` only. The other app pages (`account`, `history`,
  `crm-sync`, `app-integrations`, `api-access`) have their own copies of the nav
  and do not carry it.
- It is a panel, not a page, so the nav highlight is put back on Data Enrichment
  when it opens.
- `ai_sdr_request()` refuses a second submission from the same account within 60
  seconds. A form anyone can post to is a form that gets posted to.
- The tables are RLS-on with no policy: the anon key cannot read them, verified
  with a row present. Everything goes through the two `SECURITY DEFINER`
  functions, which validate the token against `linkfinderai_users` first.
