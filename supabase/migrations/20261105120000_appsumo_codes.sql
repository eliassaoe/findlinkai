-- AppSumo lifetime deal: one-time codes redeemed on /redeem-code.
-- Applied live 5 Nov 2026. Spec: docs/appsumo-codes.md
--
-- Deal: 60,000 credits per year, granted in one lump on redemption and again
-- on every anniversary (cron 'appsumo-yearly-topup'). Codes stack: each code
-- adds its own 60,000/yr.
--
-- /redeem-code -> rpc appsumo_redeem(code, email, password, token)
--   * new email           -> creates the linkfinderai_users row (same shape as
--                            an email signup: email + mdp + 16-char token)
--   * existing email      -> credits that account, if the password matches
--                            its mdp OR the browser holds that account's token
-- Codes never live in this repo (it is public). Generate them with
-- appsumo_generate_codes() and export from the table.

create table if not exists public.appsumo_codes (
  code text primary key,
  batch text not null default 'appsumo',
  yearly_credits integer not null default 60000,
  status text not null default 'available' check (status in ('available','redeemed','revoked')),
  user_token text,
  redeemed_email text,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists appsumo_codes_token on public.appsumo_codes(user_token);
alter table public.appsumo_codes enable row level security;
revoke all on public.appsumo_codes from anon, authenticated;

alter table public.linkfinderai_users add column if not exists appsumo_yearly_credits integer;
alter table public.linkfinderai_users add column if not exists appsumo_topup_at timestamptz;

-- LFAS-XXXX-XXXX-XXXX, 12 chars from a 31-char alphabet (no 0/O/1/I/L): ~59 bits.
create or replace function public.appsumo_new_code()
returns text language sql volatile set search_path = public, extensions as $$
  select 'LFAS-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4)
    from (select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 31), 1), '') s
            from (select gen_random_bytes(12) b) r, generate_series(0, 11) i) x;
$$;

create or replace function public.appsumo_generate_codes(p_count integer, p_batch text default 'appsumo',
                                                         p_yearly_credits integer default 60000)
returns setof text language plpgsql security definer set search_path = public as $$
declare n integer := 0; c text;
begin
  while n < p_count loop
    c := appsumo_new_code();
    insert into appsumo_codes (code, batch, yearly_credits) values (c, p_batch, p_yearly_credits)
      on conflict do nothing;
    if found then n := n + 1; return next c; end if;
  end loop;
end;
$$;

create or replace function public.appsumo_new_token()
returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
                           1 + (get_byte(b, i) % 62), 1), '')
    from (select gen_random_bytes(16) b) r, generate_series(0, 15) i;
$$;

-- Public: called by /redeem-code.
create or replace function public.appsumo_redeem(p_code text, p_email text, p_password text, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    -- Existing account: prove it is yours (its password, or its token from this browser).
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

  update linkfinderai_users
     set credits = coalesce(credits, 0) + k.yearly_credits,
         appsumo_yearly_credits = coalesce(appsumo_yearly_credits, 0) + k.yearly_credits,
         appsumo_topup_at = coalesce(appsumo_topup_at, now()),
         is_unlimited = true            -- the "has paid" marker credit-pack and LTD buyers carry
   where token = v_token;

  update appsumo_codes set status = 'redeemed', user_token = v_token, redeemed_email = v_email, redeemed_at = now()
   where code = k.code;

  return jsonb_build_object('ok', true, 'token', v_token, 'new_account', v_new,
                            'credits_added', k.yearly_credits,
                            'yearly_credits', (select appsumo_yearly_credits from linkfinderai_users where token = v_token));
end;
$$;

-- AppSumo refund: revoke the code, stop its yearly grant, take back its credits (never below 0).
create or replace function public.appsumo_revoke(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k appsumo_codes%rowtype;
begin
  select * into k from appsumo_codes where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  if k.status = 'revoked' then return jsonb_build_object('ok', true, 'noop', true); end if;
  update appsumo_codes set status = 'revoked', revoked_at = now() where code = k.code;
  if k.user_token is not null then
    update linkfinderai_users
       set credits = greatest(coalesce(credits, 0) - k.yearly_credits, 0),
           appsumo_yearly_credits = nullif(greatest(coalesce(appsumo_yearly_credits, 0) - k.yearly_credits, 0), 0)
     where token = k.user_token;
  end if;
  return jsonb_build_object('ok', true, 'user_token', k.user_token, 'email', k.redeemed_email);
end;
$$;

-- Daily: on each anniversary, add the yearly allotment in one go.
create or replace function public.appsumo_yearly_topup()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update linkfinderai_users
     set credits = coalesce(credits, 0) + appsumo_yearly_credits,
         appsumo_topup_at = appsumo_topup_at + interval '1 year'
   where coalesce(appsumo_yearly_credits, 0) > 0
     and appsumo_topup_at <= now() - interval '1 year';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.appsumo_new_code() from public, anon, authenticated;
revoke all on function public.appsumo_new_token() from public, anon, authenticated;
revoke all on function public.appsumo_generate_codes(integer, text, integer) from public, anon, authenticated;
revoke all on function public.appsumo_revoke(text) from public, anon, authenticated;
revoke all on function public.appsumo_yearly_topup() from public, anon, authenticated;
revoke all on function public.appsumo_redeem(text, text, text, text) from public;
grant execute on function public.appsumo_redeem(text, text, text, text) to anon, authenticated;

select cron.schedule('appsumo-yearly-topup', '23 4 * * *', $$select public.appsumo_yearly_topup()$$);
