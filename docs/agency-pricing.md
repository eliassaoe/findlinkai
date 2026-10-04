# Agency pricing

**Shipped:** 2026-10-04 · **Tests:** `tests/agency-pricing.test.mjs`

Agency visitors see two plans, **Pro** (key `pro`, $99) and **Business** (key
`enterprise`, $249, shown to everyone else as "Scale"), plus one card: **"Need
more? Book a custom plan"** → https://calendly.com/hamoureliasse/linkfinder-ai.
The $49 Starter plan is not rendered for them. It isn't hidden with CSS. It
isn't in their page source, and the checkout worker won't sell it to them.

## Who is "agency"

A visitor who lands on any URL with `utm_campaign` starting with `agency`, or
with an `email=` parameter. `js/lf-attribution.js` (on 256 of 262 pages) checks
the landing URL and:

- sets the first-party cookie `segment=agency` (365 days, `Domain=linkfinderai.com`,
  refreshed on every visit);
- registers `segment: 'agency'` as a PostHog super property, so every event
  carries it, and calls `posthog.people.set({ segment: 'agency' })`.

**`email=` exceptions:** `email=` is ignored on `/app`, `/account`,
`/upgrade-confirmation` and `/confirmation-signup`, and on any page reached from
a same-site referrer. The reason is that `upgrade-confirmation.html` sends every
buyer to `/app?email=...`. Without this guard every paying customer would become
an agency. `/agency` strips `email=` from its URL before the script runs and
leaves the address in `window.__lfLeadEmail`, which counts as the signal.

## Where it is stored

| Stage | Source of truth |
| --- | --- |
| Before signup | the `segment` cookie |
| After signup | `linkfinderai_users.segment`, migration `supabase/migrations/20261004120000_agency_segment.sql` |

- **Saving the segment:** `LFSegment.sync(token)` calls `claim_user_segment(p_token, p_segment)`.
  - It runs right after signup (`sign-up.html`, `confirmation-signup.html`) and on every `/app` and `/account` load.
  - It copies the cookie's segment onto the account, then rewrites the cookie to whatever the database returns.
  - So agency pricing follows the account onto other devices and survives cleared cookies.
- **Only new signups:** a claim is accepted only for an account created in the
  last 24 hours that has no subscription.
  - `created_at` was added by the same migration. It is NULL for all 17,945 accounts that existed before.
  - Existing accounts can therefore never become agency. Anyone already on $49 keeps their plan, and their app keeps showing it.
- **Claims are one-way:** a claim can only set `agency`. It never clears or changes the segment.
  - The segment removes a plan and grants nothing, so letting the browser claim it with its own token is safe.
- **Stale cookie on an existing account:** if the browser's cookie says agency
  but the database says no, the database wins. The cookie is cleared and the
  entry plan is loaded after the page has rendered (`LFSegment.loadStarter()`).

Check: `select segment, count(*) from linkfinderai_users where created_at is not null group by 1;`

**Verify after the first real signup:** `created_at` is filled by a column
default. The n8n signup workflow inserts the row; if that workflow ever sends
`created_at` explicitly (it has no reason to), the 24-hour window breaks. The
query above should show rows within a day of shipping.

## Keeping $49 out of the page source

The site is static (GitHub Pages), so a page can't vary per visitor on the
server. Instead, the Starter plan lives only in **`js/lf-starter-plan.js`**:

| What | Used by |
| --- | --- |
| `LF_STARTER_PLAN` | `plans[]` in `app.html` and `account.html` |
| `LF_STARTER_PRODUCTS` | the two Dodo ids for the second-door links |
| `LF_STARTER_CARD_HTML` | the `/pricing` card |
| `LF_STARTER_FAQ` | two FAQ lines on `/pricing` |

Each page that shows plans calls `LFSegment.writeStarterScript()` from its
`<head>`, which writes the `<script>` tag only for visitors who are **not**
agency. An agency browser never requests the file.

- `app.html` and `account.html`: `SUBSCRIPTION_PLANS` holds Pro and Scale.
  `applySegmentToPlans()` fills `plans[]` (entry plan first when allowed) and
  adds or removes the entry plan's Dodo ids and `?plan=` alias. Everything that
  used to index plans by position (current plan, recommendation, annual banner)
  now goes by key (`PLAN_NUMBER_KEYS`, `planByNumber()`).
- `pricing.html`: the Starter card and its FAQ lines are `document.write`n from
  that file. For agency visitors an inline script renames Professional/Scale to
  Pro/Business and swaps the Enterprise card for the custom-plan card.
  - The title, the meta description, the FAQ JSON-LD and the credit explainer no longer quote the entry price, for everyone.
- `agency.html`: every visitor there is agency (the page stamps
  `utm_campaign=agency_10plus`), so it simply sells Pro, Business and the
  custom plan.

No API returns the plan catalogue. The only API that touches a plan is
checkout, below.

## Checkout: the server refuses

`workers/dodo-checkout/worker.js`:

- For `starter_monthly` / `starter_annual` (and the bare `starter` alias), the worker reads the account's segment (`get_user_segment`, by `user_token`).
- If the segment is `agency`, it creates the session for `pro_monthly` / `pro_annual` instead.
- It returns `plan_redirected: {from, to, reason}`. `app.html` and `account.html` follow it, so the pending marker and `checkout_payment_success` name Pro.
- If Supabase is unreachable it lets the request through unchanged: a lookup outage must never block checkout.

**Deploy:** paste the file into Cloudflare → Workers & Pages → `dodo-checkout`.
It needs no new secret; it uses the same publishable key as the browser.
Optional overrides: `SUPABASE_URL`, `SUPABASE_KEY`.

**Remaining gap:** Dodo's static `/buy/<product>` links (the second door) don't go through the worker.
- Agency pages no longer carry the Starter product ids, so the app never offers that link to them.
- But someone who already knows the id could still pay $49 there.
- To close this completely, `dodo-webhook` would have to reject or refund a Starter payment from an agency account. Not built.

## Tracking (PostHog)

Every event from an agency visitor carries `segment: 'agency'` (super property).

| Event | Where | Key properties |
| --- | --- | --- |
| `pricing_viewed` | `/pricing` load, app upgrade modal, app credits-exhausted modal, account billing modal, `/agency` | `surface`: `pricing_page`, `upgrade_modal`, `credits_exhausted_modal`, `billing_settings`, `agency_page` |
| `plan_selected` | every plan button | `plan_id`: `starter` / `pro` / `business` (on `/pricing` and `/agency` the id is in `plan`), `plan_key`, `surface` |
| `custom_plan_clicked` | custom-plan card / footer link | `surface` |
| `checkout_payment_success` | checkout return (app, account) | `plan_id`, `plan_key` |
| `checkout_plan_redirected` | the worker turned Starter into Pro | `from`, `to` |
| `segment_claimed` | a new account took the agency segment | `segment` |

## Not covered

These still quote $49 to agency visitors:

- The 18 SEO tool pages with a static `$49 per month` box (e.g. `linkedin-email-finder.html`), plus prose and comparison mentions on about 90 pages.
- `crm-audit.html` / `crm-sync.html` via `js/lf-crm-audit.js`, whose `PLANS` is also stale ($89 / $149).
- The `*-beta*.html` copies of the app.
