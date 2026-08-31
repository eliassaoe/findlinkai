-- Open it to everyone. It is an upsell, not a secret.
--
-- The first cut hid the tab from anyone actively using the tool, to protect the
-- subscription. That had the trade backwards: a service client at $150 a call
-- is worth many times an $89/mo subscriber, so an active user taking it is an
-- upgrade, not a loss. The only thing worth keeping from that idea is the
-- placement — the tab sits after the self-serve tabs, so it reads as the next
-- step up rather than as the thing being sold instead of the product.
--
-- So the gate goes, and what was an eligibility check becomes a note on the
-- row: knowing whether the person asking is a power user, a dormant account or
-- somebody who never paid is worth a lot on the call, and nothing at the door.

alter table public.ai_sdr_requests add column if not exists segment text;

drop function if exists public.ai_sdr_eligibility(text);

create or replace function public.ai_sdr_request(
    p_token  text,
    p_target text,
    p_offer  text,
    p_calls  integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
    u           public.linkfinderai_users%rowtype;
    v_count     integer;
    v_last_used timestamptz;
    v_paid      boolean;
    v_segment   text;
    v_id        bigint;
begin
    -- Signed in is the only bar. A free account can still be the best client
    -- on the list — nobody is turned away from a sales conversation.
    if p_token is null or length(p_token) < 8 then
        return jsonb_build_object('ok', false, 'error', 'please sign in first');
    end if;

    select * into u from public.linkfinderai_users where token = p_token;
    if u.token is null then
        return jsonb_build_object('ok', false, 'error', 'please sign in first');
    end if;

    if coalesce(trim(p_target), '') = '' or coalesce(trim(p_offer), '') = '' then
        return jsonb_build_object('ok', false, 'error', 'target and offer are both required');
    end if;

    -- A form anyone can post to is a form that gets posted to. One a minute
    -- per account is plenty for a human filling this in properly.
    if exists (select 1 from public.ai_sdr_requests
                where user_token = p_token and created_at > now() - interval '60 seconds') then
        return jsonb_build_object('ok', false, 'error', 'just a moment — that was already sent');
    end if;

    select count(*), max("timestamp") into v_count, v_last_used
      from public.enrichment_history where user_id = p_token;

    -- is_unlimited is true for credit-pack buyers and does NOT mean subscribed.
    v_paid := (u.subscription_id is not null) or coalesce(u.is_unlimited, false);

    v_segment := case
        when v_paid and v_last_used > now() - interval '30 days' then 'paying, active'
        when v_paid and v_count = 0                              then 'paying, never activated'
        when v_paid                                              then 'paying, dormant 30d'
        when v_count > 0                                         then 'free, has used it'
        else                                                          'free, never used it'
    end;

    insert into public.ai_sdr_requests
        (user_token, email, target, offer, calls_wanted,
         credits_at_request, enrichments_at_request, segment)
    values (p_token, u.email, left(trim(p_target), 2000), left(trim(p_offer), 2000),
            greatest(least(coalesce(p_calls, 0), 1000), 0),
            coalesce(u.credits, 0), v_count, v_segment)
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id, 'email', u.email);
end;
$fn$;

revoke all on function public.ai_sdr_request(text, text, text, integer) from public;
grant execute on function public.ai_sdr_request(text, text, text, integer) to anon, authenticated, service_role;

-- Segment first: it is the thing that decides how the call opens. Dropped
-- rather than replaced because the column order changes.
drop view if exists public.ai_sdr_inbox;
create view public.ai_sdr_inbox with (security_invoker = true) as
    select r.created_at, r.segment, r.email, r.calls_wanted, r.target, r.offer,
           r.credits_at_request, r.enrichments_at_request, r.booked, r.user_token
      from public.ai_sdr_requests r
     order by r.created_at desc;
