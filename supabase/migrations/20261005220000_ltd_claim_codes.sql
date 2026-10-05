-- Lifetime deal: claim codes for buyers whose checkout email matches no account.
-- Applied live 5 Oct 2026. Spec: docs/ltd-campaign.md ("Who gets the plan").
--
-- ltd_fulfill() now gives every unmatched purchase a one-time LTD- code. The
-- ltd-webhook edge function puts it on the ltd_purchase_unmatched event, and
-- PostHog workflow 29 emails it to the payer. The buyer logs in, opens
-- /lifetime-deal?code=...#claim and ltd_claim() attaches the purchase to the
-- account they are logged in with. This is deliberately NOT the old
-- redeem-code page / linkfinder-redeem worker.
alter table public.ltd_purchases add column if not exists claim_code text unique;
alter table public.ltd_purchases add column if not exists claimed_at timestamptz;

create or replace function public.ltd_new_claim_code()
returns text language sql volatile set search_path = public, extensions as $$
  -- 10 chars from a 31-char alphabet with no 0/O/1/I/L: ~49 bits, unguessable over an RPC.
  select 'LTD-' || string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (get_byte(b, i) % 31), 1), '')
    from (select gen_random_bytes(10) b) r, generate_series(0, 9) i;
$$;

create or replace function public.ltd_fulfill(
  p_payment_id text, p_product_id text, p_amount_usd numeric, p_email text,
  p_dodo_customer_id text, p_token text, p_source text, p_campaign text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t ltd_tiers%rowtype; v_token text; v_status text; v_code text;
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
  if v_token is null then v_code := ltd_new_claim_code(); end if;

  insert into ltd_purchases (payment_id, tier_key, monthly_credits, amount_usd, customer_email, dodo_customer_id,
                             user_token, status, last_topup_at, attribution_source, attribution_campaign, claim_code)
  values (p_payment_id, t.tier_key, t.monthly_credits, p_amount_usd, lower(p_email), p_dodo_customer_id,
          v_token, v_status, case when v_token is null then null else now() end, p_source, p_campaign, v_code);

  if v_token is not null then
    update linkfinderai_users
       set credits = coalesce(credits, 0) + t.monthly_credits,
           is_unlimited = true,   -- same marker credit-pack buyers carry: "has paid"
           customer_id = coalesce(nullif(customer_id, ''), p_dodo_customer_id)
     where token = v_token;
  end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'tier', t.tier_key, 'user_token', v_token,
                            'monthly_credits', t.monthly_credits, 'claim_code', v_code);
end;
$$;

-- Public, called from /lifetime-deal by a logged-in visitor with their own token.
create or replace function public.ltd_claim(p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p ltd_purchases%rowtype; v_token text;
begin
  if p_token is null or length(p_token) < 8 then return jsonb_build_object('ok', false, 'error', 'not_logged_in'); end if;
  select token into v_token from linkfinderai_users where token = p_token limit 1;
  if v_token is null then return jsonb_build_object('ok', false, 'error', 'not_logged_in'); end if;

  select * into p from ltd_purchases where claim_code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  if p.status <> 'unmatched' then
    return jsonb_build_object('ok', false, 'error', case when p.status = 'active' then 'already_claimed' else 'refunded' end);
  end if;

  update ltd_purchases set user_token = v_token, status = 'active', last_topup_at = now(), claimed_at = now()
   where payment_id = p.payment_id;
  update linkfinderai_users
     set credits = coalesce(credits, 0) + p.monthly_credits,
         is_unlimited = true,
         customer_id = coalesce(nullif(customer_id, ''), p.dodo_customer_id)
   where token = v_token;
  return jsonb_build_object('ok', true, 'tier', p.tier_key, 'monthly_credits', p.monthly_credits);
end;
$$;
revoke all on function public.ltd_new_claim_code() from public, anon, authenticated;
revoke all on function public.ltd_fulfill(text,text,numeric,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.ltd_fulfill(text,text,numeric,text,text,text,text,text) to service_role;
revoke all on function public.ltd_claim(text,text) from public;
grant execute on function public.ltd_claim(text,text) to anon, authenticated;
