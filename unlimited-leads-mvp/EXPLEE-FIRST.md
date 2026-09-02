# Ship on Explee's API first. Build the backend only if it works.

**Verdict: do this instead of `README.md`'s n8n build, for v1.** Explee's public
API exposes the entire AutoGTM product — lead search, email enrichment, campaign
creation with your own copy brief, the inbox, replies, suppression, budget,
start/stop and analytics. All of it is reachable with one `X-API-Key`. You write
a UI and nothing else.

The n8n build in this directory stays as v2 — the thing you migrate to when the
margin matters. It is not wasted; see "the migration path" at the bottom.

## The whole product is two calls

**Create a running campaign:**

```
POST /public/api/v1/find-and-enrich          # search is free; 1.5 credits per email found
     → task_id → poll GET /find-and-enrich/{task_id} → contacts with emails

POST /public/api/v1/autogtm/campaigns/import # up to 30,000 leads, YOUR copy brief
     { project_id, name, leads[], instructions, followup_instructions, language }
     → task_id → poll → result.campaign_id
```

That is it. It starts sending automatically. You own no mailbox, no warmup, no
scheduler, no reply sync, no suppression engine.

**Then run it:**

| Screen you build | Endpoint |
|---|---|
| New campaign wizard | `find-and-enrich` → `campaigns/import` |
| Dashboard | `GET /autogtm/campaigns` + `GET /campaigns/{id}/analytics` |
| Hot leads feed | `GET /autogtm/hot-leads?since=` (poll; no webhooks) |
| Inbox | `GET /campaigns/{id}/inbox?tab=need_reply` |
| Thread + reply | `GET …/inbox/{person_id}` · `POST …/inbox/{person_id}/reply` |
| Budget / pause | `PATCH /projects/{id}/budget` (`0` pauses everything) |
| Stop / start | `POST /campaigns/{id}/stop` · `/start` |
| Suppression | `POST /autogtm/suppress-list/people|companies` |
| Credit balance | `GET /billing/balance` (1 credit = $0.01) |

`GET /autogtm/campaigns/{id}` returns the full campaign definition and costs
nothing — the natural first call when auditing an account.

## Four things that will bite, in order of severity

**1. There is no endpoint that creates a project.** The AutoGTM surface has
`GET /autogtm/projects` and nothing else — no `POST`. So a customer cannot be
onboarded programmatically: somebody creates their project by hand in Explee's
app first. Fine for the first ten customers, and a hard blocker on self-serve
signup. Plan the onboarding as manual and do not promise instant activation.

The alternative is one shared project with a campaign per customer — workable,
but they then share a budget pool and the project-level `reply_instructions`,
and per-campaign budgets only unlock with Autopilot **off**.

**2. Everything resolves to your one organization, so isolation is your app's
job.** `GET /autogtm/hot-leads` with no `campaign_id` returns every hot lead
across every customer. Suppression lists are organization-wide. Never call a
list endpoint without scoping it to the campaign you are rendering — that is the
bug that shows customer A customer B's replies, and nothing server-side prevents
it.

**3. Your COGS is Explee's retail price, so only the outcome model works.**
Sending is $0.03/email and you cannot negotiate it. At the measured 374 emails
per interested lead and a 20% interested-to-booked rate — 1,870 emails per call —
that is **~$56 of sending plus ~$9 of enrichment ≈ $65 per booked call**.

| | Cost per booked call | Margin at $150 |
|---|---|---|
| Reselling Explee | ~$65 | 57% |
| The n8n build (own mailboxes) | ~$30 | 80% |

Reselling per-email leaves almost nothing; **selling booked calls at $150 still
clears 57%.** That is the whole case for the outcome pricing, and it is why this
shortcut is viable at all.

**4. The balance is negative and every request needs a positive one.**
`BASELINE.md`: **-$46.32**, and an org at or below zero gets a `402` on
everything, free-tier calls included. Nothing you build runs until it is topped
up. Top up before you write the first line of UI, so you are testing your product
and not a payment state.

## Two more, less severe but worth knowing before you promise anything

**Your client cannot send as themselves.** Outreach goes from Explee's shared
pool — your own campaigns send as `Brian Carter <b@usetidegrove.com>`. For a
done-for-you service where the deliverable is a meeting, that is survivable
(Jérôme BLAZY booked through exactly this). For anyone who wants their own domain
on the email, it is a dealbreaker, and there is no API to change it.

**Nothing in Explee knows who booked.** This is documented in `BASELINE.md` and
it is why `workers/explee-autogtm/recover.py` is parked. The API gives you
`hot-leads`, not meetings. **Wire your own calendar webhook on day one** — the
`bookings` table and workflow 05 in this directory exist for exactly this and
work unchanged on top of Explee. Selling booked calls while unable to count
booked calls is the failure this repo has already recorded twice
(`docs/outbound-angle.md`: 571 interested, 0 meetings).

## Ask Explee one question before you sell anything

Running other people's campaigns through your API key is reselling. The docs
invite you to "build your own autopilot on top" — that is about your own
outreach, not about becoming a reseller. Send it through `POST /feedback` or to
support, in writing, before the first paying customer. Same ten-minute email that
was needed for Instantly, same reason.

## What to build, in order

1. **Top up the balance.** Nothing works below zero.
2. **One screen: new campaign.** ICP text → `find-and-enrich` → show the contacts
   → `campaigns/import` with your brief. Run it on your own offer first.
3. **Wire the calendar webhook** before the first reply lands.
4. **Dashboard + inbox**, both read-only at first. `analytics` and `hot-leads`
   are enough to know whether it works.
5. **Reply from your UI** — `POST …/reply` — only once you are tired of doing it
   in Explee's app.

Then measure one number: **did anyone use it twice.** That is the question this
whole shortcut exists to answer, and it is not worth building a sending stack
before you have it.

## The migration path

Keep your own `leads`, `messages` and `bookings` tables from `schema.sql` from
day one, even though Explee is doing the work. Write every lead you enrich and
every booking you record into them. Then:

- you own the data if the reselling answer comes back "no";
- the n8n workflows in `n8n/` swap in under the same schema when $65 a call
  starts costing more than a weekend of work;
- and the booking attribution — the thing Explee cannot give you — is already
  yours.

The rule: **let Explee do the sending, never let it hold the record.**
