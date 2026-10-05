-- Lifetime deal fulfillment. Applied live 5 Oct 2026. Spec: docs/ltd-campaign.md
--
-- Dodo payment.succeeded -> edge function ltd-webhook -> ltd_fulfill()
-- Dodo refund/dispute    -> edge function ltd-webhook -> ltd_reverse()
-- pg_cron, daily         -> ltd_monthly_topup()
-- /lifetime-deal page    -> ltd_public_state(), ltd_eligibility()  (anon)
--
-- Prices, credits, Dodo product ids, the seat cap and the deadline all live in
-- these tables, so launching, extending or closing the deal is an UPDATE, not
-- a deploy.
create table if not exists public.ltd_tiers (
  tier_key text primary key,
  name text not null,
  price_usd numeric not null,
  monthly_credits integer not null,
  dodo_product_id text unique,          -- filled in once the Dodo product exists
  active boolean not null default true
);
insert into public.ltd_tiers (tier_key, name, price_usd, monthly_credits) values
  ('ltd_core', 'Lifetime Core', 149, 2500),
  ('ltd_plus', 'Lifetime Plus', 299, 7500)
on conflict (tier_key) do nothing;

create table if not exists public.ltd_settings (
  id boolean primary key default true check (id),
  seat_cap integer not null default 150,
  ends_at timestamptz                     -- set on launch day
);
insert into public.ltd_settings (id) values (true) on conflict do nothing;

create table if not exists public.ltd_purchases (
  payment_id text primary key,
  tier_key text not null references public.ltd_tiers(tier_key),
  monthly_credits integer not null,
  amount_usd numeric,
  customer_email text,
  dodo_customer_id text,
  user_token text,                        -- null while unmatched
  status text not null default 'active' check (status in ('active','unmatched','refunded','disputed')),
  purchased_at timestamptz not null default now(),
  last_topup_at timestamptz,
  attribution_source text,
  attribution_campaign text
);
create index if not exists ltd_purchases_token on public.ltd_purchases(user_token);

alter table public.ltd_tiers enable row level security;
alter table public.ltd_settings enable row level security;
alter table public.ltd_purchases enable row level security;
revoke all on public.ltd_tiers, public.ltd_settings, public.ltd_purchases from anon, authenticated;

-- Public: what the sales page needs, nothing else.
create or replace function public.ltd_public_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'seats_left', greatest(s.seat_cap - (select count(*) from ltd_purchases where status in ('active','unmatched')), 0),
    'seat_cap', s.seat_cap,
    'ends_at', s.ends_at,
    'tiers', (select jsonb_agg(jsonb_build_object('key', tier_key, 'name', name, 'price', price_usd,
                     'monthly_credits', monthly_credits, 'product_id', dodo_product_id) order by price_usd)
                from ltd_tiers where active))
  from ltd_settings s;
$$;

