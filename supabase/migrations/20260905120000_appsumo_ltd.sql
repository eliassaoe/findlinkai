-- AppSumo lifetime deals: tagging the accounts, and the monthly reset.
--
-- Two things this exists to make true, both from docs/appsumo-launch-spec.md:
--
--   G7  Every LTD account is tagged, so the funnel queries in docs/ can exclude
--       them. Drop 1,000 untagged LTD rows into linkfinderai_users and
--       signup->paid, activation, churn and ARPU all stop meaning anything.
--       is_unlimited has already caused one documented misread of exactly this
--       kind (docs/dfy-activation-campaign.md).
--
--   G1  The allowance is MONTHLY and NON-ROLLOVER. This is the whole safety
--       mechanism of the deal. A one-time credit stockpile gets drained inside
--       AppSumo's 60-day refund window by the bulk-resolver shape that
--       docs/data-provider-angle.md calls "Shape A"; a monthly cap bounds the
--       worst case per code per month, forever, at a number we choose.
--
-- The product has never had a recurring grant of any kind - every balance until
-- now has been a stockpile - so none of this could be reused from anywhere.

-- ------------------------------------------------------------------ the tiers

-- What each tier grants, for issuing new redemptions. The granted allowance is
-- ALSO copied onto the user row: a lifetime deal is a promise, so changing this
-- table must never retroactively change what somebody already bought.
create table if not exists public.appsumo_tiers (
    tier            smallint primary key,
    monthly_credits integer not null check (monthly_credits > 0),
    price_usd       numeric(10,2),
    label           text,
    created_at      timestamptz not null default now()
);

insert into public.appsumo_tiers (tier, monthly_credits, price_usd, label) values
    (1, 2500,  59.00,  'Tier 1'),
    (2, 5000,  119.00, 'Tier 2'),
    (3, 8000,  249.00, 'Tier 3')
on conflict (tier) do nothing;

-- ------------------------------------------------------------- the user columns

alter table public.linkfinderai_users
    add column if not exists source              text,
    add column if not exists ltd_tier            smallint,
    add column if not exists ltd_monthly_credits integer,
    add column if not exists ltd_status          text,
    add column if not exists ltd_redeemed_at     timestamptz,
    add column if not exists ltd_last_reset_at   timestamptz;

comment on column public.linkfinderai_users.source is
    'Acquisition source. ''appsumo'' marks a lifetime-deal account - exclude these from every funnel, conversion and ARPU query.';
comment on column public.linkfinderai_users.ltd_monthly_credits is
    'The monthly allowance this account actually bought. Copied from appsumo_tiers at redemption and never recomputed, so re-pricing a tier cannot alter an existing deal.';
