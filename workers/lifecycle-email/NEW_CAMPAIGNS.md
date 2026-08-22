# Campaign state — 22 Aug

## LIVE (sending to real users now)

| # | Workflow | id | Fires |
|---|---|---|---|
| 1 | Checkout recovery — picked a plan, never paid | `01a02578-9f9e-0000-d4c0-f57a811dca80` | `plan_selected` / `checkout_redirect_started` → +2h, then +3d |
| 2 | Credit wall — ran out, never saw pricing | `01a02579-2580-0000-52d3-689a36d8390d` | `credits_exhausted` / `bulk_results_gated_shown` → +30m |
| 3 | New user activation — welcome, rescue, upgrade | `01a0257a-401d-0000-e2a2-4138ca3d4e4c` | `signup_success` → +20m, +1d if no lookup, +6d upgrade |

All three are **forward-only**: they fire on events from now on, not on history. No
blast went out to the existing 1,546 accounts. Blast radius on day one is roughly
17 signups/day plus whoever hits a credit wall or abandons a checkout.

Engagement events were switched on at the same time
(`workflows_config.capture_workflows_engagement_events: true`, consent mode
`opt_out`), so `$workflows_email_*` starts accumulating from today. It does not
backfill — today is day zero for the optimisation loop.

## LIVE — the rest

| # | Workflow | id | Notes |
|---|---|---|---|
| 4 | Win-back broadcast | `01a0257d-5b54-0000-42a7-fcd74f8a0a1d` | **Enabled but NOT dispatched.** Batch triggers do not fire on enable. Gated on bounce data — see DELIVERABILITY.md. |
| 5 | Pricing seen, no payment — offer a call | `01a02878-e5a4-0000-1d67-1ee8523b3bcd` | Ready. `pricing_modal_opened` → +3d → **1,000 credits for 15 minutes** on a call, booking at `calendly.com/hamoureliasse/compensated-interview-unlimited-leads-clone`. Payers exit via the conversion goal. |
| 6 | Used it, never found the API or MCP | `01a0287a-3028-0000-63cb-6ab00b72bea6` | Ready. `enrich_started` → wait 48h for `api_key_copied` or `mcp_url_copied` → email only if neither happened. |

Both 5 and 6 have had the `html` re-render applied and their sender verified, and both
are now in `variants.json` with four variants each, so the Monday loop can see them.

**Campaign 5 deliberately mirrors the product.** `app.html` already runs a sales-intercept
modal making the identical offer — "Book a quick 15-minute call... show up and we'll add
1,000 free credits" — pointing at the same Calendly event. The email is the asynchronous
version of that modal, so the duration, the credit amount and the link must stay in step
with it. They were briefly out of step (the email said 20 minutes and used the generic
`intro-call` link) and that is fixed.

Note the site uses **two** Calendly events: `intro-call` on 188 marketing and blog pages,
and `compensated-interview-unlimited-leads-clone` on the 5 in-product pages
(`app.html`, `account.html`, `account-beta.html`, `crm-sync.html`, `linkfinder-vip.html`).
Lifecycle email talks to people who already have accounts, so it uses the second one.

| 7 | CRM audit follow-up — send them their report | `01a02b7b-bb8b-0000-2f15-2b586cfd7573` | **DRAFT — not enabled.** `crm_audit_completed` → +45m → their own audit numbers as a report. Gated on `email_verified`. Once per person per 30 days. Payers exit via the conversion goal. |

### Campaign 7 — two things that are not obvious

**The 45-minute delay is a correctness requirement, not pacing.** This email
interpolates eleven person properties. PostHog populates person properties
through the async person-processing pipeline, so they are not reliably readable
the instant `crm_audit_completed` lands — PostHog's own docs flag this. Sending
immediately risks rendering every Liquid fallback instead of the user's real
numbers, which is worse than not sending at all. Do not shorten the delay.

**Person properties, not event properties.** Workflows personalise from
`{{ person.properties.<key> }}` — verified against the live campaign 5 email,
which addresses `{{ person.properties.email }}`. The docs show a shorter
`{{ person.name }}` form; that is not what this project's working workflows use.
`crm-sync.html` therefore does two writes on audit completion: the event (for
the trigger and the funnel) and eleven `crm_audit_*` person properties (for the
copy). Only aggregates are written — no row, column value or contact leaves the
browser, which is what keeps the promise made on the upload card true.

Every Liquid tag carries a `default:` with **single** quotes. Double quotes
break it: the email builder serialises templates to JSON, which escapes them and
raises a Liquid `TokenizationError`.

One variant, `crm_audit-specific`, puts a Liquid tag in the **subject line**.
That is untested — if subjects are not templated, that subject ships with a raw
`{{ ... }}` in it. Read the first sends before letting the weekly loop promote it.

**Before enabling:** run **Test run** (sends nothing to real people), then check
a real send renders the numbers rather than the fallbacks. A person who has
never run an audit has none of these properties, so the fallbacks are what you
will see in any test that is not driven by a real audit.


