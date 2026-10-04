-- Agency pricing: who is in the "agency" segment, stored on the account.
-- Spec and the full flow: docs/agency-pricing.md
--
-- A visitor becomes "agency" by landing on a URL with utm_campaign=agency* or
-- an email= parameter. Before signup that lives in a first-party cookie
-- (segment=agency, 365 days). At signup it is copied here, and from then on
-- THIS column is the source of truth: it survives cleared cookies and a login
-- on another device, and it is what the dodo-checkout worker reads to refuse
-- the $49 Starter plan.
--
-- Two rules shape the functions below:
--
--   1. Only NEW signups are flagged. An existing account -- above all one
--      already paying $49 -- must never be moved into the segment because its
--      owner later clicked an agency link. So a claim is accepted only for an
--      account created in the last 24 hours with no subscription.
--      linkfinderai_users had no creation timestamp, so one is added: NULL for
--      every row that exists today (=> never claimable), now() for new rows.
--
--   2. The segment is a restriction, not a privilege (it removes a plan, it
--      grants nothing), so letting the browser claim it with its own token is
--      safe. It can only ever be SET to 'agency', never cleared or changed,
--      through these functions.

-- No default on ADD COLUMN: existing rows must stay NULL. The default is set
-- afterwards so it applies to future inserts only.
alter table public.linkfinderai_users add column if not exists created_at timestamptz;
alter table public.linkfinderai_users alter column created_at set default now();

alter table public.linkfinderai_users add column if not exists segment text;
alter table public.linkfinderai_users drop constraint if exists linkfinderai_users_segment_check;
alter table public.linkfinderai_users
    add constraint linkfinderai_users_segment_check check (segment is null or segment in ('agency'));

/*
 * Called by the browser right after signup (sign-up.html,
 * confirmation-signup.html) and again on app load as a retry, when the
 * visitor carries the segment=agency cookie. Returns the account's segment
 * after the call, so the caller can sync its cookie to the database.
 */
create or replace function public.claim_user_segment(p_token text, p_segment text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
    u public.linkfinderai_users%rowtype;
begin
    if p_token is null or length(p_token) < 8 then
        return jsonb_build_object('ok', false, 'error', 'invalid token');
    end if;

    select * into u from public.linkfinderai_users where token = p_token limit 1;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'unknown token');
    end if;

    if u.segment is not null then
        return jsonb_build_object('ok', true, 'segment', u.segment, 'claimed', false);
    end if;

    if p_segment = 'agency'
       and u.created_at is not null
       and u.created_at > now() - interval '24 hours'
       and u.subscription_id is null then
        update public.linkfinderai_users set segment = 'agency' where token = p_token;
        return jsonb_build_object('ok', true, 'segment', 'agency', 'claimed', true);
    end if;

    return jsonb_build_object('ok', true, 'segment', null, 'claimed', false);
end;
$fn$;

/*
 * Read-only: the segment for a token, or null. Used by app.html / account.html
 * on load (so a login on a new device gets agency pricing without the cookie)
 * and by the dodo-checkout worker before creating a Starter session.
 */
create or replace function public.get_user_segment(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
    select segment from public.linkfinderai_users
     where p_token is not null and length(p_token) >= 8 and token = p_token
     limit 1;
$fn$;

revoke all on function public.claim_user_segment(text, text) from public;
revoke all on function public.get_user_segment(text) from public;
grant execute on function public.claim_user_segment(text, text) to anon, authenticated, service_role;
grant execute on function public.get_user_segment(text) to anon, authenticated, service_role;
