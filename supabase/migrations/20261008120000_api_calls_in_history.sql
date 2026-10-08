-- API calls in History and in "What you've found". Applied live 8 Oct 2026. Spec: workers/api-history/README.md
--
-- History (history.html) and the account page's value summary
-- (user_value_summary) both read enrichment_history and nothing else. That
-- table is written inside the n8n app workflow, so a lookup made through
-- api.linkfinderai.com, the MCP server, n8n nodes or the Sheets add-on left no
-- trace a customer could find, and never counted as something they found.
--
-- Fix: the public API worker calls record_api_enrichment() after every 2xx
-- that carries a result. The function is written to be safe whether or not the
-- pipeline ALSO writes a row for that call, which cannot be checked from this
-- repo: if an identical row (same user, type and input) landed in the last two
-- minutes, it is tagged source = 'api' instead of duplicated. So nothing is
-- ever counted twice, and nothing a customer ran is missing.

alter table public.enrichment_history
    add column if not exists source text not null default 'app';

comment on column public.enrichment_history.source is
    'Where the lookup came from: app (the web app, the default) or api (api.linkfinderai.com and everything built on it: MCP, n8n, Sheets, Zapier).';

-- The two-minute dedupe lookup below rides the existing
-- enrichment_history_user_id_timestamp_idx (user_id, "timestamp" desc).

create or replace function public.record_api_enrichment(
    p_user_id      text,
    p_type         text,
    p_input        text,
    p_result       jsonb,
    p_credits_used integer default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
    if coalesce(btrim(p_user_id), '') = '' or coalesce(btrim(p_type), '') = '' then
        return null;
    end if;

    -- The pipeline may already have written this exact call.
    select id into v_id
      from public.enrichment_history
     where user_id = p_user_id
       and type = p_type
       and input is not distinct from p_input
       and "timestamp" > now() - interval '2 minutes'
     order by "timestamp" desc
     limit 1;

    if v_id is not null then
        update public.enrichment_history set source = 'api' where id = v_id;
        return v_id;
    end if;

    insert into public.enrichment_history (user_id, type, input, result, credits_used, "timestamp", source)
    values (p_user_id, p_type, p_input, coalesce(p_result, '{}'::jsonb), p_credits_used, now(), 'api')
    returning id into v_id;
    return v_id;
end;
$$;

-- Only the API worker calls this, with the service key. Not anon: the user id
-- is the session token and must not be writable from a browser.
revoke all on function public.record_api_enrichment(text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.record_api_enrichment(text, text, text, jsonb, integer) to service_role;
