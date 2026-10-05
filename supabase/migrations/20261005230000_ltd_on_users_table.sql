-- Lifetime deal, final shape. Applied live 5 Oct 2026. Spec: docs/ltd-campaign.md
--
-- The LTD state lives ON THE USER ROW. The existing Dodo payment flow
-- (dodo-webhook-handler) credits an LTD payment like any other and sets
--   ltd_monthly_credits = 2500 (Tier 1, pdt_0Np6hfk426N6l9EhVrFYO)
--                       = 7500 (Tier 2, pdt_0Np6hjktXBH06Wqf5OT5o)
-- Everything else follows from that column:
--   * trigger ltd_on_grant stamps ltd_topup_at and captures ltd_purchased to PostHog
--   * cron 'ltd-monthly-topup' (daily) refills up to the allotment once a month
--   * ltd_public_state() counts seats from it; ltd_eligibility() reads it
--   * a refund = set ltd_monthly_credits back to null (refills stop)
-- This supersedes the purchases-table path (ltd_purchases, ltd_fulfill,
-- ltd_reverse, ltd_claim, the ltd-webhook edge function), which never took a
-- payment and is left in place unused.
alter table public.linkfinderai_users add column if not exists ltd_monthly_credits integer;
alter table public.linkfinderai_users add column if not exists ltd_topup_at timestamptz;

create or replace function public.ltd_on_grant()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_price numeric;
begin
  if coalesce(new.ltd_monthly_credits, 0) > 0 and coalesce(old.ltd_monthly_credits, 0) = 0 then
    new.ltd_topup_at := now();
    select price_usd into v_price from ltd_tiers where monthly_credits = new.ltd_monthly_credits limit 1;
    begin
      perform net.http_post(
        url := 'https://us.i.posthog.com/capture/',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'api_key', 'phc_HqgzMyWAMtzH7K5j9CLw0dijB0I9W1VjPkkyzg9KOFG',
          'event', 'ltd_purchased',
          'distinct_id', new.token,
          'properties', jsonb_build_object('monthly_credits', new.ltd_monthly_credits,
                                           'value', v_price, 'revenue', v_price,
                                           'currency', 'USD', 'source', 'ltd_db_trigger')));
    exception when others then null;  -- analytics must never block a payment
    end;
  elsif coalesce(new.ltd_monthly_credits, 0) = 0 and coalesce(old.ltd_monthly_credits, 0) > 0 then
    new.ltd_topup_at := null;  -- removed / refunded: stop refilling
  end if;
  return new;
end;
$$;
drop trigger if exists ltd_on_grant on public.linkfinderai_users;
create trigger ltd_on_grant before update of ltd_monthly_credits on public.linkfinderai_users
  for each row execute function public.ltd_on_grant();

-- Monthly refill: balance raised UP TO the allotment, no rollover, bought credits untouched.
create or replace function public.ltd_monthly_topup()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update linkfinderai_users
     set credits = greatest(coalesce(credits, 0), ltd_monthly_credits),
         ltd_topup_at = now()
   where coalesce(ltd_monthly_credits, 0) > 0
     and coalesce(ltd_topup_at, '-infinity') <= now() - interval '1 month';
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.ltd_public_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'seats_left', greatest(s.seat_cap - (select count(*) from linkfinderai_users where coalesce(ltd_monthly_credits, 0) > 0), 0),
    'seat_cap', s.seat_cap,
    'ends_at', s.ends_at,
    'tiers', (select jsonb_agg(jsonb_build_object('key', tier_key, 'name', name, 'price', price_usd,
                     'monthly_credits', monthly_credits, 'product_id', dodo_product_id) order by price_usd)
                from ltd_tiers where active))
  from ltd_settings s;
$$;

-- Churned customers invited back on purpose (the only past payers who may buy).
create table if not exists public.ltd_allowlist (
  email text primary key,
  reason text not null,
  added_at timestamptz not null default now()
);
alter table public.ltd_allowlist enable row level security;
revoke all on public.ltd_allowlist from anon, authenticated;
insert into public.ltd_allowlist (email, reason) values
  ('jmichaud@endhunger.com','churned subscriber, win-back'),
  ('j.plakhotniuk@devotedstudios.com','churned subscriber, win-back'),
  ('itcrowd@resiin.com','churned subscriber, win-back'),
  ('team@fiber.ai','churned subscriber, win-back'),
  ('richard@verisq.ai','churned subscriber, win-back'),
  ('ranithamapatuna@anacacia.com.au','churned subscriber, win-back'),
  ('jimmy@brightmove.com','churned subscriber, win-back')
on conflict do nothing;

create or replace function public.ltd_eligibility(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u linkfinderai_users%rowtype;
begin
  if p_token is null or length(p_token) < 8 then return jsonb_build_object('known', false); end if;
  select * into u from linkfinderai_users where token = p_token limit 1;
  if not found then return jsonb_build_object('known', false); end if;
  return jsonb_build_object(
    'known', true,
    'has_ltd', coalesce(u.ltd_monthly_credits, 0) > 0,
    -- Past payers are refused, except the churned customers invited back on purpose.
    'paid_before', (u.subscription_id is not null or coalesce(u.is_unlimited, false)
                    or coalesce(u.customer_id, '') <> '' or coalesce(u.plan_type, 0) <> 0)
                   and not exists (select 1 from ltd_allowlist a where a.email = lower(u.email))
  );
end;
$$;
revoke all on function public.ltd_claim(text, text) from anon, authenticated;
