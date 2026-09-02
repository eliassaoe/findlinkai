# Tenant API — self-serve front, manual backstage

The customer signs up, describes what they sell, and sees a campaign card that
says **"Finding leads — come back soon to see replies here."** You create their
project and campaign by hand in Explee, paste two ids into one admin call, and
their card starts filling with real leads and a real inbox.

They never know a human did anything.

## Why this worker exists at all

Explee's API is organization-wide. One key, and `GET /autogtm/hot-leads` with no
filter returns **every hot lead belonging to every customer you have**. Nothing
at Explee knows your customers exist, so the isolation is entirely yours to
enforce, on every request.

This worker does exactly two things, and it must never be bypassed:

1. **It holds the Explee key.** The browser never sees it.
2. **It resolves the caller to their own campaigns and refuses everything else.**
   A campaign id arriving from the client is a claim, not a fact — `ownedCampaign()`
   checks it against `tenant_campaigns` before any Explee call is made. Every
   campaign-scoped route goes through that one function.

Two smaller things it also does, both deliberate:
`spend`, `cost_per_lead` and `budget` are **stripped from analytics** — that is
your cost, not their price, and it must not reach the customer's browser. And a
`402` from Explee (our balance is empty) becomes a `503 temporarily unavailable`,
because our billing problem is not their error message.

## The endpoints your UI calls

All of them take the Supabase access token as `Authorization: Bearer …`.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/me` | email, company, and every campaign with its display status |
| POST | `/api/onboarding` | stores the brief, creates the placeholder card |
| GET | `/api/campaigns/:id` | one campaign's status + copy |
| GET | `/api/campaigns/:id/leads` | everyone contacted (`?limit`, `?offset`) |
| GET | `/api/campaigns/:id/inbox` | `?tab=need_reply\|replied\|sent` |
| GET | `/api/campaigns/:id/hot` | hot leads, always scoped (`?since=`) |
| GET | `/api/campaigns/:id/threads/:personId` | the full conversation |
| POST | `/api/campaigns/:id/threads/:personId/reply` | `{ message }` |
| GET | `/api/campaigns/:id/analytics` | `?period=24h\|7d\|30d\|all`, plus `booked` |

Every campaign route returns `404 campaign not found` — never `403` — for a
campaign the caller does not own, so the API never confirms that an id exists.

### The states, and the copy that goes with them

`/api/me` returns `status`, `label` and `note` per campaign, so the UI renders
the message rather than inventing one:

| status | label | note |
|---|---|---|
| `pending_setup` | Setting up | We're building your campaign. This usually takes a few hours. |
| `waiting_leads` | Finding leads | Finding people who match your brief. Come back soon to see replies here. |
| `active` | Sending | Your campaign is live. Replies appear in your inbox. |
| `paused` | Paused | Sending is paused. |
| `done` | Finished | This campaign has finished sending. |

`has_data` is false for the first two — render the note, skip the fetches. The
leads and inbox routes return empty rather than erroring if you call them anyway.

## Your backstage, three calls

Guarded by `x-admin-token`. A wrong or missing token returns `404`, so the admin
surface is not discoverable.

```bash
# 1. Who is waiting, and what did they write?
curl -H "x-admin-token: $ADMIN_TOKEN" https://api.example.com/admin/queue

# 2. You created the project + campaign in Explee. Link them:
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" -H 'content-type: application/json' \
     -d '{"tenant_id":"…","campaign_id":4021,"project_id":30475,"name":"Acme"}' \
     https://api.example.com/admin/link
#    -> replaces the placeholder card, status becomes waiting_leads

# 3. Force a status refresh (a cron already does this every 15 minutes)
curl -H "x-admin-token: $ADMIN_TOKEN" https://api.example.com/admin/sync
```

`/admin/queue` gives you the offer, the ICP fields, their `instructions` and
their Calendly link — everything you paste into Explee's campaign import. Their
brief goes in as `instructions` / `followup_instructions`, and their Calendly URL
goes in the copy so meetings land on **their** calendar.

## Setup

1. Run `schema.sql` in Supabase (it is additive to `../schema.sql`).
2. `wrangler secret put` each of `EXPLEE_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `ADMIN_TOKEN`.
3. Set `ALLOWED_ORIGIN` in `wrangler.toml` to your real front-end origin. Leaving
   it `*` lets any site call this API with a stolen token.
