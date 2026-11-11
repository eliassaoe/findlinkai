-- Partner lifetime codes (InfoStack, 11 Nov 2026). Same table, page and RPC as
-- the AppSumo codes (docs/appsumo-codes.md), but a code can grant a lifetime
-- MONTHLY allowance instead of a yearly lump:
--   monthly_credits > 0  -> ltd_monthly_credits += n, credits += n now, and the
--                           existing ltd_monthly_topup cron refills every month
--   monthly_credits = 0  -> unchanged AppSumo behaviour (yearly_credits)
-- See docs/partner-ltd-codes.md.

alter table public.appsumo_codes
  add column if not exists monthly_credits integer not null default 0,
  add column if not exists partner text not null default 'appsumo';

create or replace function public.partner_new_code(p_prefix text)
returns text language sql set search_path to 'public', 'extensions' as $$
  select upper(p_prefix) || '-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4)
    from (select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 31), 1), '') s
            from (select gen_random_bytes(12) b) r, generate_series(0, 11) i) x;
$$;
revoke all on function public.partner_new_code(text) from public, anon, authenticated;

create or replace function public.partner_generate_ltd_codes(
  p_count integer, p_batch text, p_partner text, p_prefix text, p_monthly_credits integer)
returns setof text language plpgsql security definer set search_path to 'public' as $$
declare n integer := 0; c text;
begin
  if p_monthly_credits is null or p_monthly_credits <= 0 then raise exception 'monthly credits must be > 0'; end if;
  while n < p_count loop
    c := partner_new_code(p_prefix);
    insert into appsumo_codes (code, batch, yearly_credits, monthly_credits, partner)
    values (c, p_batch, 0, p_monthly_credits, p_partner)
    on conflict do nothing;
    if found then n := n + 1; return next c; end if;
  end loop;
end; $$;
revoke all on function public.partner_generate_ltd_codes(integer, text, text, text, integer) from public, anon, authenticated;

create or replace function public.appsumo_redeem(p_code text, p_email text, p_password text, p_token text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare k appsumo_codes%rowtype; u linkfinderai_users%rowtype; v_email text; v_token text; v_new boolean := false;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'invalid_email'); end if;

  select * into k from appsumo_codes where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  if k.status = 'redeemed' then return jsonb_build_object('ok', false, 'error', 'already_redeemed'); end if;
  if k.status = 'revoked' then return jsonb_build_object('ok', false, 'error', 'revoked'); end if;

  select * into u from linkfinderai_users where lower(email) = v_email
   order by coalesce(credits, 0) desc limit 1;
  if found then
    if not ((p_token is not null and length(p_token) >= 8 and u.token = p_token)
            or (u.mdp is not null and p_password is not null and u.mdp = p_password)) then
      return jsonb_build_object('ok', false, 'error', 'account_exists');
    end if;
    v_token := u.token;
  else
    if p_password is null or length(p_password) < 6 then
      return jsonb_build_object('ok', false, 'error', 'weak_password');
    end if;
    loop
      v_token := appsumo_new_token();
      exit when not exists (select 1 from linkfinderai_users where token = v_token);
    end loop;
    insert into linkfinderai_users (email, token, mdp, credits) values (v_email, v_token, p_password, 0);
    v_new := true;
  end if;

  if coalesce(k.monthly_credits, 0) > 0 then
    -- Partner lifetime code: monthly allowance, refilled by ltd_monthly_topup.
    update linkfinderai_users
       set credits = coalesce(credits, 0) + k.monthly_credits,
           ltd_monthly_credits = coalesce(ltd_monthly_credits, 0) + k.monthly_credits,
           ltd_topup_at = now(),
           is_unlimited = true
     where token = v_token;
  else
    update linkfinderai_users
       set credits = coalesce(credits, 0) + k.yearly_credits,
           appsumo_yearly_credits = coalesce(appsumo_yearly_credits, 0) + k.yearly_credits,
           appsumo_topup_at = coalesce(appsumo_topup_at, now()),
           is_unlimited = true
     where token = v_token;
  end if;

  update appsumo_codes set status = 'redeemed', user_token = v_token, redeemed_email = v_email, redeemed_at = now()
   where code = k.code;

  return jsonb_build_object('ok', true, 'token', v_token, 'new_account', v_new, 'partner', k.partner,
                            'credits_added', case when coalesce(k.monthly_credits, 0) > 0 then k.monthly_credits else k.yearly_credits end,
                            'monthly_credits', nullif(k.monthly_credits, 0),
                            'yearly_credits', (select appsumo_yearly_credits from linkfinderai_users where token = v_token));
end; $$;

create or replace function public.appsumo_revoke(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare k appsumo_codes%rowtype;
begin
  select * into k from appsumo_codes where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  if k.status = 'revoked' then return jsonb_build_object('ok', true, 'noop', true); end if;
  update appsumo_codes set status = 'revoked', revoked_at = now() where code = k.code;
  if k.user_token is not null then
    if coalesce(k.monthly_credits, 0) > 0 then
      update linkfinderai_users
         set credits = greatest(coalesce(credits, 0) - k.monthly_credits, 0),
             ltd_monthly_credits = nullif(greatest(coalesce(ltd_monthly_credits, 0) - k.monthly_credits, 0), 0)
       where token = k.user_token;
    else
      update linkfinderai_users
         set credits = greatest(coalesce(credits, 0) - k.yearly_credits, 0),
             appsumo_yearly_credits = nullif(greatest(coalesce(appsumo_yearly_credits, 0) - k.yearly_credits, 0), 0)
       where token = k.user_token;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'user_token', k.user_token, 'email', k.redeemed_email);
end; $$;