## Reactivation sequence — 10 emails over ~3 months

Written, rendering, and in `variants.json` as `reactivation_1` … `reactivation_10`.
**No workflow exists yet and nothing has been sent.** Read the two blockers below
before building one.

| # | Angle | Subject | Job |
|---|---|---|---|
| 1 | confession | I think we lost you, and I know why | Name why they left; no ask |
| 2 | utility | 200 credits on your account, no card | Remove the cost of trying |
| 3 | empathy | you probably did not want a subscription | Kill the subscription objection |
| 4 | specific | how much of your CRM is actually missing? | Free audit — costs them nothing |
| 5 | utility | the part that actually saves you time | Bulk/CSV, the 9.46% behaviour |
| 6 | specific | a clean CRM stays clean for about a month | Sync — the retention product |
| 7 | peer | if you would rather not use the dashboard | API / MCP / n8n for builders |
| 8 | utility | do not take my word on the data quality | Accuracy, tested by them |
| 9 | peer | four things people actually use this for | Unlock the "no use case" group |
| 10 | permission | should I stop emailing you? | Clean the list either way |

Spacing ~9 days. The arc is re-engage → remove friction → demonstrate →
automate → decide, and it deliberately gives twice before asking once.

### BLOCKER 1 — email 2 promises credits nothing grants

Email 2 says *"200 credits, already on your account"*. **Nothing in the codebase
puts them there.** Sending it as-is tells several thousand people something
untrue and they find an unchanged balance — worse than never sending.

Pick one before this campaign runs:

* grant the credits in a batch to the target segment first, then send; or
* change the copy to a claim code / a button that grants on click; or
* drop the number and make email 2 about something else.

The amount is a placeholder too. 200 credits is ~10 fully enriched leads at
10 credits per profile and 10 per email — chosen because the 25-credit trial is
about one lead, which is too few to judge anything. Your call.

### BLOCKER 2 — do not blast this at the whole base

`DELIVERABILITY.md` is explicit: a large first send to a backlog of old,
never-tested addresses is the one move that could cost the sending domain. SES
suspends at a 5% hard-bounce rate and `linkfinderai.com` has no reputation to
absorb a spike. This campaign is exactly that shape, at the largest scale yet
attempted.

Ramp instead, watching `$workflows_email_bounced` between each step:

1. **~100 most recently active** dormant users. Bounce rate under ~2% → continue.
2. **~500**. Still under 2% → continue.
3. **Everyone else**, in batches of ~1,000 with a day between.

Every workflow already filters on `email_verified is_not "false"`, which keeps
explicitly-bad addresses out, but it cannot see a typo'd address that has simply
never been tested. Only sending finds those, which is why the first batch is 100
and not 6,500.

### Segments

Churned subscribers and never-paid dormant users are both in scope and both
handled by the same copy, which is deliberate — the objection ("wrong shape, not
too expensive") is shared. If you want them split later, email 3 is the one to
branch: churned users already know the product works and need only the PAYG
answer, while dormant users may never have reached a first successful lookup.

### Two things to keep honest

**Email 8 makes no accuracy claim on purpose.** There is no measured match rate
to quote, and "significantly more accurate" is both unverifiable and weaker than
telling someone how to test it themselves in five minutes. If you have real
numbers — match rate, bounce rate on returned emails, sample size — put them in
email 8 and it becomes the strongest email in the sequence. Do not add a number
you cannot show the working for.

**Emails 2 and 3 both lean on "credits do not expire".** That is true today and
it is a genuinely good selling point for a dormant list. It also directly
contradicts the recommendation to add a 12-month expiry. Pick one: if expiry
goes in, both emails need rewriting before they send.

## STILL TO BUILD

- **7. Power user — 3+ enrichments, never upgraded.** Needs a behavioural cohort as
  a trigger filter, because `three_enrichments_milestone` is misnamed: it fires at
  TEN enrichments, not three (`app.html:4211`). 51 people hit it in 90 days.
- **An audience split on campaign 7.** Audits above Enterprise's 50,000-credit
  ceiling currently get the same email as everyone else, pointing at checkout.
  Those are the largest CRMs the audit sees and they should be routed to the
  Calendly booking instead — a `conditional_branch` on
  `crm_audit_verdict = 'contact'` before the email step.
- **8. Churn.** Trigger `cancellation_reason_selected`, branch on the reason.
  Deliberately small — 14 people in 90 days.
- **A 4th email in workflow 3**, an education step at +3d, between the rescue and
  the upgrade ask.

Sequencing note: these are held until there is real bounce data from the six live
campaigns. Adding send volume to a brand-new sending domain before knowing its
bounce rate is the one move that could cost the domain — see DELIVERABILITY.md.

## Deliverability

All six live campaigns share one sending domain and one SES reputation. 27 junk
addresses are suppressed project-wide. The signup form has no email
verification at all, which is the root cause. Read `DELIVERABILITY.md` before
dispatching anything in bulk.
