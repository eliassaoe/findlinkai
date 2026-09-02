-- "AI SDR by LinkFinder AI" — the request that happens before the call.
-- Reasoning, segment sizes and the decisions behind it: docs/ai-sdr-offer.md
--
-- Someone says what they sell, who they want, and how many calls they want on
-- the calendar. That is stored HERE FIRST and only then are they sent to
-- Calendly, because the people who fill this in and never book are the warmest
-- untouched leads there are — captured on booking only, they would be invisible.
--
-- Who sees the tab is deliberate. Of 120 paying accounts, 68 have never run a
-- single enrichment and 99 hold more than 1,000 credits they have not touched
-- in a month. Those people already paid and got nothing; offering them a
-- service costs no self-serve revenue because that revenue is already lost.
-- Someone actively using the tool must never see it — that is how a healthy
-- $89/mo subscriber gets turned into a one-off conversation.

create table if not exists public.ai_sdr_requests (
    id             bigint generated always as identity primary key,
    user_token     text not null,
    email          text,
    target         text not null,
    offer          text not null,
    calls_wanted   integer,
    -- What the account looked like at the moment they asked, so the call can
    -- start from facts rather than from a form.
    credits_at_request      numeric,
    enrichments_at_request  integer,
    booked         boolean not null default false,
    created_at     timestamptz not null default now()
);

create index if not exists ai_sdr_requests_token_idx on public.ai_sdr_requests (user_token, created_at desc);

alter table public.ai_sdr_requests enable row level security;

-- The one definition of who is offered this, so the tab and the submission
-- cannot disagree about it.
create or replace function public.ai_sdr_eligibility(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
    u            public.linkfinderai_users%rowtype;
    v_last_used  timestamptz;
    v_count      integer;
begin
    if p_token is null or length(p_token) < 8 then
        return jsonb_build_object('eligible', false, 'reason', 'unknown token');
    end if;

    select * into u from public.linkfinderai_users where token = p_token;
    if u.token is null then
        return jsonb_build_object('eligible', false, 'reason', 'unknown token');
    end if;

    -- Paid at some point: a subscriber, or a credit-pack buyer (is_unlimited is
    -- true for pack buyers and does NOT mean subscribed).
    if u.subscription_id is null and coalesce(u.is_unlimited, false) = false then
        return jsonb_build_object('eligible', false, 'reason', 'not a paying account');
    end if;

    select count(*), max("timestamp") into v_count, v_last_used
      from public.enrichment_history where user_id = p_token;

    -- Actively using it: leave them alone.
    if v_last_used is not null and v_last_used > now() - interval '30 days' then
        return jsonb_build_object('eligible', false, 'reason', 'actively using the tool');
    end if;

    return jsonb_build_object(
        'eligible', true,
        'reason', case when v_count = 0 then 'paid, never activated' else 'paid, dormant 30d' end,
        'credits', coalesce(u.credits, 0),
        'enrichments', v_count);
end;
$fn$;

-- Stores the request. Returns what the browser needs to build the Calendly
-- link, and nothing about anybody else.
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
    u      public.linkfinderai_users%rowtype;
    v_elig jsonb;
    v_id   bigint;
begin
    v_elig := public.ai_sdr_eligibility(p_token);
    if not (v_elig ->> 'eligible')::boolean then
        return jsonb_build_object('ok', false, 'error', v_elig ->> 'reason');
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

    select * into u from public.linkfinderai_users where token = p_token;

    insert into public.ai_sdr_requests
        (user_token, email, target, offer, calls_wanted, credits_at_request, enrichments_at_request)
    values (p_token, u.email, left(trim(p_target), 2000), left(trim(p_offer), 2000),
            greatest(least(coalesce(p_calls, 0), 1000), 0),
            (v_elig ->> 'credits')::numeric, (v_elig ->> 'enrichments')::int)
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id, 'email', u.email);
end;
$fn$;

revoke all on function public.ai_sdr_eligibility(text) from public;
revoke all on function public.ai_sdr_request(text, text, text, integer) from public;
grant execute on function public.ai_sdr_eligibility(text) to anon, authenticated, service_role;
grant execute on function public.ai_sdr_request(text, text, text, integer) to anon, authenticated, service_role;

-- What to read the morning after.
create or replace view public.ai_sdr_inbox with (security_invoker = true) as
    select r.created_at, r.email, r.calls_wanted, r.target, r.offer,
           r.credits_at_request, r.enrichments_at_request, r.booked, r.user_token
      from public.ai_sdr_requests r
     order by r.created_at desc;
