-- Black Friday 2026: one row per lifetime-deal payment, with the channel that
-- sold it (docs/black-friday-ltd-2026.md, "Tracking"). Written by the n8n
-- "upgrade dodo" grant node (Postgres46) from the Dodo payment.succeeded payload:
--   source / campaign / content  = the click that brought the buyer to /lifetime-deal
--   first_source / first_campaign = how the buyer first found LinkFinder
-- Partner code sales (InfoStack, AppSumo) are in appsumo_codes, not here.

create table if not exists ltd_sales (
  payment_id      text primary key,
  created_at      timestamptz not null default now(),
  product_id      text,
  tier_key        text,
  amount_usd      numeric,
  email           text,
  user_token      text,
  source          text,
  campaign        text,
  content         text,
  first_source    text,
  first_campaign  text
);
alter table ltd_sales enable row level security;

create or replace function ltd_record_sale(
  p_payment_id text, p_product_id text, p_amount_cents numeric, p_email text, p_token text,
  p_source text, p_campaign text, p_content text, p_first_source text, p_first_campaign text)
returns void language sql security definer set search_path = public as $$
  insert into ltd_sales (payment_id, product_id, tier_key, amount_usd, email, user_token,
                         source, campaign, content, first_source, first_campaign)
  select p_payment_id, p_product_id, s.tier_key, p_amount_cents / 100.0, nullif(p_email, ''),
         nullif(p_token, ''), nullif(p_source, ''), nullif(p_campaign, ''), nullif(p_content, ''),
         nullif(p_first_source, ''), nullif(p_first_campaign, '')
    from (select 1) one left join ltd_price_steps s on s.dodo_product_id = p_product_id
  on conflict (payment_id) do nothing;
$$;
revoke all on function ltd_record_sale(text, text, numeric, text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- Channel report: what to look at each morning of Black Friday week.
create or replace view ltd_sales_by_channel as
  select (created_at at time zone 'Europe/Paris')::date as day,
         coalesce(source, '(none)') as source,
         coalesce(first_source, '(none)') as first_source,
         count(*) as sales,
         sum(amount_usd) as revenue_usd
    from ltd_sales
   where payment_id not like 'pay_LTDTEST%'
   group by 1, 2, 3
   order by 1 desc, revenue_usd desc;
alter view ltd_sales_by_channel set (security_invoker = true);
revoke all on ltd_sales_by_channel from public, anon, authenticated;
