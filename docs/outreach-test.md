# Outreach demand test (21 Nov 2026 → decide 21 Dec 2026)

Owner idea: resell a LinkedIn outreach tool (white label, e.g. LinkedNav) as a
LinkFinder AI feature. Before that: measure whether users want it at all. The
closest thing already in the app, "Done For You" outbound ($150/meeting, tab
since Aug 2026), got **1 request in ~3 months** (`ai_sdr_requests`).

## What is live

- App nav tab **Outreach** and a route **Reach them on LinkedIn** in the panel
  after a finished list (`renderNextStepPanel` bulk). Both call
  `openOutreach(source)`: PostHog `outreach_clicked {source: nav|bulk_panel}`,
  then open HeyReach in a new tab, labelled as a partner.
- Partner: **HeyReach** (LinkedIn outreach for agencies, multiple senders).
  Affiliate program on Tolt (`heyreach.tolt.io`): 30% recurring on Starter, 15%
  on Agency/Unlimited, 10% on quarterly/yearly, 45-day cookie, paid monthly
  ($10 min) via PayPal/Wise/wire. Rules: no PPC on their brand, no cold
  emailing the link, no self-referral. Affiliate signup started 21 Nov with
  hamoureliasse@gmail.com (email code, owner to enter). Until the affiliate link
  is in `OUTREACH_URL` (app.html), clicks go to heyreach.io with UTMs and earn
  nothing — the click count is the test either way.

## The funnel we can read (owner, 21 Nov)

| Step | Where it is counted |
| --- | --- |
| Saw the offer | PostHog `next_step_panel_shown` (context=bulk) + pageviews of the tab |
| Clicked | PostHog `outreach_clicked` (by `source`, distinct people) |
| Signed up / started a HeyReach trial | Tolt dashboard (`heyreach.tolt.io`) — referrals, once the affiliate link is in `OUTREACH_URL` |
| Paid | Tolt dashboard — paying referrals and commission |

Clicks are only half the answer: a click is curiosity, a paid HeyReach
referral is someone who would also pay us for a white-label version. Read
both on 21 Dec. Before the affiliate link is live, Tolt counts nothing.

## Decision on 21 Dec 2026

```sql
-- PostHog
select properties.source, count(), count(distinct person_id)
from events where event = 'outreach_clicked' and timestamp > '2026-11-21' group by 1;
-- against people who finished a list (next_step_panel_shown context=bulk)
```

- **> 5% of list finishers click** (or several clicks a week on the tab): book
  the white-label call (LinkedNav or HeyReach's own partner program) — check
  wholesale price, margin, messages sent from each client's own profile, who
  answers replies.
- **Less**: remove the tab and the route; keep the affiliate link only where it
  costs nothing.