-- Public, keyed by the caller's own token: is this account allowed to buy?
-- Anyone who has ever paid is refused, so a forwarded email cannot turn into a refund request.
create or replace function public.ltd_eligibility(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u linkfinderai_users%rowtype;
begin
  if p_token is null or length(p_token) < 8 then return jsonb_build_object('known', false); end if;
  select * into u from linkfinderai_users where token = p_token limit 1;
  if not found then return jsonb_build_object('known', false); end if;
  return jsonb_build_object(
    'known', true,
    'has_ltd', exists (select 1 from ltd_purchases where user_token = p_token and status = 'active'),
    'paid_before', (u.subscription_id is not null or coalesce(u.is_unlimited, false)
                    or coalesce(u.customer_id, '') <> '' or coalesce(u.plan_type, 0) <> 0)
  );
end;
$$;
grant execute on function public.ltd_public_state() to anon, authenticated;
grant execute on function public.ltd_eligibility(text) to anon, authenticated;

-- Called by the webhook (service role) after a verified payment. Idempotent on payment_id.
create or replace function public.ltd_fulfill(
  p_payment_id text, p_product_id text, p_amount_usd numeric, p_email text,
  p_dodo_customer_id text, p_token text, p_source text, p_campaign text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t ltd_tiers%rowtype; v_token text; v_status text;
begin
  if exists (select 1 from ltd_purchases where payment_id = p_payment_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  select * into t from ltd_tiers where dodo_product_id = p_product_id;
  if not found then return jsonb_build_object('ok', true, 'ignored', 'not an ltd product'); end if;

  -- Match the account: token from checkout metadata first, then the payer's email.
  select token into v_token from linkfinderai_users where p_token is not null and token = p_token limit 1;
  if v_token is null and p_email is not null then
    select token into v_token from linkfinderai_users where lower(email) = lower(p_email)
     order by coalesce(credits, 0) desc limit 1;
  end if;
  v_status := case when v_token is null then 'unmatched' else 'active' end;

  insert into ltd_purchases (payment_id, tier_key, monthly_credits, amount_usd, customer_email, dodo_customer_id,
                             user_token, status, last_topup_at, attribution_source, attribution_campaign)
  values (p_payment_id, t.tier_key, t.monthly_credits, p_amount_usd, lower(p_email), p_dodo_customer_id,
          v_token, v_status, case when v_token is null then null else now() end, p_source, p_campaign);

  if v_token is not null then
    update linkfinderai_users
       set credits = coalesce(credits, 0) + t.monthly_credits,
           is_unlimited = true,   -- same marker credit-pack buyers carry: "has paid"
           customer_id = coalesce(nullif(customer_id, ''), p_dodo_customer_id)
     where token = v_token;
  end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'tier', t.tier_key, 'user_token', v_token,
                            'monthly_credits', t.monthly_credits);
end;
$$;

-- Refund / dispute: stop the lifetime allotment and take back this month's grant.
create or replace function public.ltd_reverse(p_payment_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p ltd_purchases%rowtype;
begin
  select * into p from ltd_purchases where payment_id = p_payment_id;
  if not found or p.status in ('refunded','disputed') then return jsonb_build_object('ok', true, 'noop', true); end if;
  update ltd_purchases set status = case when p_reason = 'dispute' then 'disputed' else 'refunded' end
   where payment_id = p_payment_id;
  if p.user_token is not null then
    update linkfinderai_users set credits = greatest(coalesce(credits, 0) - p.monthly_credits, 0)
     where token = p.user_token;
  end if;
  return jsonb_build_object('ok', true, 'user_token', p.user_token, 'tier', p.tier_key);
end;
$$;

-- Monthly: each active LTD account is topped back UP TO its allotment (no rollover,
-- and credits bought separately are never taken away).
create or replace function public.ltd_monthly_topup()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with due as (
    select user_token, sum(monthly_credits) allot
      from ltd_purchases
     where status = 'active' and user_token is not null
       and last_topup_at <= now() - interval '1 month'
     group by user_token
  ), upd as (
    update linkfinderai_users u set credits = greatest(coalesce(u.credits, 0), d.allot)
      from due d where u.token = d.user_token
    returning u.token
  )
  select count(*) into n from upd;
  update ltd_purchases set last_topup_at = now()
   where status = 'active' and user_token is not null and last_topup_at <= now() - interval '1 month';
  return n;
end;
$$;
revoke all on function public.ltd_fulfill(text,text,numeric,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.ltd_reverse(text,text) from public, anon, authenticated;
revoke all on function public.ltd_monthly_topup() from public, anon, authenticated;
grant execute on function public.ltd_fulfill(text,text,numeric,text,text,text,text,text), public.ltd_reverse(text,text), public.ltd_monthly_topup() to service_role;
grant select, insert, update on public.ltd_purchases to service_role;
grant select on public.ltd_tiers, public.ltd_settings to service_role;

select cron.schedule('ltd-monthly-topup', '17 3 * * *', $$select public.ltd_monthly_topup()$$);
