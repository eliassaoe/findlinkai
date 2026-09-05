# Cancellation exit survey

Three questions, one screen at a time, between the retention offers and the
cancel button on `account.html`. Copied in shape from Instantly's: the button
that used to cancel now reads **Finish cancellation** and opens the form, and
the real **Cancel my subscription** button sits on the screen after it.

> The offers either side of these questions — pause the billing, and credit
> packs that never expire — are documented in `docs/cancellation-offers.md`,
> including the CRM rule that decides whether the packs card may be shown at
> all. This file covers the questions only.

## Why it exists

The reason grid on step 1 bought exactly one datapoint per churner out of six
buckets, and over 365 days the two biggest were the two least actionable:

| reason | people |
| --- | --- |
| notUsing | 25 |
| **other** | **17** |
| missingFeature | 11 |
| competitor | 7 |
| technical | 7 |
| tooExpensive | 6 |

"Not using it" is a symptom, and `other` is a shrug. The free-text box that
would have explained `other` sat behind a Send button, so **2 of those 17
people ever typed anything**. Everything we thought we knew about churn came
from one click on a card.

The funnel was also leaking before that: 70 people opened the cancellation
flow in 180 days, 34 picked any reason at all, 26 declined the offers, 6
cancelled. Half of the people who set out to cancel told us nothing.

## The three questions

1. **`usage`** — what were you mainly using it for? (`one_off`, `bulk_csv`,
   `api`, `crm`, `never_got_going`). Segments churn against the activation
   thesis in `FUNNEL-REVIEW.md`: if churners cluster on `one_off` and
   `never_got_going`, the problem is onboarding, not the product.
2. **`cause`** — the main thing that made you cancel (`no_results`,
   `bad_data`, `credits`, `too_hard`, `price`, `no_longer_needed`, `other`
   with free text). This is the question `notUsing` was hiding.
3. **`destination`** — where the work is going now (`apollo`, `clay`,
   `hunter`, `lusha`, `other_tool` with free text, `manual`, `stopping`).
   Answers whether churn is competitive or the job is going away — those need
   opposite responses and today we cannot tell them apart.

Option values are stable strings on purpose. Change a label freely; changing a
`value` breaks every historical breakdown.

## Events

| event | when | key properties |
| --- | --- | --- |
| `exit_survey_started` | Finish cancellation clicked | `reason`, `layout`, `resumed` |
| `exit_survey_answered` | each answer, including re-answers after Back | `question`, `answer`, `answer_text` |
| `exit_survey_question_skipped` | Skip this question | `question` |
| `exit_survey_abandoned` | modal closed mid-survey | `last_question`, `answered_count` |
| `exit_survey_completed` | last question resolved | `usage`, `cause`, `destination`, `*_text`, `answered_count`, `reason` |

`resumed` is true when someone stepped out to the pause offer mid-survey and
came back: answers are kept across that round trip, so the second pass resumes
where they left off rather than re-asking three questions they just answered.
It also means `exit_survey_started` can fire more than once per churner — count
distinct people, not events.

**Use `exit_survey_completed` for analysis** — one row per churner, all three
answers on it, no join. `exit_survey_answered` is the keystroke-level stream
and will contain more than one row per question when someone goes Back.

```sql
SELECT properties.usage, properties.cause, properties.destination, count()
FROM events WHERE event = 'exit_survey_completed'
  AND timestamp > now() - INTERVAL 90 DAY
GROUP BY 1, 2, 3 ORDER BY 4 DESC
```

Answers are also POSTed to `linkfinder-request-feature` as
`type: 'feedback'` with a `message` starting `EXIT SURVEY —`, which emails
them and forwards to n8n. That call is fire-and-forget and never blocks the
cancel button.

## Trying it without cancelling

From the browser console on `/account`:

```js
lfPreview.survey()          // jump straight to the three questions
lfPreview.survey('inline')  // cancel button under every question (shipping)
lfPreview.survey('gate')    // cancel button on the screen after
lfPreview.cancel()          // the whole flow from the reason grid
lfPreview.compare()         // what each layout costs in clicks
lfPreview.answers()         // what has been answered so far
lfPreview.off()
```

Or by URL: `/account?token=…&preview=survey&variant=inline`.

Works on any account, subscriber or not. While preview is on **nothing leaves
the browser** — PostHog captures, the feedback email, the cancel worker and the
pause/discount offers are all replaced by console logs prefixed `[preview]`, so
you can read the exact payloads that would have been sent. A yellow banner sits
at the top of the modal the whole time.

The layout override lasts until the page reloads. `EXIT_SURVEY_LAYOUT` in
`account.html` is what actually ships.

## Two layouts

| | `inline` (shipping) | `gate` |
| --- | --- | --- |
| cancel button | under every question | on the screen after the survey |
| clicks to cancel without answering | 2 | 5 |
| reachable mid-survey | yes | no |

**`inline` ships, and the reason is data quality, not politeness.** The whole
point of these three questions is answers we can act on, and an answer someone
picked to get past a screen is not that — it is noise. At roughly six
cancellations per six months, two junk rows would swamp the real ones. Making
the survey optional costs completion rate and buys answers worth reading.

It also keeps cancelling to two clicks, which is what consumer-protection rules
(ROSCA's "simple mechanism", California's ARL) actually look at. And the extra
clicks in `gate` bought less than they looked like they did anyway: anyone who
did not want to answer just clicked Skip three times and left nothing behind.

`exit_survey_completed` carries a `layout` property, so the two stay comparable
if the choice is ever revisited.

The `inline` footer also carries one line offering to pause instead, above the
cancel button, so that offer stays reachable for the whole survey without ever
standing between anyone and cancelling.

## Rules

**Every question is skippable and the cancel button is on screen throughout.**
A survey someone is trapped in returns whatever gets them out fastest, which is
worse than no data at all — the answers stop meaning anything, and there are too
few of them for a couple of junk rows not to matter. Do not gate
`confirmCancel()` behind a completed survey.

Subscribers who click Manage plan land in this modal rather than the Dodo
portal (`managePlan()` → `showCancellationFlow()`), so in-app cancellations
all pass through here. Cancellations made directly in Dodo do not.
