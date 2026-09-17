# Webinar test — is a weekly live session worth an hour a week?

**Date:** 2026-09-17 · **Sources:** PostHog 263837 (30/90 days), Supabase `sales_leads`, `ai_sdr_requests`
**Test:** `tests/webinar-test.test.mjs` · **Page:** `webinar.html` · **Bar:** `js/lf-webinar-banner.js`

## The idea

Replace the high-ticket popups with a weekly 30–60 minute live session, sold
from a permanent banner on the home page and in the app, ending in a
book-a-call for Done-For-You outbound / Enterprise.

## What the numbers say

### Reach a banner would get (unique users per week, last 8 weeks)

| Week of | Home page | App | Signups | Payers |
| --- | --- | --- | --- | --- |
| 2026-07-27 | 317 | 167 | 131 | 1 |
| 2026-08-10 | 343 | 190 | 142 | 3 |
| 2026-08-24 | 527 | 220 | 184 | 2 |
| 2026-09-07 | 341 | 184 | 157 | 0 |

Call it **~550–700 unique people a week** across both surfaces, with overlap.

### How the existing high-ticket surfaces perform (last 30 days)

| Surface | Shown to | Acted | Rate |
| --- | --- | --- | --- |
| Marketing "book a call" band (`highticket_cta_shown`) | 1,509 users | 2 clicked | **0.13%** |
| Pricing-modal intercept (`sales_call_intercept_shown`) | 109 | 16 → Calendly | 14.7% |
| Founder-call corner card (`founder_call_prompt_shown`) | 138 | 26 → Calendly | 18.8% |
| `/talk-to-sales` page | 2 users in 90 days | — | — |
| `sales_leads` table | **0 rows, ever** | — | — |
| Pre-call video (`pre_call_video_played`) | 4 users | 3 completed | — |

Two things fall out of that table.

1. **The audience is not a webinar audience.** 1,509 people saw a book-a-call
   band on the marketing pages and two clicked. That traffic came for one
   lookup; `js/lf-highticket-cta.js` already documents why "don't do it
   yourself" does not sell to it. A webinar is the same pitch, longer.
2. **The warm clicks exist and are leaking after the click.** 42 people a
   month click through to Calendly from inside the app (16 + 26) at 15–19%,
   which is a good rate. Nothing measures whether they book, the qualification
   page they were meant to pass through has had 2 visitors in 90 days, and the
   leads table is empty. A webinar adds a step *before* the call; it does
   nothing for the step that is actually losing people.

### What a weekly live session would produce

Using ordinary benchmarks (announcement-bar click-through 1–3%, landing →
registration 25–40%, registration → live attendance 30–40%, attendee →
booked call 5–10%) on ~600 weekly reach:

| Step | Per week |
| --- | --- |
| Banner clicks | 6–18 |
| Registrations | 2–7 |
| Live attendees | 1–3 |
| Calls booked | 0.05–0.3 |

That is **one booked call every 3–20 weeks** for an hour live plus prep every
week. The same hour spent on the 42 monthly Calendly clicks that already
exist is the better trade by an order of magnitude.

## Verdict

**Do not commit to a weekly live webinar or a permanent banner yet.** Not
because webinars are bad, but because at 600 reach a week the live room will
have one to three people in it, drawn from an audience that has already
shown 0.13% interest in a call.

What is worth doing, in order:

1. **Instrument the 42 clicks.** Add a `booked` signal (Calendly webhook or
   a UTM on the Calendly link → PostHog) so the existing high-intent surface
   can be judged on calls, not clicks.
2. **Run the cheap version of this test** (below) for one week. It costs one
   banner and one page, no recording, no hour a week.
3. If the test clears its bar, record **once**, host it as an evergreen
   replay on `/talk-to-sales` and as the pre-call video, and put the live Q&A
   on demand for booked calls only. That captures the webinar's value without
   the weekly cost.

## The test that shipped

- `webinar.html` — registration page for **Friday 25 September 2026, 15:00
  UTC** (17:00 Paris, 11:00 New York), 45 minutes. Shows the time in the
  visitor's own timezone. `noindex`, out of the sitemap, reached from the
  banner only.
- `js/lf-webinar-banner.js` — one static, dismissible bar at the top of
  `index.html` and `app.html`. Removes itself after the session. Not a popup,
  not sticky, not a modal (docs/next-step-routing.md).
- Registration writes a row to `sales_leads` through the existing
  `sales_lead_request` function, then shows **Add to Google Calendar** and an
  `.ics` download. Nothing is emailed yet; the join link line on the page says
  it arrives the morning of the session, which is a manual send if the test
  passes.

### Events

| Event | Where | Properties |
| --- | --- | --- |
| `webinar_banner_shown` / `_clicked` / `_dismissed` | home, app | `page`, `state`, `days_until` |
| `webinar_landing_viewed` | page | `src` (`banner_home`, `banner_app`, `direct`…), `hours_to_start` |
| `webinar_cta_clicked` | page | `source` (hero, close) |
| `webinar_registered` | page | `goal`, `has_site`, `src`, `stored`, `has_account` |
| `webinar_calendar_added` | page | `via` (google, ics) — **the reminder signal** |
| `webinar_register_failed` | page | — |

### Reading the registrations

The function only knows the offers `enterprise` and `dfy`, so webinar rows
are stored as `offer = 'unknown'` and found by `src`:

```sql
select created_at, email, company_site, volume_band as goal, src, user_token is not null as has_account
from public.sales_leads
where src like 'webinar_2026-09-25/%'
order by created_at desc;
```

To store them under their own name instead, add `'webinar'` to the allowed
list in `sales_lead_request` (`if v_offer not in ('enterprise', 'dfy')`) in a
new migration. Not done here, on purpose: nothing changes in production data
for a one-week test.

### The bar the test has to clear (by Thursday 24 September)

| Signal | Baseline (benchmarks above) | Record if | Drop it if |
| --- | --- | --- | --- |
| Registrations (`sales_leads` rows) | ~5 | **≥ 20** | < 10 |
| Calendar adds / registrations | — | **≥ 40%** | < 20% |
| Banner click-through (`_clicked` / `_shown`, unique) | 1–3% | ≥ 3% | < 1% |

Twenty registrations at a 35% show rate is six or seven people live, which is
the smallest room in which Q&A works. Under ten, cancel by email, take down
the two script tags, and put the hour into the Calendly clicks.

### Turning it off

Delete the `<script src="/js/lf-webinar-banner.js" defer></script>` line from
`index.html` and `app.html`. The bar also disappears on its own after
15:45 UTC on 25 September, and `webinar.html` switches to a "this has
happened" state at the same moment, so nothing breaks if the tags are left in.

### Still to do if it runs

- Confirmation + reminder emails (the page promises the join link the morning
  of, and a reminder an hour before). `workers/lifecycle-email` is the natural
  home; until then it is a manual send to the rows above.
- The join link itself. None is on the page; do not invent one.
- A `booked` signal on the existing Calendly clicks (item 1 of the verdict),
  which matters more than any of this.
