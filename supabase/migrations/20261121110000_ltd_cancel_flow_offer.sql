-- Lifetime deal as a save offer in the cancel flow (owner, 21 Nov 2026:
-- "people who want to leave must be offered the lifetime deal").
-- ltd_eligibility() refuses past/current payers unless they are on
-- ltd_allowlist. A subscriber who opens the cancel flow and clicks the
-- lifetime offer is added here, only while the Black Friday deal is live.
-- Applied with the Supabase MCP (apply_migration), not `supabase db push`.
create or replace function public.ltd_allow_leaver(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare u linkfinderai_users%rowtype;
begin
  if now() >= timestamptz '2026-12-01 07:59:00+00' then
    return jsonb_build_object('ok', false, 'reason', 'offer_ended');
  end if;
  if p_token is null or length(p_token) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  select * into u from linkfinderai_users where token = p_token limit 1;
  if not found or u.subscription_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_subscriber');
  end if;
  insert into ltd_allowlist (email, reason, added_at)
  select lower(u.email), 'cancel_flow_offer', now()
  where not exists (select 1 from ltd_allowlist a where a.email = lower(u.email));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.ltd_allow_leaver(text) from public;
grant execute on function public.ltd_allow_leaver(text) to anon, authenticated;
