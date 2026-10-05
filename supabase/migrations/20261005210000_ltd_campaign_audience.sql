-- Lifetime-deal campaign audience. Applied live 5 Oct 2026. Spec: docs/ltd-campaign.md
--
-- Holds ONLY people it is safe to send a promo to:
--   * confirmed in auth.users (email_verified on linkfinderai_users is NOT
--     trustworthy, docs/email-verified-is-wrong.md);
--   * never paid in ANY system we know of: subscription_id, is_unlimited (pack
--     buyers), customer_id, plan_type, a balance above the free grant, or a
--     paying row in the legacy `users` table;
--   * not a colleague of a payer (same business domain);
--   * not us.
-- Synced into PostHog (warehouse table postgres_ltd_campaign_audience) where it
-- is crossed with geo to build the send cohorts. Rebuild with
--   select public.refresh_ltd_campaign_audience();
create table if not exists public.ltd_campaign_audience (
  email text primary key,
  google_signup boolean not null,
  enrichments integer not null default 0,
  refreshed_at timestamptz not null default now()
);
alter table public.ltd_campaign_audience enable row level security;
revoke all on public.ltd_campaign_audience from anon, authenticated;

create or replace function public.refresh_ltd_campaign_audience()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare n integer;
begin
  delete from public.ltd_campaign_audience;

  with consumer(d) as (values
    ('gmail.com'),('googlemail.com'),('yahoo.com'),('yahoo.fr'),('yahoo.co.uk'),('hotmail.com'),('hotmail.fr'),
    ('hotmail.co.uk'),('outlook.com'),('outlook.fr'),('live.com'),('live.fr'),('msn.com'),('icloud.com'),('me.com'),
    ('aol.com'),('proton.me'),('protonmail.com'),('gmx.com'),('gmx.de'),('gmx.net'),('web.de'),('mail.com'),
    ('yandex.com'),('yandex.ru'),('orange.fr'),('free.fr'),('sfr.fr'),('laposte.net'),('zoho.com'),('qq.com'),('163.com')),
  -- Every address that has EVER paid, in any system we know of.
  payers as (
    select lower(email) e from linkfinderai_users
     where subscription_id is not null
        or coalesce(is_unlimited, false)
        or coalesce(customer_id, '') <> ''
        or coalesce(plan_type, 0) <> 0
        or greatest(coalesce(credits, 0), coalesce(total_credit, 0)) > 150
    union
    select lower("Emails") from users
     where coalesce("Customer_id", '') <> '' or "Last_paiement" is not null or coalesce("Is_unlimited", false)
  ),
  -- Business domains of payers: a colleague of a paying customer is not a promo target.
  payer_domains as (
    select distinct split_part(e, '@', 2) d from payers
     where split_part(e, '@', 2) not in (select d from consumer)
  ),
  confirmed as (
    select lower(email) e, bool_or(confirmed_at is not null) ok from auth.users where email is not null group by 1
  ),
  usage as (
    select user_id, count(*)::int n from enrichment_history group by 1
  )
  insert into public.ltd_campaign_audience (email, google_signup, enrichments)
  select distinct on (lower(u.email)) lower(u.email), u.mdp is null, coalesce(h.n, 0)
    from linkfinderai_users u
    join confirmed c on c.e = lower(u.email) and c.ok
    left join usage h on h.user_id = u.token
   where u.email is not null
     and lower(u.email) not in (select e from payers where e is not null)
     and split_part(lower(u.email), '@', 2) not in (select d from payer_domains where d is not null)
     and lower(u.email) !~ '(hamoureliasse|eliasseiapro|linkfinderai|test)'
   order by lower(u.email), coalesce(h.n, 0) desc;

  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.refresh_ltd_campaign_audience() from public, anon, authenticated;

select public.refresh_ltd_campaign_audience();
