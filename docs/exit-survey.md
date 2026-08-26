# Cancellation exit survey

Three questions, one screen at a time, between the retention offers and the
cancel button on `account.html`. Copied in shape from Instantly's: the button
that used to cancel now reads **Finish cancellation** and opens the form, and
the real **Cancel my subscription** button sits on the screen after it.

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
| `exit_survey_started` | Finish cancellation clicked | `reason` |
| `exit_survey_answered` | each answer, including re-answers after Back | `question`, `answer`, `answer_text` |
| `exit_survey_question_skipped` | Skip this question | `question` |
| `exit_survey_abandoned` | modal closed mid-survey | `last_question`, `answered_count` |
| `exit_survey_completed` | last question resolved | `usage`, `cause`, `destination`, `*_text`, `answered_count`, `reason` |

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

## Rules

**Every question is skippable and the cancel button is always the next
screen.** A survey someone is trapped in returns whatever gets them out
fastest, which is worse than no data at all. Do not gate `confirmCancel()`
behind a completed survey.

Subscribers who click Manage plan land in this modal rather than the Dodo
portal (`managePlan()` → `showCancellationFlow()`), so in-app cancellations
all pass through here. Cancellations made directly in Dodo do not.