4. `wrangler deploy`.
5. Point Calendly's `invitee.created` webhook at `/hooks/calendly`.

## Hot-lead notifications, via PostHog

The customer's whole reason to log in is "someone replied". So the worker
watches for that and PostHog sends the email.

**The split, and why:** the worker decides *who is new*, PostHog decides *what
the email says*. Changing the copy then needs no deploy, and PostHog already has
an email integration and a workflow engine — there is no reason to build a
sender.

**How a notification happens**

1. The 15-minute cron runs `syncStatuses()`, then `pollHotLeads()`.
2. `pollHotLeads()` walks `tenant_campaigns` — so it only ever sees campaigns
   linked to a customer, never yours — and calls
   `GET /autogtm/hot-leads?campaign_id=…` for each.
3. Each lead is inserted into `hot_leads_seen`. **The insert is the dedup**: the
   primary key `(campaign_id, person_id)` rejects one we already announced, so a
   retry, an overlapping run or a replayed feed cannot email twice. Notifying
   twice is worse than notifying late — the customer stops trusting the alert,
   and the alert is why they log in.
4. Only a genuinely new row fires a `hot_lead` event to PostHog with
   `distinct_id` = **the customer's email**. That direction matters: get it
   backwards and PostHog emails the prospect.
5. PostHog's workflow sends the mail.

**The workflow is created and sitting as a draft:**
[Hot lead — notify the customer](https://us.posthog.com/project/263837/workflows/01a0642a-6047-0000-b4f5-4b2a041bcac5/workflow)
— trigger `hot_lead` → email → exit, with a 15-minute per-person mask so a burst
of replies is one email rather than six.

**Before you enable it, two things:**

1. **Run a test send from PostHog and read the email.** The server stamped
   `templating: "liquid"` on the email node while the placeholders are written
   hog-style (`{event.properties.lead_name}`). If the test arrives with those
   braces printed literally, rewrite them as `{{ event.properties.lead_name }}`
   in the workflow's email step. This is the one thing in the chain I could not
   verify from here.
2. **Set the `from` address to a domain you actually control.** It currently
   reads `hello@unlimited-leads.net`, which has to be verified in PostHog's
   email settings or the send fails.

Then enable it. Until you do, the event still fires and is visible in PostHog —
so you can watch hot leads arrive before a single email goes out.

**Worker config:** set `POSTHOG_KEY` (project API key) and optionally
`POSTHOG_HOST` and `APP_BASE_URL`. Leave `POSTHOG_KEY` unset and notifications
are simply off — nothing else changes. Force a poll any time with
`GET /admin/hot`.

## Known limits, so they do not surprise you later

**Booking attribution is best-effort.** `/hooks/calendly` matches the booking to
a tenant by their Calendly link. Give **each customer their own event type** or
attribution falls back to the first tenant with a link set — which is wrong, and
silently wrong. If you only ever run one customer at a time, this is fine; the
moment there are two, give them separate links.

**No rate limiting.** A logged-in customer can hammer `/api/campaigns/:id/inbox`
and spend your Explee rate limit (10,000/hour org-wide, shared across every
customer). Add a KV counter before you have more than a handful of accounts.

**`syncStatuses` guesses at Explee's status strings.** The API documents that
campaigns have a lifecycle `status` but not its exact values, so the mapping
matches on substrings (`run`/`active`/`send` → active, `stop`/`pause` → paused).
Check one real campaign against `GET /autogtm/campaigns` and tighten it — an
unmapped status leaves the card stuck on "Finding leads".

**Nothing here has run.** This sandbox cannot reach Explee or Supabase.
`node --check` passes on the worker; the first deploy will find the rest.
