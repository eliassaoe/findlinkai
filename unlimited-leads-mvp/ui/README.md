# The customer app

**The app lives at the repository root as `beta-auto-gtm.html`** — one
self-contained file (markup, styles and script inline), so it deploys with the
existing site and there is no build step and no second host to run.

```
/beta-auto-gtm.html        the app. Edit UL_CONFIG at the bottom before opening it.
unlimited-leads-mvp/ui/admin.html   your backstage — deliberately NOT at the root
```

`admin.html` stays in this folder on purpose: anything at the repository root is
published to linkfinderai.com, and the onboarding console has no business being
on a public origin. Open it from a local checkout, or host it somewhere private.

## It is a private beta, and the gate is server-side

While `BETA_EMAILS` is set on the worker, every `/api` route returns `403` to
anyone whose signed-in address is not on that list — before a tenant row is even
created for them. The page is also `noindex,nofollow`, `Disallow`ed in
`robots.txt`, excluded from `gen_sitemap.py`, and linked from nowhere.

Those last four are tidiness. **`BETA_EMAILS` is the access control**, so set it
before you deploy the page: an unlinked URL keeps out crawlers, not people.

Someone signed in but not on the list sees "Not open yet" — not an error. Being
outside a beta is not a failure they can do anything about.

Clear `BETA_EMAILS` when you are ready to open it up. Nothing else changes.

## What the customer walks through

1. **Sign in** — magic link, no password. Supabase Auth handles it.
2. **The brief** — company, what they sell, who to contact, how it should sound,
   and their booking link. That is the entire setup: no mailbox to connect, no
   list to upload, no domain to configure.
3. **Dashboard** — one card per campaign with its state and, once live, four
   numbers: contacted, replies, interested, **calls booked**.
4. **Campaign** — three tabs (Needs reply · All replies · People contacted), the
   conversation, and a reply box.

While you are building their campaign backstage the card reads **"Finding leads
— come back soon to see replies here"** and the tabs are not rendered at all.
Nothing is broken-looking, and there is nothing to click that would fail.

The reply box suggests proposing two specific times rather than pasting a link.
That is not decoration: `BASELINE.md` puts the whole cost-per-call target on the
interested-to-booked rate, and two times converts better than a link.

## Setup

1. Edit `UL_CONFIG` at the bottom of `beta-auto-gtm.html`: `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `API_BASE`. Both Supabase values are public by design —
   the anon key is meant for browsers and the worker does every authorization
   check. **The Explee key is not there and must never be.**
2. In Supabase → Authentication → URL Configuration, add your site URL to the
   redirect allow-list, or the magic link bounces.
3. Set `ALLOWED_ORIGIN` on the worker to wherever the page is served
   (`https://linkfinderai.com` while it rides on the existing site).
4. Set `BETA_EMAILS` to your own address, then deploy.

## Your onboarding loop, end to end

1. Customer signs up and submits the brief. Their card says *Setting up*.
2. Open `admin.html`, paste your API base and admin token, **Load queue**.
3. In **Explee's own app**: create a new project for this customer, then a
   campaign in it — paste their offer, ICP and instructions from the queue.
4. Back in `admin.html`, enter the new `campaign_id` and press **Link this
   customer**. Their card flips to *Finding leads*.
5. The response gives you a **tracked Calendly link**. Paste that into the
   campaign's email brief in Explee — not their bare link. The `utm_campaign` on
   it is the only thing that attributes their bookings; without it the meeting
   arrives unattributed and is not counted anywhere.
6. A cron flips the card to *Sending* within 15 minutes of Explee starting.

## The isolation rules, and where each is enforced

You asked that a customer get their own project and their own inbox, and that
none of it touch your campaigns. Four separate places have to agree, so that no
single mistake is enough:

| Rule | Enforced by |
|---|---|
| A customer only ever reads their own campaigns | `ownedCampaign()` in the worker, on every campaign route |
| Your own projects can never be given to a customer | `OWNER_PROJECT_IDS` in the worker **and** the `owner_projects` trigger in Postgres |
| One project per customer, one customer per project | `unique` on `tenants.project_id` + four refusals in `/admin/link` |
| A campaign belongs to exactly one customer | `/admin/link` refuses a campaign already linked elsewhere |
| Their Calendly is theirs alone | stored per `tenant_campaigns` row; bookings attributed by `utm_campaign`, and **never guessed** — an unmatched booking is stored unattributed rather than credited to the wrong customer |

`/admin/link` reads the campaign back from Explee before writing anything, so a
mistyped id fails loudly instead of pointing a customer at whatever campaign
that number happens to be. And an unowned campaign id returns **404, not 403**,
so the API never confirms that a campaign exists.

## Known gaps

- **The rate limiter needs a KV binding to do anything.** Reads are cached
  (see "Caching, and the shared quota" in `../tenant-api/README.md`), which is
  what actually protects the shared Explee quota; the limiter is the second
  line and is a no-op until `RL` is bound.
- **The hot-lead email is built but not switched on.** The worker fires a
  `hot_lead` event and a PostHog workflow is waiting as a draft — see
  "Hot-lead notifications" in `../tenant-api/README.md`. Test-send it and enable
  it before you tell a customer we'll email them, or the copy in this app is
  promising something that does not happen yet.
- **The status sync matches Explee's status strings by substring**, because the
  API documents that campaigns have a lifecycle `status` without documenting its
  values. Check one real campaign against `GET /autogtm/campaigns` and tighten
  `syncStatuses()`; an unmapped value leaves a card stuck on *Finding leads*.
- **Response field names are guessed in one place.** The list and thread
  renderers read several plausible spellings (`conversations`/`people`/`leads`,
  `full_name`/`first_name`, `body`/`content`/`text`) because Explee does not
  publish the inbox response shape. Open one real response and delete the
  branches that do not apply.
- **Nothing here has run.** This sandbox reaches neither Explee nor Supabase.
  `node --check` passes on both scripts and the markup is valid; the first real
  session will find the rest.