comment on column public.linkfinderai_users.ltd_status is
    '''active'' or ''refunded''. Refunded accounts stop being topped up but keep their row.';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'linkfinderai_users_ltd_status_check') then
        alter table public.linkfinderai_users
            add constraint linkfinderai_users_ltd_status_check
            check (ltd_status is null or ltd_status in ('active', 'refunded'));
    end if;
end $$;

-- The reset sweeps on these two columns and nothing else.
create index if not exists linkfinderai_users_ltd_reset_idx
    on public.linkfinderai_users (ltd_last_reset_at)
    where source = 'appsumo' and ltd_status = 'active';

create index if not exists linkfinderai_users_source_idx
    on public.linkfinderai_users (source) where source is not null;

-- --------------------------------------------------------------- redeem a code

-- Called by the redeem worker once AppSumo has confirmed the code. Stacking a
-- second code is an upgrade, so the tier only ever moves UP: re-running this
-- with a lower tier than the account already holds leaves the deal alone.
-- p_tier is integer, NOT smallint, and deliberately. PostgREST sends a JSON
-- number as integer, and Postgres will not implicitly narrow that to smallint
-- when resolving a function, so a smallint signature makes every RPC call from
-- the redeem worker fail with "function does not exist". The column stays
-- smallint; only the argument widens.
create or replace function public.appsumo_redeem(p_token text, p_tier integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_allowance integer;
    v_current   integer;
    v_credits   bigint;
begin
    select monthly_credits into v_allowance from public.appsumo_tiers where tier = p_tier;
    if v_allowance is null then
        return jsonb_build_object('ok', false, 'error', 'unknown_tier');
    end if;

    select ltd_tier, credits into v_current, v_credits
      from public.linkfinderai_users where token = p_token;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'no_such_user');
    end if;

    if v_current is not null and v_current >= p_tier then
        return jsonb_build_object('ok', false, 'error', 'already_at_or_above_tier',
                                  'tier', v_current);
    end if;

    update public.linkfinderai_users
       set source              = 'appsumo',
           ltd_tier            = p_tier,
           ltd_monthly_credits = v_allowance,
           ltd_status          = 'active',
           ltd_redeemed_at     = coalesce(ltd_redeemed_at, now()),
           ltd_last_reset_at   = now(),
           -- Top up to the new allowance without taking anything away: an
           -- upgrade must never leave someone worse off than the moment before.
           credits             = greatest(coalesce(credits, 0), v_allowance)
     where token = p_token;

    return jsonb_build_object('ok', true, 'tier', p_tier, 'monthly_credits', v_allowance);
end $$;

-- ------------------------------------------------------------------- a refund

-- AppSumo refunds inside 60 days. A refunded code must stop being topped up, or
-- we pay a supplier every month for a sale that was reversed.
create or replace function public.appsumo_revoke(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    update public.linkfinderai_users
       set ltd_status = 'refunded'
     where token = p_token and source = 'appsumo';
    if not found then
        return jsonb_build_object('ok', false, 'error', 'not_an_appsumo_account');
    end if;
    -- The remaining balance is deliberately left alone. Clawing back credits
    -- somebody may already have spent turns a refund into a support ticket, and
    -- the exposure that matters is the RECURRING one, which stops here.
    return jsonb_build_object('ok', true);
end $$;

-- -------------------------------------------------------------- monthly reset

-- NON-ROLLOVER, and the rule is one line: top the balance back up to the
-- monthly allowance, and never take anything away.
--
--     credits := greatest(credits, ltd_monthly_credits)
--
-- Why greatest() and not a plain assignment. A plain `credits = allowance`
-- would DELETE credits the customer bought - an LTD holder who tops up through
-- workers/auto-topup-charge, or buys a $25 pack, would watch that balance
-- vanish on the 1st. Pay-as-you-go credits never expiring is a standing product
-- promise (pricing.html), so the reset must not be able to break it.
--
-- The known limit of this rule, stated rather than hidden: an account sitting on
-- a purchased balance ABOVE its allowance receives no top-up that month. It
-- errs in our favour and never destroys anything the customer paid for, which
-- is the right way round for it to be wrong. Fixing it properly needs a
-- separate purchased-credits bucket, which means changing the spend path - and
-- that lives in n8n, outside this repo. Do not attempt it here.
--
-- Idempotent: the ltd_last_reset_at guard means a second run in the same
-- calendar month is a no-op, so a retried or overlapping cron cannot double-grant.
create or replace function public.appsumo_monthly_reset()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_count integer;
begin
    with reset as (
        update public.linkfinderai_users
           set credits           = greatest(coalesce(credits, 0), ltd_monthly_credits),
               ltd_last_reset_at = now()
         where source              = 'appsumo'
           and ltd_status          = 'active'
           and ltd_monthly_credits is not null
           and (ltd_last_reset_at is null
                or ltd_last_reset_at < date_trunc('month', now()))
        returning 1
    )
    select count(*) into v_count from reset;

    return jsonb_build_object('ok', true, 'accounts_reset', v_count, 'at', now());
end $$;

-- These three are security definer, and in Postgres that means PUBLIC can
-- execute them unless told otherwise. appsumo_redeem grants a monthly allowance
-- to any token handed to it, so a default grant here would let anyone on the
-- internet issue themselves a lifetime deal. Revoke from PUBLIC - which is what
-- actually holds the default - and hand execute to service_role alone.
--
-- Note this is deliberately the OPPOSITE posture to user_value_summary, which is
-- granted to anon/authenticated because it only ever reads one caller's own row
-- (docs/account-value-summary.md). These three write money.
revoke all on function public.appsumo_redeem(text, integer)   from public, anon, authenticated;
revoke all on function public.appsumo_revoke(text)            from public, anon, authenticated;
revoke all on function public.appsumo_monthly_reset()         from public, anon, authenticated;

grant execute on function public.appsumo_redeem(text, integer)  to service_role;
grant execute on function public.appsumo_revoke(text)           to service_role;
-- appsumo_monthly_reset needs no grant: pg_cron runs it as the job owner.

-- ----------------------------------------------------------------- the clock

-- 04:00 UTC on the 1st. The hour is not load-bearing; being early in the month
-- is, so that somebody logging in on the 1st already has their allowance.
do $$
begin
    perform cron.unschedule('appsumo-monthly-reset')
      where exists (select 1 from cron.job where jobname = 'appsumo-monthly-reset');
end $$;

select cron.schedule('appsumo-monthly-reset', '0 4 1 * *',
                     $job$ select public.appsumo_monthly_reset(); $job$);
