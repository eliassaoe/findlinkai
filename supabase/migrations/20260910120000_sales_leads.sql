-- The sales-led motion: who asked to talk, and about what.
-- Reasoning, the plan ladder and the audience caveat: docs/sales-led-motion.md
--
-- Two high-ticket doors share this table:
--   'enterprise' — the Enterprise plan on /pricing and in the app's pricing
--                  modal. Quoted, not listed; agreements from $999/month.
--   'dfy'        — Done-For-You outbound, $150 per meeting held, min 5/month.
--
-- Same discipline as ai_sdr_requests (docs/ai-sdr-offer.md): the answers are
-- stored BEFORE the browser is sent to Calendly. Someone who fills in a
-- qualification form and never books is the warmest untouched lead there is,
-- and capturing on booking alone makes them invisible. ai_sdr_requests stays
-- as it is -- that one is in-app and requires a token; this one is called from
-- public marketing pages by visitors who have no account at all, which is why
-- it is a separate table with a separate, anon-callable function.

create table if not exists public.sales_leads (
    id             bigint generated always as identity primary key,
    -- 'enterprise' | 'dfy' | 'unknown'
    offer          text not null default 'enterprise',
    email          text,
    company_site   text,
    role           text,
    -- Who they want to reach (dfy) or what they want to enrich (enterprise).
    target         text,
    -- Self-reported monthly volume band; the single most useful qualifier on
    -- the call, and the one that decides Scale vs Enterprise.
    volume_band    text,
    message        text,
    -- Which CTA sent them. Every injected CTA carries one (see
    -- js/lf-highticket-cta.js), so a page can be judged on booked calls
    -- instead of on clicks.
    src            text,
    landing_page   text,
    utm            jsonb,
    -- Set only when the visitor happened to be a signed-in user; public
    -- marketing traffic has no token and that is normal, not an error.
    user_token     text,
    credits_at_request     numeric,
    enrichments_at_request integer,
    booked         boolean not null default false,
    created_at     timestamptz not null default now()
);

create index if not exists sales_leads_created_idx on public.sales_leads (created_at desc);
create index if not exists sales_leads_offer_idx   on public.sales_leads (offer, created_at desc);
create index if not exists sales_leads_email_idx   on public.sales_leads (lower(email), created_at desc);

alter table public.sales_leads enable row level security;
-- No policies on purpose: nothing reaches this table except the security
-- definer function below. anon can insert a lead and can read nothing.
--
-- RLS alone is NOT enough here, and this was caught the hard way. This project
-- grants anon SELECT on everything in `public` by schema default, so the table
-- privileges have to come off explicitly -- otherwise the only thing standing
-- between a published anon key and every lead's email address is "there
-- happens to be no policy yet", and the first permissive policy anyone adds
-- silently opens it.
revoke all on public.sales_leads from anon, authenticated;

/*
 * Stores one request and returns only what the browser needs to build the
 * Calendly link. Callable by anon because the pages that call it are public
 * marketing pages, so it has to defend itself:
 *
 *   - every text input is length-capped, not trusted
 *   - an email is required and must look like one, because a row with no way
 *     to reply is not a lead
 *   - 5 rows per email per day, so a stuck submit button or a bored visitor
 *     cannot fill the table
 *
 * It returns nothing about anybody else, so it cannot be used to enumerate.
 */
create or replace function public.sales_lead_request(
    p_offer   text,
    p_email   text,
    p_site    text    default null,
    p_role    text    default null,
    p_target  text    default null,
    p_volume  text    default null,
    p_message text    default null,
    p_src     text    default null,
    p_landing text    default null,
    p_utm     jsonb   default null,
    p_token   text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_offer   text;
    v_email   text;
    v_recent  integer;
    v_id      bigint;
    u         public.linkfinderai_users%rowtype;
    v_count   integer;
    v_segment text := 'no account';
begin
    v_email := lower(btrim(coalesce(p_email, '')));
    if v_email = '' or v_email not like '%_@_%.__%' or length(v_email) > 320 then
        return jsonb_build_object('ok', false, 'error', 'a work email is required');
    end if;

    v_offer := lower(btrim(coalesce(p_offer, '')));
    if v_offer not in ('enterprise', 'dfy') then
        v_offer := 'unknown';
    end if;

    select count(*) into v_recent
      from public.sales_leads
     where lower(email) = v_email
       and created_at > now() - interval '1 day';
    if v_recent >= 5 then
        return jsonb_build_object('ok', false, 'error', 'already received — we will be in touch');
    end if;

    -- If they happen to be signed in, snapshot the account so the call opens
    -- with what it actually looks like rather than with a form.
    if p_token is not null and length(p_token) >= 8 then
        select * into u from public.linkfinderai_users where token = p_token;
        if u.token is not null then
            select count(*) into v_count
              from public.enrichment_history where user_id = p_token;
            v_segment := case
                when u.subscription_id is not null and v_count > 0 then 'subscriber, active'
                when u.subscription_id is not null then 'subscriber, never activated'
                when coalesce(u.is_unlimited, false) and v_count > 0 then 'pack buyer, active'
                when coalesce(u.is_unlimited, false) then 'pack buyer, never activated'
                when v_count > 0 then 'free, has used it'
                else 'free, never used it'
            end;
        end if;
    end if;

    insert into public.sales_leads (
        offer, email, company_site, role, target, volume_band, message,
        src, landing_page, utm, user_token,
        credits_at_request, enrichments_at_request
    ) values (
        v_offer, v_email, left(btrim(p_site), 200), left(btrim(p_role), 120),
        left(btrim(p_target), 2000), left(btrim(p_volume), 60),
        left(btrim(p_message), 4000), left(btrim(p_src), 120),
        left(btrim(p_landing), 500), p_utm, u.token,
        u.credits, v_count
    ) returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id, 'offer', v_offer, 'segment', v_segment);
end;
$fn$;

revoke all on function public.sales_lead_request(text,text,text,text,text,text,text,text,text,jsonb,text) from public;
grant execute on function public.sales_lead_request(text,text,text,text,text,text,text,text,text,jsonb,text) to anon, authenticated;

-- What to read before a call. NOT an API surface.
--
-- A view with no security_invoker executes with its OWNER's rights, so it
-- bypasses the RLS on the table underneath it. Created without these two
-- lines, this view returned every lead to anyone holding the anon key -- which
-- is published in the page source. Measured before the fix: anon read 1 row
-- through the view while reading 0 rows from the table.
create or replace view public.sales_lead_inbox as
select id, created_at, offer, email, company_site, role, volume_band, src,
       landing_page, target, message, booked,
       credits_at_request, enrichments_at_request
  from public.sales_leads
 order by created_at desc;

-- Evaluate as the caller, so the table's RLS applies through the view...
alter view public.sales_lead_inbox set (security_invoker = on);
-- ...and do not hand it to the API roles in the first place.
revoke all on public.sales_lead_inbox from anon, authenticated;

-- Applied to production as two migrations: `sales_leads`, then
-- `sales_leads_lock_down_inbox_view` carrying the three lines above. Folded
-- together here so a fresh environment never has the gap. Every statement in
-- this file is idempotent, so applying it over either state is safe.
