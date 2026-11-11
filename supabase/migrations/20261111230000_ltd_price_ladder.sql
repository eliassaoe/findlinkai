-- Black Friday 2026 lifetime deal: price ladder + Agency tier (owner, 11 Nov 2026).
-- docs/black-friday-ltd-2026.md, "Price ladder".
--
--   Core   2,500 cr/mo   $149 (first 50 sold) -> $179 (next 50) -> $199
--   Plus   7,500 cr/mo   $299 (no ladder)
--   Agency 25,000 cr/mo  $599 (first 10) -> $699 (next 15) -> $799
--
-- One Dodo product per price step. The page reads the current step from
-- ltd_public_state(); the n8n "upgrade dodo" grant node asks
-- ltd_credits_for_product(product_id) how many monthly credits a product gives.
-- Agency credits are reset up to 25,000 each month (no rollover); Core/Plus
-- keep the existing additive refill.

insert into ltd_tiers (tier_key, name, price_usd, monthly_credits, dodo_product_id, active)
values ('ltd_agency', 'Lifetime Agency', 599, 25000, 'pdt_0Nrk1CAeR4RthDkU58OL6', true)
on conflict (tier_key) do update set name = excluded.name, price_usd = excluded.price_usd,
  monthly_credits = excluded.monthly_credits, dodo_product_id = excluded.dodo_product_id, active = true;

create table if not exists ltd_price_steps (
  dodo_product_id text primary key,
  tier_key        text not null references ltd_tiers (tier_key),
  step            int  not null,
  sales_through   int,            -- cumulative sales at which this step ends; null = last step
  price_usd       numeric not null,
  unique (tier_key, step)
);
alter table ltd_price_steps enable row level security;

insert into ltd_price_steps (dodo_product_id, tier_key, step, sales_through, price_usd) values
  ('pdt_0Np6hfk426N6l9EhVrFYO', 'ltd_core',   1, 50,   149),
  ('pdt_0Nrk0zRIGgPyuicb1YawD', 'ltd_core',   2, 100,  179),
  ('pdt_0Nrk16AWNOG8WwyM8ydyN', 'ltd_core',   3, null, 199),
  ('pdt_0Np6hjktXBH06Wqf5OT5o', 'ltd_plus',   1, null, 299),
  ('pdt_0Nrk1CAeR4RthDkU58OL6', 'ltd_agency', 1, 10,   599),
  ('pdt_0Nrk1GkNaPFgE4eM6Icn4', 'ltd_agency', 2, 25,   699),
  ('pdt_0Nrk1K7pLE4Mr6oxcocYY', 'ltd_agency', 3, null, 799)
on conflict (dodo_product_id) do update set tier_key = excluded.tier_key, step = excluded.step,
  sales_through = excluded.sales_through, price_usd = excluded.price_usd;

-- Sales per tier = accounts holding that tier's monthly allowance. Partner codes
-- (10,000) and AppSumo never match a tier amount.
create or replace function ltd_tier_sales(p_tier text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from linkfinderai_users u join ltd_tiers t on t.tier_key = p_tier
   where u.ltd_monthly_credits = t.monthly_credits;
$$;
revoke all on function ltd_tier_sales(text) from public, anon, authenticated;

create or replace function ltd_credits_for_product(p_product text) returns int
language sql stable security definer set search_path = public as $$
  select t.monthly_credits from ltd_price_steps s join ltd_tiers t using (tier_key)
   where s.dodo_product_id = p_product;
$$;
revoke all on function ltd_credits_for_product(text) from public, anon, authenticated;

create or replace function ltd_public_state() returns jsonb
language sql stable security definer set search_path = public as $$
  with sold as (select tier_key, ltd_tier_sales(tier_key) n from ltd_tiers where active),
  cur as (
    select distinct on (s.tier_key) s.tier_key, s.step, s.price_usd, s.dodo_product_id, s.sales_through, so.n
      from ltd_price_steps s join sold so using (tier_key)
     where s.sales_through is null or s.sales_through > so.n
     order by s.tier_key, s.step
  ),
  nxt as (
    select c.tier_key, (select price_usd from ltd_price_steps x where x.tier_key = c.tier_key and x.step = c.step + 1) next_price
      from cur c
  )
  select jsonb_build_object(
    'seats_left', greatest(s.seat_cap - (select count(*) from linkfinderai_users where coalesce(ltd_monthly_credits, 0) > 0), 0),
    'seat_cap', s.seat_cap,
    'ends_at', s.ends_at,
    'tiers', (select jsonb_agg(jsonb_build_object(
                'key', t.tier_key, 'name', t.name,
                'price', coalesce(c.price_usd, t.price_usd),
                'monthly_credits', t.monthly_credits,
                'product_id', coalesce(c.dodo_product_id, t.dodo_product_id),
                'step', c.step,
                'left_at_price', case when c.sales_through is not null then c.sales_through - c.n end,
                'next_price', nx.next_price) order by t.monthly_credits)
              from ltd_tiers t left join cur c using (tier_key) left join nxt nx using (tier_key)
             where t.active))
  from ltd_settings s;
$$;

-- Agency: refill up to 25,000 (no rollover). Core/Plus/partners: unchanged (additive).
create or replace function ltd_monthly_topup() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update linkfinderai_users
     set credits = case when ltd_monthly_credits = 25000
                        then greatest(coalesce(credits, 0), 25000)
                        else coalesce(credits, 0) + ltd_monthly_credits end,
         ltd_topup_at = now()
   where coalesce(ltd_monthly_credits, 0) > 0
     and coalesce(ltd_topup_at, '-infinity') <= now() - interval '1 month';
  get diagnostics n = row_count;
  return n;
end; $$;
