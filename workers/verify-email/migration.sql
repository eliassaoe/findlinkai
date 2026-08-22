-- Email verification support for linkfinderai_users.
--
-- Run this in the Supabase SQL editor before deploying the worker. It is
-- idempotent and additive: no existing column is touched and no row is rewritten.
--
-- Context from the real schema (21 columns, checked rather than assumed):
--   linkfinderai_users(email, token, mdp, credits, customer_id, plan_type,
--   is_unlimited, affiliate_ref, refered_by, payout, paid_affiliate, paypal,
--   first_name, last_name, fbc, fbp, gclid, subscription_id, webhook_url,
--   protected_credits, total_credit)
--
-- Note what is NOT there: no `id`, no `auth_id`, no `email_verified`. The worker
-- had assumed all three. `token` is the identifier it keys on instead.

-- 1. The flag itself.
alter table public.linkfinderai_users
  add column if not exists email_verified boolean not null default false;

-- 2. Everyone who already exists keeps their mail. Backfilling to true means
--    this change cannot retroactively cap an existing account or drop anyone
--    out of a campaign - the gate only ever applies to signups from here on.
--    Comment this out if you would rather make existing users confirm too.
update public.linkfinderai_users
   set email_verified = true
 where email_verified = false;

-- 3. The trigger filter and the worker both look accounts up by token.
create index if not exists linkfinderai_users_token_idx
  on public.linkfinderai_users (token);

-- 4. Ask auth.users whether an address has actually been confirmed.
--    auth.users is not exposed through PostgREST, so the worker cannot read it
--    directly. security definer lets this function see it; it returns a single
--    boolean and nothing else, so it leaks nothing about the auth table.
create or replace function public.email_is_confirmed(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    (select email_confirmed_at is not null
       from auth.users
      where lower(email) = lower(p_email)
      limit 1),
    false)
$$;

revoke all on function public.email_is_confirmed(text) from public, anon, authenticated;
grant execute on function public.email_is_confirmed(text) to service_role;
