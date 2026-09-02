# unlimited-leads MVP — the whole backend is five n8n workflows

> **Read `EXPLEE-FIRST.md` before building any of this.** Explee's public API
> already exposes the entire AutoGTM product for a UI to sit on, so v1 should be
> a UI over their API and nothing else. What follows is v2 — the build you
> migrate to when the margin matters ($30 a booked call instead of $65). The
> schema below is worth setting up either way: it is what makes the migration
> possible, and it holds the booking record Explee cannot give you.

Nothing here is a server. There is no app to deploy, no queue to run, no
mailbox to warm, no SaaS vendor in the sending path. Five workflows, one
Postgres schema, and the only things you operate are an n8n account and a
Supabase project.

## Read this first: what you are selling

**You are not selling emails. You are selling booked calls**, and that is the
decision that shapes everything below.

Selling sends is selling a commodity: it is price-shopped, it churns, and the
customer's next question is always "why is this $0.03 when Instantly is $47 flat".
Selling a booked call is an ongoing need that never completes, it is priced on
outcome rather than on volume, and it upsells itself — nobody ever wanted fewer
meetings. `docs/ai-sdr-offer.md` already prices it: **$150 per meeting held,
minimum five a month.** That offer exists, it is live in the app, and it has no
delivery engine behind it. This directory is the delivery engine.

Which means **v1 is single-tenant and needs no UI at all.** You run campaigns for
clients out of one n8n account. There is no signup, no billing, no dashboard, no
multi-tenant isolation to get wrong — the client does not want a dashboard, they
want calls in their calendar. Ship the fulfilment, sell the outcome, and only
build the self-serve product if customers start asking to run it themselves.

### The margin, using measured numbers

From `workers/explee-autogtm/BASELINE.md`: **374 emails per interested lead**.
Take a 20% interested-to-booked rate (`BASELINE.md` puts the $50-per-call target
at 22%) and one booked call costs about **1,870 emails**.

| Line | Per email |
|---|---|
| Lead data (~$0.02/lead, 3 emails each) | $0.007 |
| Claude, per-lead sequence + reply classification | $0.003 |
| Mailbox rent, amortised | $0.005 |
| n8n + Supabase | $0.001 |
| **COGS** | **~$0.016** |

**1,870 × $0.016 ≈ $30 of cost per booked call, sold at $150.** Five calls a
month is $750 revenue against $150 of cost, per client. That is the business,
and it is a considerably better one than $0.02 an email.

Note what this does to the risk: selling an outcome means *you* carry the
delivery risk. If the booking rate comes in at 7% rather than 20% — the low end
of what `BASELINE.md` measured — a call costs $85 instead of $30. Still
profitable at $150. That is the number to watch, and it is why `bookings` is a
real table.

## Why booking is a first-class table

`docs/outbound-angle.md` records **571 leads marked interested and 0 meetings
booked**. `workers/explee-autogtm/recover.py` is built, tested and parked
because "nothing in Explee knows who booked". Both failures are the same missing
row.

Workflow 05 is a calendar webhook that writes that row. It is four nodes, and it
is the most important thing in this directory — when you sell calls, a system
that cannot count calls cannot be run at all.

## The pieces

| File | What it is |
|---|---|
| `schema.sql` | Every table and every function. Run once in the Supabase SQL editor. |
| `n8n/01-enroll.json` | Leads in → Claude writes a per-lead 3-step sequence → queued |
| `n8n/02-send.json` | Cron. Claims due sends, refreshes the token, sends via Gmail, spends the credit |
| `n8n/03-replies.json` | Cron. Reads inbox, matches threads, classifies, ends the sequence |
| `n8n/04-unsubscribe.json` | The opt-out link. Legally load-bearing, four nodes |
| `n8n/05-booking.json` | Calendar webhook → attributes the meeting to the lead |
| `build_workflows.py` | Regenerates the JSON. Edit this, not the JSON. |

### Design rules the generator enforces

- **Every external system is a plain HTTP Request node.** No vendor nodes, so no
  node-version upgrade can break an import, and there is one shape to learn.
- **No IF / Switch / SplitInBatches.** Branching happens in Code nodes, which end
  a branch by returning `[]`.
- **Anything that must be atomic is a Postgres function**, never a
  read-modify-write in a workflow. `next_sends()` claims rows by flipping them to
  `sending` inside one transaction, so two overlapping cron ticks cannot send the
  same email twice. `mark_sent()` spends the credit in the same transaction that
  records the send, so a crash can never bill without sending.
- **Secrets live in n8n credentials**, not in the JSON. On import n8n asks you to
  pick them — that is expected, not an error.

## Setup, about an hour

1. **Supabase** → new project → SQL editor → paste `schema.sql` → run.
2. **n8n** (cloud is fine) → import the five JSON files.
3. **Credentials** → create a *Supabase API* credential (host + service role key)
   and an *Anthropic* credential. n8n will prompt for them on each HTTP node
   flagged `REPLACE_ON_IMPORT`.
4. **The `Config` node** appears in every workflow — set `supabase`, `appBase`,
   and the Google OAuth client id/secret. These are the one unavoidable secret in
   the JSON: refreshing a per-mailbox token is a *body* parameter, so it cannot
   ride on a credential.
5. **Google Cloud** → OAuth client → scope `https://www.googleapis.com/auth/gmail.modify`
   → get a refresh token per sending mailbox → insert rows into `mailboxes`.
6. **Point the webhooks**: `/u` at the unsubscribe workflow (this URL goes in
   every email), `/booked` at Calendly's `invitee.created`.
7. **Insert one `accounts` row and one `campaigns` row**, set `status='active'`,
   POST leads to `/enroll`, and turn on the two cron workflows.

## What this does not do, and you will hit these

**No warmup.** Nothing here warms a mailbox, so the domains you send from must
already have reputation, and volume is capped at what a real mailbox survives —
`mailboxes.daily_cap` defaults to **30/day**. Ten mailboxes is 300 emails a day,
which is roughly one booked call a week at the measured rates. Past that you need
warmed domains, and that is the point where a sending vendor stops being
avoidable.

**No bounce processing.** `record_bounce()` exists and nothing calls it. Gmail
returns bounces as a mailer-daemon message in the inbox; workflow 03 will see it
and classify it as noise. Until this is wired, watch the bounce rate by hand — an
unwatched bounce rate is how a domain dies.

**No open or click tracking**, deliberately. Tracking pixels hurt placement and
the metric that matters here is bookings, which is measured directly.

**Sequential sends.** Workflow 02 sends its batch on a 10-minute cron with no
jitter beyond `min_gap_min`. Fine at 300/day, obvious at 3,000.

**The SQL has never been run and the workflows have never executed.** This
sandbox reaches neither Supabase nor Gmail. Every Code node is syntax-checked
(`node --check`, clean) and the JSON imports as valid n8n, but the first run will
find things. Expect to spend an afternoon on step 5 in particular — per-mailbox
OAuth is the fiddliest part of the whole setup.

## The order to build in

1. Run `schema.sql`, import the workflows, connect **one** mailbox.
2. Run a campaign to **20 of your own leads**, on your own offer. Watch every
   email that goes out.
3. Wire Calendly before the first reply arrives. Not after.
4. Only when a call is on the calendar and `bookings` has the row: sell it to
   someone, at $150 a meeting held.
5. Self-serve, billing, a UI — only if clients ask to run it themselves.
