-- ===========================================================================
-- Referral program v2: sale alerts + monthly partner statement
-- ===========================================================================
--
-- Apply after schema.sql. Already applied to the live project as the Supabase
-- migration `referral_partner_alerts`.
--
-- Nothing here changes what a partner is paid (worker.js owns that). It adds:
--   - referral_sale / referral_refund events to PostHog on every commission
--     written or voided; workflow "Internal — referral sale → email Eliasse"
--     turns each into an email to support@linkfinderai.com
--   - referral_payment_unrecorded: hourly safety net for a referred user who
--     has paid but has no commission (the Dodo webhook never reached the
--     worker); alerted once per user
--   - referral_partner_monthly, the numbers for each partner's statement

create or replace function referral_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_event         text;
    v_code          text;
    v_partner_email text;
    v_customer      text;
    v_n             int;
    v_total         numeric;
    v_customer_n    int;
begin
    if tg_op = 'INSERT' then
        v_event := 'referral_sale';
    elsif tg_op = 'UPDATE' and new.status = 'void' and old.status <> 'void' then
        v_event := 'referral_refund';
    else
        return new;
    end if;

    select code into v_code from referral_partners where user_id = new.partner_user_id;
    select email into v_partner_email from linkfinderai_users where token = new.partner_user_id limit 1;
    select referred_email into v_customer from referral_attributions
     where referred_user_id = new.referred_user_id;
    select count(*), coalesce(sum(commission_amount), 0) into v_n, v_total
      from referral_commissions
     where partner_user_id = new.partner_user_id and status <> 'void';
    -- 1 = this referred customer's first paid commission (new customer);
    -- more = a renewal. The email subject says which.
    select count(*) into v_customer_n
      from referral_commissions
     where referred_user_id = new.referred_user_id and status <> 'void';

    -- A failed alert must never fail the commission write: pg_net only queues
    -- the request, and anything raised here is swallowed.
    begin
        perform net.http_post(
            url := 'https://us.i.posthog.com/batch/',
            body := jsonb_build_object(
                'api_key', 'phc_HqgzMyWAMtzH7K5j9CLw0dijB0I9W1VjPkkyzg9KOFG',
                'batch', jsonb_build_array(jsonb_build_object(
                    'event', v_event,
                    'distinct_id', 'referral-partner:' || coalesce(v_code, new.partner_user_id),
                    'properties', jsonb_build_object(
                        'partner_code', v_code,
                        'partner_email', v_partner_email,
                        'customer_email', v_customer,
                        'is_first_payment', v_customer_n <= 1,
                        'customer_payment_number', v_customer_n,
                        'gross_amount', new.gross_amount,
                        'currency', new.currency,
                        'rate_pct', round(new.rate * 100),
                        'commission_amount', new.commission_amount,
                        'commission_status', new.status,
                        'dodo_event_type', new.dodo_event_type,
                        'dodo_payment_id', new.dodo_payment_id,
                        'partner_commissions_count', v_n,
                        'partner_commissions_total', v_total)))),
            headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then
        raise warning 'referral_notify failed: %', sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists trg_referral_notify on referral_commissions;
create trigger trg_referral_notify
    after insert or update of status on referral_commissions
    for each row execute function referral_notify();

revoke execute on function referral_notify() from public, anon, authenticated;

create or replace view referral_partner_monthly as
select p.code,
       (select email from linkfinderai_users
         where token = p.user_id limit 1)                         as partner_email,
       date_trunc('month', c.created_at)::date                    as month,
       count(distinct c.referred_user_id)                         as paying_customers,
       count(*) filter (where c.status <> 'void')                 as payments,
       sum(c.gross_amount) filter (where c.status <> 'void')      as revenue,
       sum(c.commission_amount) filter (where c.status <> 'void') as commission,
       sum(c.commission_amount) filter (where c.status = 'void')  as voided
  from referral_partners p
  join referral_commissions c on c.partner_user_id = p.user_id
 group by p.user_id, p.code, 3;

revoke all on referral_partner_monthly from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Safety net: a referred user who has paid (subscription, or a credit pack /
-- LTD, which set is_unlimited) but has no commission row means a Dodo webhook
-- never reached the referral worker. Alerted once per user, hourly at :23.
-- ---------------------------------------------------------------------------
create table if not exists referral_unrecorded_alerts (
    referred_user_id text primary key,
    alerted_at timestamptz not null default now()
);
alter table referral_unrecorded_alerts enable row level security;

create or replace function referral_check_unrecorded()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_batch jsonb;
    v_count int;
begin
    with missed as (
        select a.referred_user_id, a.referred_email, a.code, a.partner_user_id,
               u.subscription_id, u.is_unlimited, u.plan_type
          from referral_attributions a
          join lateral (select subscription_id, is_unlimited, plan_type
                          from linkfinderai_users where token = a.referred_user_id limit 1) u on true
         where (u.subscription_id is not null or coalesce(u.is_unlimited, false))
           and not exists (select 1 from referral_commissions c
                            where c.referred_user_id = a.referred_user_id and c.status <> 'void')
           and not exists (select 1 from referral_unrecorded_alerts l
                            where l.referred_user_id = a.referred_user_id)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'event', 'referral_payment_unrecorded',
               'distinct_id', 'referral-partner:' || code,
               'properties', jsonb_build_object(
                   'partner_code', code,
                   'partner_email', (select email from linkfinderai_users where token = partner_user_id limit 1),
                   'customer_email', referred_email,
                   'referred_user_id', referred_user_id,
                   'subscription_id', subscription_id,
                   'plan_type', plan_type))), '[]'::jsonb),
           count(*)
      into v_batch, v_count
      from missed;

    if v_count = 0 then return 0; end if;

    perform net.http_post(
        url := 'https://us.i.posthog.com/batch/',
        body := jsonb_build_object('api_key', 'phc_HqgzMyWAMtzH7K5j9CLw0dijB0I9W1VjPkkyzg9KOFG', 'batch', v_batch),
        headers := '{"Content-Type": "application/json"}'::jsonb);

    insert into referral_unrecorded_alerts (referred_user_id)
    select e->'properties'->>'referred_user_id' from jsonb_array_elements(v_batch) e
    on conflict do nothing;
    return v_count;
end;
$$;
revoke execute on function referral_check_unrecorded() from public, anon, authenticated;

select cron.schedule('referral-unrecorded-check', '23 * * * *', $$select public.referral_check_unrecorded()$$);
