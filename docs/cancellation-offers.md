# What we offer before letting someone cancel

The cancellation flow on `account.html` now leads with two offers, in this
order, on every screen between "I want to cancel" and the button that does it:

1. **Pause the billing** — 30 days at $0, resumes automatically.
2. **Credit packs that never expire** — cancelling the subscription does not
   end the account, so they can come back with $25 instead of $49/month.

Cancelling stays two clicks away throughout. The offers sit *in front of* the
cancel button, never in place of it — see the rule at the bottom of
`docs/exit-survey.md`, which this does not change. The shortest path out is
unchanged and carries no offer below the button: the survey footer's **Cancel
my subscription** is reachable from the first question, which is two clicks
from opening the flow.

---

## Why pause moved to all six reasons

Pause was previously offered on exactly one of the six reasons on step 1:
"I'm not using it enough". That is the only reason where the customer has
*already* talked themselves into pausing, so it was the one place the offer
bought the least.

The other five are all descriptions of a month somebody does not want to pay
for:

| reason | why pause fits | share of churners (365d) |
| --- | --- | --- |
| `notUsing` | the obvious one | 25 |
| `other` | a shrug; often a quiet month | 17 |
| `missingFeature` | should not pay while we build it | 11 |
| `competitor` | keep the account alive while they trial the other tool | 7 |
| `technical` | should not pay for a month that did not work | 7 |
| `tooExpensive` | pause is $0, which beats 30% off | 6 |

(counts from `cancellation_reason_selected`, and the same table drives
`docs/exit-survey.md`.)

Pause now renders on all six, plus the two screens before the cancel button and
as a link inside the exit survey footer. Each screen carries a one-line pitch
matched to the reason (`PAUSE_PITCH` in `account.html`) — a generic save offer
reads as a speed bump rather than an answer.

**Placement is deliberate.** Where the reason names a concrete fix (a bug, a
missing feature) the fix card leads and pause follows it. Where the objection is
money or drift, pause leads.

**Economics:** a pause costs one month of MRR against a churn that costs all of
it. At ~$62 average MRR and ~6.5%/mo churn (`CHURN-PLAYBOOK.md`), a pause only
has to survive two months to beat the cancellation it replaced.

### A pause is a save, not a cancellation

Succeeding now routes to its own screen (`stepPaused`) instead of turning a
button green inside a modal the reader is still holding as "I am leaving". The
screen states the three things people ask support afterwards: nothing is charged
for 30 days, billing resumes on its own, and credits/history/API key/integrations
are untouched.

---

## Why the packs offer exists

Nothing in the flow used to say what happens to the account after cancelling,
so cancelling read as closing it. It is not: packs are one-off and
**credits never expire**, so the honest pitch is "drop the subscription, keep
the account, top up when you next have a list to run."

It appears on the two screens before the cancel button, and again on the screen
*after* a successful cancellation — which is the highest-intent moment for a
pack, because it is the one moment somebody is certain they want nothing
recurring.

`openPaygFromCancellation()` opens the pricing modal with
`trigger: 'cancellation_payg'`, which forces the PAYG tab and swaps the copy.
That branch is checked **before** the `isExistingSubscriber` branch on purpose:
they are still a subscriber at that instant, and "you will only be charged the
difference" is the wrong sentence for a one-off pack replacing a plan.

---

## The CRM exception — this one is load-bearing

**CLAUDE.md: never recommend PAYG to a CRM user.** The reason is not
preference, it is that packs cannot do the job: the HubSpot connection is a
managed Nango connection billed to us monthly, and credits alone do not open it
(`crm-sync.html` gates it on a subscription, not on a balance). Selling a CRM
customer a pack on their way out sells them something that will not work.

Two signals suppress the packs card. Either one is enough:

| signal | where it comes from |
| --- | --- |
| a live CRM connection | `POST nango-connect-session…/status {token}` → `{connected}`, fired once when the flow opens |
| `usage: 'crm'` in the exit survey | question 1, answered before the final screen |

When either fires, `renderCrmOrPaygCard()` swaps in `crmNoteCard()`: it says
plainly that the sync stops when the plan does, and that pausing keeps the
connection and its field settings intact. That routes CRM users to pause or to
a subscription, which is what the rule wants.

**Unknown is treated as not-a-CRM-user.** The status call can fail, and
suppressing the offer for everyone on a network error would be worse than
showing it. It is safe because the packs card *always* carries the line "The
HubSpot CRM sync is the one thing that needs an active subscription" — so an
unknown never sells a lie, it just leaves the caveat doing the work.

`renderCrmOrPaygCard()` is the only place `paygCard()` is called. A test in
`tests/cancellation-offers.test.mjs` enforces that; do not add a second call
site.

---

## Events

| event | when | key properties |
| --- | --- | --- |
| `pause_offer_shown` | a pause card renders, on any of the eight screens | `context`, `reason` |
| `retention_pause` | pause succeeded | `subscription_id`, `reason`, `context` |
| `pause_offer_reopened_from_survey` | "Pause instead" clicked mid-survey | `question` |
| `payg_offer_shown` | packs card renders | `context`, `reason` |
| `payg_offer_clicked` | "See credit packs" clicked | `context`, `reason` |
| `payg_offer_suppressed_crm` | CRM note shown instead | `context`, `source` |
| `subscription_cancelled` | now also carries `reason` | `subscription_id`, `reason` |

`context` is one of `reason_<reason>`, `pre_survey`, `final_confirm`,
`after_cancel` — so "which screen actually saves people" is a breakdown, not a
guess. The number worth watching is `retention_pause / cancellation_flow_started`.

`source` on the suppression event distinguishes `nango_connection` from
`exit_survey`, which is the only way to find out how many CRM users the live
connection check misses.

---

## Backend contract — read before changing the copy

Pause and discount both POST to the **live** `cancel-subscription` worker:

```
POST https://cancel-subscription.hamoureliasse.workers.dev/
{ "action": "pause" | "discount" | "cancel", "subscription_id": "…" }  ->  { ok: true }
```

**That worker is not in this repo** and was not read while this was built — the
payload is byte-for-byte what the old `notUsing` pause button already sent, so
the contract is unchanged and only the number of places sending it grew.

Two consequences:

- **"30 days" is copy, not a parameter.** The request carries no duration. If
  you want to offer 1/2/3 months, the worker has to learn a duration field
  *first*; shipping the choice in the UI alone would tell people something the
  billing system is not doing. This is the single highest-value follow-up here,
  and it is the reason the flow does not already offer it.
- Same for "email support to resume early" — that is a manual action in the
  Dodo dashboard, not an endpoint.

---

## Trying it without cancelling

The preview harness in `docs/exit-survey.md` covers all of this, and now walks
the same screens production does:

```js
lfPreview.cancel()   // whole flow, offers included
```

While preview is on nothing leaves the browser: the CRM status lookup, the
pause/discount calls, the cancel worker, the feedback email and every PostHog
capture are replaced by console logs prefixed `[preview]`. Pausing and
cancelling still land on `stepPaused` / `stepCancelled` so both terminal screens
can be read — that is the point of the harness.

Because the CRM lookup is skipped in preview, the packs card always shows unless
you answer `usage: 'crm'` in the survey. To preview the CRM variant, set
`crmConnected = true` in the console before opening the flow.
