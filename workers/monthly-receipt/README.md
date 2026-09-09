# Monthly value receipt

Once a month, everyone who ran lookups gets one email: what LinkFinder found
for them, by kind, with a link to the account page section that shows it and
to the history that holds the rows.

It exists because the number one cancellation reason is "not using" and the
only place the product ever showed someone what it had done for them was the
account page — which people mostly open to cancel.

## The pieces

| Piece | Where | Does |
| --- | --- | --- |
| `monthly_value_receipts(p_days)` | Supabase RPC (SQL below), service role only | One row per account with a lookup in the period: `token`, `email`, `is_subscriber`, `plan_type`, `lookups`, `csv_batches`, and `summary` = `user_value_summary(token)` — the same function the account page calls, so the two can never disagree |
| `worker.js` | this directory, cron `0 8 1 * *` | Calls the RPC, builds one receipt per account, **skips anyone with nothing found**, captures `monthly_value_receipt` to PostHog with the numbers as properties |
| Workflow 12 | PostHog, `workers/lifecycle-email/route_workflows.py --print receipt` | Fires on that event and sends the email; copy in `variants.json` step `monthly_receipt`, liquid `{{ event.properties.* }}` |
| `#what-you-found` | `account.html` | The email's button lands on the "What you've found" section, scrolled into view once it has loaded |

## Event properties

`found_total`, `found_all_time`, `lookups`, `csv_batches`, `emails`, `phones`,
`profiles`, `profiles_full`, `websites`, `companies`, `people`, `hours_saved`
(found × 2 minutes, one decimal), `is_subscriber`, `plan_type`, `month_label`
("August"), `month_key` ("2026-08"), `period_days`, `account_url`, `history_url`.

`found_total` is the sum of the seven categories the account page shows.
`other` is counted by the RPC and shown nowhere, same as the page
(`docs/account-value-summary.md`).

## Deploy

```
cd workers/monthly-receipt
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put POSTHOG_API_KEY        # the phc_ project token
wrangler secret put ADMIN_API_KEY
wrangler deploy
```

Preview without sending anything:

```
curl -H "Authorization: Bearer $ADMIN_API_KEY" "https://monthly-receipt.<account>.workers.dev/run?dry=1"
```

That returns the counts and a sample of twenty receipts with the token-bearing
URLs stripped. Drop `dry=1` to capture for real outside the schedule (the
PostHog workflow's 25-day per-person mask stops a double send).

Then in PostHog: open workflow 12, **Test run** it with a real
`monthly_value_receipt` event, check the numbers render, and enable it. A draft
never sends.

## The RPC

Applied to project `snxhsboboatjywgwdeds` on 9 Sep 2026.

```sql
create or replace function public.monthly_value_receipts(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
with active as (
    select user_id, count(*) as lookups
      from public.enrichment_history
     where "timestamp" > now() - make_interval(days => p_days)
     group by user_id
),
batches as (
    select user_id, count(*) as n
      from public.csv_enrichment_batches
     where started_at > now() - make_interval(days => p_days)
     group by user_id
)
select coalesce(jsonb_agg(jsonb_build_object(
    'token',         u.token,
    'email',         u.email,
    'is_subscriber', (u.subscription_id is not null) or coalesce(u.is_unlimited, false),
    'plan_type',     u.plan_type,
    'lookups',       a.lookups,
    'csv_batches',   coalesce(b.n, 0),
    'summary',       public.user_value_summary(u.token)
)), '[]'::jsonb)
  from active a
  join public.linkfinderai_users u on u.token = a.user_id
  left join batches b on b.user_id = a.user_id
 where coalesce(u.email, '') <> '';
$$;

revoke all on function public.monthly_value_receipts(integer) from public;
revoke all on function public.monthly_value_receipts(integer) from anon, authenticated;
grant execute on function public.monthly_value_receipts(integer) to service_role;
```

## Things to know

- **Nobody gets a receipt for zero.** `MIN_FOUND` (default 1) is the floor. A
  month with lookups but nothing found is not a receipt, it is a support
  case; and a month with no lookups is workflow 11's job.
- The event carries the session token in `account_url` and `history_url`,
  because that is how every link into the app works (`?token=`). The dry-run
  preview strips them for that reason.
- `user_value_summary`'s `last_30` window is fixed at 30 days. `PERIOD_DAYS`
  changes which accounts are *listed* and the lookup count, not the found
  counts. Leave it at 30.
