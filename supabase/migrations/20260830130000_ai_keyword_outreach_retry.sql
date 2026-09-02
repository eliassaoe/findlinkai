-- Out of credits is not a bad keyword.
--
-- Without this, an empty OpenRouter or LinkFinder balance writes off the whole
-- queue: the cron claims a keyword a minute, every model answers 402, and the
-- row is marked 'failed' as though the keyword were at fault. Hundreds of
-- keywords burn in an afternoon and there is nothing to re-run but a list of
-- identical errors.
--
-- These two put the work back where it was, with the reason recorded, so the
-- queue simply stalls until the balance is topped up and then carries on.

create or replace function public.ai_keyword_requeue(p_keyword_id bigint, p_error text)
returns void
language sql
as $$
    update public.ai_keywords
       set status = 'pending', claimed_at = null, error = left(p_error, 2000), updated_at = now()
     where id = p_keyword_id;
$$;

create or replace function public.ai_citation_requeue(p_citation_id bigint, p_error text)
returns void
language plpgsql
as $$
declare
    v_keyword_id bigint;
begin
    update public.ai_keyword_citations
       set status = 'pending', claimed_at = null, error = left(p_error, 2000)
     where id = p_citation_id
    returning keyword_id into v_keyword_id;

    update public.ai_keywords
       set updated_at = now()
     where id = v_keyword_id;
end;
$$;

revoke all on function public.ai_keyword_requeue(bigint, text)  from public, anon, authenticated;
revoke all on function public.ai_citation_requeue(bigint, text) from public, anon, authenticated;

grant execute on function public.ai_keyword_requeue(bigint, text)  to service_role;
grant execute on function public.ai_citation_requeue(bigint, text) to service_role;
