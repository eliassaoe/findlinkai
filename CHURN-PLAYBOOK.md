# Churn playbook — behavioural triggers for paying subscribers

**Built:** 2026-08-25 · **Sources:** PostHog project 263837, Supabase `snxhsboboatjywgwdeds`

Session is ephemeral. This file is the only record — update it when the plays change.

---

## The number this exists to fix

| | |
| --- | --- |
| Subscribers | 31 |
| MRR | $1,939 |
| Active in last 30d | **5** |
| Slipping (14–30d) | 3 |
| Dormant (30d+) | 22 |
| Never ran anything | 1 |
| **MRR sitting in dormant accounts** | **$1,467 — 76%** |

Churn is ~6.5%/mo. At that rate the acquisition ceiling is ~108 subscribers no
matter how much traffic arrives. This is the constraint on everything else.

---

## PostHog cohorts (live, dynamic — recalculate automatically)

| Cohort | ID | Definition | Play |
| --- | --- | --- | --- |
| [Paid · silent 14d (churn warning)](https://us.posthog.com/project/263837/cohorts/514740) | 514740 | Paid or renewed in 365d, **no** `enrich_started` in 14d | In-app nudge, light email |
| [Paid · silent 30d (churn critical)](https://us.posthog.com/project/263837/cohorts/514741) | 514741 | Paid or renewed in 365d, **no** `enrich_started` in 30d | Personal email → offer a call |
| [Paid · never activated](https://us.posthog.com/project/263837/cohorts/514742) | 514742 | Paid in 365d, **never** ran an enrichment | Personal email, run their first list live |

Each is `(checkout_payment_success OR subscription_renewed) AND NOT enrich_started`.
`subscription_renewed` is in the positive leg deliberately — `checkout_payment_success`
only started firing around May 2026, so payment alone misses older subscribers.

### Coverage caveat — read before any send

`enrich_started` is a front-end event. Over 30 days PostHog saw **510 unique
enrichers vs 556 in the database (92%)** — good enough for presence/absence, which is
all a churn cohort needs. But it saw **2,750 events against 20,428 database rows
(13%)**, because one bulk run is many rows. So:

- **Membership is reliable. Volume is not.** Never rank or score off PostHog event counts.
- ~8% of active users are invisible here — likely API/MCP-only. **Verify against
  Supabase before emailing anyone**, or you will tell a happy API customer you miss them.

```sql
-- ground truth for one person (join on token, NOT email)
select u.email, max(h.timestamp) as last_used, count(h.*) as runs
from linkfinderai_users u
left join enrichment_history h on h.user_id = u.token
where u.email = '<address>' group by u.email;
```

---

## Three archetypes, three different messages

Splitting the 23 dormant accounts by lifetime usage shows they are not one problem:

### A · Never got started — ~12 accounts, ≤10 runs ever

Paid, ran a handful of lookups, stopped. One never ran anything at all. Several still
hold their entire allowance (5,000 of 5,000 credits).

**This is an onboarding failure, not disengagement.** They never reached value once.

> **Play:** personal email offering to run their first real list *with* them — live,
> 15 minutes, screen shared. Not a feature tour. Not a menu of capabilities. One
> completed list, on their own data.

### B · Power user who vanished — ~8 accounts, 400–9,000 runs ever

The most alarming group. One Enterprise account ran 4,999 lookups then went silent 52
days ago with 46,267 credits untouched. A Professional account ran 9,058 and stopped 74
days ago.

These people got real value and left anyway. **The reason is worth more than the save.**

> **Play:** short personal founder email. One question: what changed? No offer, no
> discount, no pitch. Whatever comes back is the highest-value product input available
> right now — it explains the other 22.

### C · Hit the credit wall — ~4 accounts, 0 credits remaining

Burned the entire allowance, then stopped. Includes a Starter who ran 3,912 lookups and
has been dormant 98 days with nothing left in the tank.

**This is not churn prevention — it is a missed upgrade.** They wanted more and the
product said no.

> **Play:** show them what they burned through, then the next tier or a pack. This is
> the only archetype where a commercial ask is the right first move.

---

## What to cut from the tactic list

Judgement calls, stated plainly so they can be argued with:

- **Do not pitch the high-ticket offer to dormant subscribers.** Asking for a larger
  commitment from someone who has not used the one they already bought reads as
  extraction. Hold it for archetype B *after* they re-engage.
- **Do not ask dormant users to share or refer.** Advocacy asks go to the 5 healthy
  accounts. From a dormant account it lands as tone-deaf.
- **Do not blast feature education (API / MCP / phone / email finding) to everyone.**
  For archetype A it is noise on top of a failure to get started once. Feature breadth
  is an archetype-B message, after the "what changed" reply.
- **Do not automate this month.** 23 people is a hand-written-email problem. Build the
  automation so it fires from month two, on people who become dormant *after* the
  backlog is cleared.

---

## Sequencing

| When | Action |
| --- | --- |
| This week | 23 hand-written emails, split by archetype. Verify each against Supabase first. |
| Week 2 | Log every reply. Archetype B answers set the product roadmap. |
| Week 2–3 | Wire cohort 514740 → in-app nudge (feature flag gate) and a PostHog workflow email. |
| Week 3–4 | Wire cohort 514741 → founder-email workflow with a call link. |
| Ongoing | Track `active_30d / subscribers` weekly. That ratio is the churn leading indicator, not churn itself. |

PostHog messaging is already live in this project (`$workflows_email_sent`,
`$workflows_email_delivered`, `$workflows_email_opened` are all firing), so cohort →
workflow needs no new infrastructure.

---

## Data caveats found while building this

- **`enrichment_history.credits_used` is always 1**, in every row, for every enrichment
  type — including 50-credit phone lookups. It counts *runs*, not credits. Do not build
  billing, scoring, or reporting on it. Use `linkfinderai_users.credits` (remaining) for
  real consumption; it corroborates the inactivity finding independently.
- **Join key is `token`.** `enrichment_history.user_id` = `linkfinderai_users.token`,
  never `email`. The email join returns zero rows silently and looks like total
  inactivity across the whole base.
- **No subscription data in PostHog.** There is no `plan_type` or `subscription_id`
  person property, and `$virt_mrr` is unpopulated. Cohorts must stay behavioural, or
  the fields need pushing into PostHog person properties first.

## The list itself

Deliberately not committed — it is customer PII and this repo is a website. Pull it live:

```sql
with subs as (
  select email, token, plan_type,
         case plan_type when 1 then 49 when 2 then 89 when 3 then 149 else 49 end as mrr
  from linkfinderai_users where subscription_id is not null
), act as (
  select user_id, max(timestamp) as last_used, count(*) as runs_ever,
         mode() within group (order by type) as most_used
  from enrichment_history group by user_id
)
select s.email, s.plan_type, s.mrr,
       coalesce(round(extract(epoch from (now()-a.last_used))/86400)::text,'never') as days_dormant,
       coalesce(a.runs_ever,0) as runs_ever, coalesce(a.most_used,'—') as most_used,
       case when a.last_used is null or coalesce(a.runs_ever,0) <= 10 then 'A_never_started'
            when a.runs_ever > 400 then 'B_power_user_vanished'
            else 'C_check_credits' end as archetype
from subs s left join act a on a.user_id = s.token
where a.last_used is null or a.last_used < now() - interval '14 days'
order by s.mrr desc, a.last_used asc;
```

The same people are listed with emails in the three PostHog cohorts linked above.
