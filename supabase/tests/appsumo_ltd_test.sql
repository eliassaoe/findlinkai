-- Behaviour tests for 20260905120000_appsumo_ltd.sql.
-- Run with scripts/test-appsumo-migration.sh, which spins up a scratch Postgres.
-- Every check raises on failure, so a clean run means every assertion held.

create or replace function assert_eq(got anyelement, want anyelement, what text)
returns void language plpgsql as $$
begin
    if got is distinct from want then
        raise exception '% : got %, wanted %', what, got, want;
    end if;
    raise notice '  ok  %', what;
end $$;

-- Pretend it is next month, so the reset guard lets a second pass through.
create or replace function rewind_reset(p_token text) returns void
language sql as $$
    update public.linkfinderai_users
       set ltd_last_reset_at = date_trunc('month', now()) - interval '1 day'
     where token = p_token;
$$;

insert into public.linkfinderai_users (email, token, credits) values
    ('t1@x.com','tok1',150), ('t2@x.com','tok2',150),
    ('t3@x.com','tok3',150), ('t4@x.com','tok4',150),
    ('normal@x.com','tok-normal',150);

do $$
declare r jsonb; c bigint; n integer;
begin
raise notice '--- redemption';
    r := public.appsumo_redeem('tok1', 1);
    perform assert_eq(r->>'ok', 'true', 'tier 1 redeems');
    select credits into c from linkfinderai_users where token='tok1';
    perform assert_eq(c, 2500::bigint, 'tier 1 grants 2,500 (not added to the 150)');
    perform assert_eq((select source from linkfinderai_users where token='tok1'),
                      'appsumo', 'source is tagged');
    perform assert_eq((public.appsumo_redeem('tok1', 1))->>'error',
                      'already_at_or_above_tier', 'same tier twice is refused');

raise notice '--- stacking';
    perform public.appsumo_redeem('tok2', 1);
    update linkfinderai_users set credits = 10 where token='tok2';   -- spent it
    r := public.appsumo_redeem('tok2', 2);
    perform assert_eq(r->>'ok','true','tier 1 -> tier 2 stacks');
    select credits, ltd_monthly_credits into c, n from linkfinderai_users where token='tok2';
    perform assert_eq(c, 5000::bigint, 'upgrade tops up to the new allowance');
    perform assert_eq(n, 5000, 'allowance is copied onto the row');
    perform assert_eq((public.appsumo_redeem('tok2', 1))->>'error',
                      'already_at_or_above_tier', 'downgrade is refused');

raise notice '--- monthly reset: NON-ROLLOVER';
    update linkfinderai_users set credits = 100 where token='tok1';
    perform rewind_reset('tok1');
    perform public.appsumo_monthly_reset();
    select credits into c from linkfinderai_users where token='tok1';
    perform assert_eq(c, 2500::bigint, 'a spent balance is topped back to the allowance');

    -- The one that matters: unused allowance must NOT accumulate.
    perform rewind_reset('tok1');
    perform public.appsumo_monthly_reset();
    select credits into c from linkfinderai_users where token='tok1';
    perform assert_eq(c, 2500::bigint, 'an UNSPENT allowance does not roll over to 5,000');

raise notice '--- purchased credits survive the reset';
    -- tok3 buys the $200 pack on top of tier 1: 2,500 + 10,000.
    perform public.appsumo_redeem('tok3', 1);
    update linkfinderai_users set credits = 12500 where token='tok3';
    perform rewind_reset('tok3');
    perform public.appsumo_monthly_reset();
    select credits into c from linkfinderai_users where token='tok3';
    perform assert_eq(c, 12500::bigint, 'a purchased balance is NOT wiped down to the allowance');

raise notice '--- idempotency';
    update linkfinderai_users set credits = 0 where token='tok1';
    perform rewind_reset('tok1');
    perform public.appsumo_monthly_reset();
    perform public.appsumo_monthly_reset();   -- same month, must be a no-op
    select credits into c from linkfinderai_users where token='tok1';
    perform assert_eq(c, 2500::bigint, 'a second run in the same month does not double-grant');

raise notice '--- refunds';
    perform public.appsumo_redeem('tok4', 2);
    perform assert_eq((public.appsumo_revoke('tok4'))->>'ok','true','revoke succeeds');
    update linkfinderai_users set credits = 0 where token='tok4';
    perform rewind_reset('tok4');
    perform public.appsumo_monthly_reset();
    select credits into c from linkfinderai_users where token='tok4';
    perform assert_eq(c, 0::bigint, 'a refunded account is never topped up again');
    perform assert_eq((public.appsumo_revoke('tok-normal'))->>'error',
                      'not_an_appsumo_account', 'revoke refuses a non-LTD account');

raise notice '--- everyone else is untouched';
    perform public.appsumo_monthly_reset();
    select credits into c from linkfinderai_users where token='tok-normal';
    perform assert_eq(c, 150::bigint, 'a normal account keeps its balance');
    perform assert_eq((select source from linkfinderai_users where token='tok-normal'),
                      null, 'a normal account gets no source');
    perform assert_eq((public.appsumo_redeem('nope', 1))->>'error',
                      'no_such_user', 'an unknown token is refused');
    perform assert_eq((public.appsumo_redeem('tok-normal', 9))->>'error',
                      'unknown_tier', 'an unknown tier is refused');

raise notice '--- the cron job is scheduled';
    perform assert_eq((select count(*)::int from cron.job where jobname='appsumo-monthly-reset'),
                      1, 'exactly one reset job exists');
    perform assert_eq((select schedule from cron.job where jobname='appsumo-monthly-reset'),
                      '0 4 1 * *', 'it runs on the 1st');
raise notice 'ALL CHECKS PASSED';
end $$;
