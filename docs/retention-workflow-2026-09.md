# Retention for people who are already paying

**Built:** 2026-09-03 · **Sources:** Supabase `snxhsboboatjywgwdeds`, PostHog 263837

## The gap this closes

`workers/lifecycle-email/` is a real, running system: six live workflows, 30 copy
variants, a Monday optimisation Routine, a verified sending domain. It sends
24-226 emails a day.

**None of it could reach a paying customer.** Every event-triggered workflow
(1, 2, 3, 5, 6, 7b, 8, 9) carries a payment conversion goal with
`exit_on_conversion`, so a payer exits before the email composes. The win-back
cohorts go further and exclude "anyone who has ever paid" outright. That is
correct design for acquisition mail, and it meant the retention surface was
empty.

`CHURN-PLAYBOOK.md` built three cohorts for exactly this on 2026-08-25 —
514740, 514741, 514742. **They were referenced by zero workflows.** Its own
sequencing put the wiring in "week 2-3"; it never happened.

## Do not solve this with the reactivation sequence

`variants.json` already carries `reactivation_1` … `reactivation_10` — ten
emails over three months, fully written, all with `workflow_id: null`. It is
tempting to point them at dormant subscribers. **Do not.**

That sequence is written for churned and lapsed **free** users:

- `reactivation_1`: *"the product asked too much of you too early: a
  subscription before you knew what you had… You do not need a subscription."*
- `reactivation_3`: subject *"you probably did not want a subscription"*, then
  the three credit packs.

To a live subscriber that is a downgrade pitch. Sent to the current dormant set
it puts **~$1,507/mo of MRR** in front of a cheaper alternative. The two
audiences need opposite messages, which is why this is a separate step and not
an eleventh email on that one.

## What was built

| Thing | Id |
| --- | --- |
| Static cohort — Retention wave A | `544780` (12 people) |
| Workflow — Retention, paid silent 30d | `01a06709-9007-0000-9d2f-a4d218fcee40` |
| Copy step in `variants.json` | `retention`, 4 variants, champion `retention-question` |
| Skeleton generator | `workers/lifecycle-email/new_email.py` |

**Status: DRAFT. Nothing has been sent.** A batch trigger does not fire on
enable — dispatch is deliberate, via `workflows-run-batch`.

Blast radius verified at **12**.

### Why a static cohort and not 514741

`workflows-create` rejects it:

    Cohort 'Paid · silent 30d (churn critical)' targets event behavior,
    which batch/schedule audiences can't evaluate.

So the README's warning is enforced by the API, not just convention. The
replacement is better anyway: cohort 544780 is built from **Supabase ground
truth** — `linkfinderai_users` joined to `enrichment_history` on `token`, never
`email` — which counts API and MCP runs. `enrich_started` is a front-end event,
so the behavioural cohort flags API-only customers as dormant when they are the
opposite. That is the failure `CHURN-PLAYBOOK.md` warns about and this avoids
it structurally.

### The copy

Champion is `retention-question`, subject **"what changed?"** — archetype B's
play: one question, no offer, no upsell. A dormant payer has already bought;
asking for more reads as extraction, and the reason they left is worth more
than the save.

Three queued variants: `retention-empathy` (archetype A, offers to build the
first list live), `retention-specific` (**blocked** — needs a person property
carrying the credit balance or it renders a Liquid fallback), and
`retention-permission` ("want me to pause it?" — honest, and it will surface
cancellations; do not promote it without deciding you can absorb them).

## The 23, and who the workflow cannot reach

Dormant = subscriber, and either never ran anything or last run over 30 days
ago. **23 of 31 subscribers. $1,507 of ~$1,939 MRR.**

| Archetype | Accounts | MRR | Shape |
| --- | --- | --- | --- |
| B — power user vanished | 10 | $669 | avg 2,221 runs, silent 60-107 days |
| A — never got started | 9 | $441 | avg 3 runs ever, allowance intact |
| D — hit the credit wall | 3 | $227 | 0 credits left; a missed upgrade, not churn |
| C — never ran | 1 | $49 | |

The workflow reaches **12**. The other **11 need a hand-written email**, and the
reasons matter:

- **5 are auth-confirmed but have no PostHog person profile at all**, so no
  workflow can ever reach them. One is an $89 account with **9,058 lifetime
  lookups**. These are most likely the API/MCP-only users the playbook predicted.
- **5 have a profile but `auth.users.confirmed_at IS NULL`**, held back from
  wave A on deliverability. This group contains **the single most valuable
  dormant account on the property**: $149 Enterprise, 4,999 lookups, 46,267
  credits untouched, silent 60 days. Write to that one personally regardless of
  what the workflow does.
- **1 is neither.**

Two data notes found while building this:

- **6 accounts carry the literal string `"undefined"` as `first_name`.** Any
  `{{ first_name }}` template greets them "Hi undefined". Every variant here is
  nameless by design, so it does not bite today.
- **Three of the 23 are competitors or adjacent vendors.** Worth knowing before
  "what changed?" goes out under your own name.

Addresses are not committed — customer PII does not belong in this repo. Regenerate:

```sql
with h as (
  select user_id, count(*) runs, max(timestamp) last_run
  from enrichment_history group by user_id
)
select u.email, u.plan_type, coalesce(h.runs,0) runs_ever,
       extract(day from now() - h.last_run)::int days_silent,
       u.credits, (au.confirmed_at is not null) as auth_confirmed
from linkfinderai_users u
left join h on h.user_id = u.token
left join auth.users au on lower(au.email) = lower(u.email)
where u.subscription_id is not null
  and (coalesce(h.runs,0) = 0 or h.last_run < now() - interval '30 days')
order by u.plan_type desc, days_silent desc;
```

## Before dispatching

1. **Re-verify dormancy.** The cohort is a snapshot from 2026-09-03. Anyone who
   came back since is still in it. Re-run the SQL above.
2. **Watch bounces.** Wave A is 12 addresses, all `confirmed_at`-gated. The VIP
   campaign hit **5.3%**, which `NEW_CAMPAIGNS.md` calls "right on the SES
   review threshold". Above 2% here, stop before wave B.
3. **Replies are the metric.** Opens are bot-flagged in this project and the
   goal event is `enrich_started`, not a click.
4. **Then wave B** — the 5 auth-unconfirmed, only if wave A bounces are clean.

## Wire the recurring version afterwards

This first batch clears a backlog. To stop it recurring by hand, attach a
schedule to the same workflow with `workflows-schedule-create` (batch triggers
re-broadcast to their audience on every firing) and swap the trigger to a
**static cohort refreshed from the SQL above**, not to 514741 — the API will
keep rejecting that. `trigger_masking` is already set to `{person.id}` at 90
days, so nobody can be nagged twice in a quarter.

Track `active_30d / subscribers` weekly. That ratio is the churn leading
indicator, not churn itself. It is **8 / 31** today.
