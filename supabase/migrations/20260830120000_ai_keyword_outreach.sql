-- Listicle outreach, moved off n8n and onto pg_cron.
--
-- You add keywords to public.ai_keywords. Once a minute the cron job pokes the
-- process-ai-keyword Edge Function, which does ONE unit of work and returns:
-- either it discovers which pages the AI answer engines cite for the next
-- pending keyword, or it works one of those pages into leads. A keyword flips
-- to 'processed' when every page it turned up has been worked.
--
-- Only ever one keyword is in flight. That is deliberate: this spends real
-- LinkFinder credits, and one keyword at a time is the difference between a
-- queue you can watch and a bill you find out about afterwards.
--
-- The four statuses a keyword moves through:
--   pending      waiting its turn
--   discovering  the answer engines are being asked
--   enriching    its cited pages are being turned into leads, one per minute
--   processed    done — citations_found and leads_pushed are filled in
--   failed       every model refused, or discovery errored; `error` says why
--
-- NOTE there is an older, unrelated public.keywords table driven by
-- process-keyword, which scrapes Google (via Apify) and pushes to a different
-- Instantly campaign. It is still live. These tables do not touch it.

-- ---------------------------------------------------------------- the queue

create table if not exists public.ai_keywords (
    id              bigint generated always as identity primary key,
    keyword         text not null,
    status          text not null default 'pending'
                    check (status in ('pending', 'discovering', 'enriching', 'processed', 'failed')),
    citations_found integer not null default 0,
    leads_pushed    integer not null default 0,
    error           text,
    claimed_at      timestamptz,
    processed_at    timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Hundreds of keywords get pasted in at once, and the same one twice is a
-- second bill for the same answer.
create unique index if not exists ai_keywords_keyword_key
    on public.ai_keywords (lower(keyword));
create index if not exists ai_keywords_status_idx
    on public.ai_keywords (status, created_at);

-- ------------------------------------------------- what the engines cited

-- One row per page an answer engine cited for a keyword. This is the unit of
-- work for the enrichment half, and it is also the only record of the ranking
-- itself: which models cited a page, and where Google has it. The n8n flow
-- computed all of that and then threw it away.
create table if not exists public.ai_keyword_citations (
    id              bigint generated always as identity primary key,
    keyword_id      bigint not null references public.ai_keywords (id) on delete cascade,
    keyword         text not null,
    url             text not null,
    title           text,
    domain          text not null,
    cited_by        text[] not null default '{}',
    citation_count  integer not null default 1,
    google_position integer,
    status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'skipped', 'failed')),
    skip_reason     text,
    employees_seen  integer not null default 0,
    leads_pushed    integer not null default 0,
    error           text,
    claimed_at      timestamptz,
    processed_at    timestamptz,
    created_at      timestamptz not null default now()
);

create unique index if not exists ai_keyword_citations_url_key
    on public.ai_keyword_citations (keyword_id, url);
create index if not exists ai_keyword_citations_work_idx
    on public.ai_keyword_citations (status, keyword_id);
create index if not exists ai_keyword_citations_domain_idx
    on public.ai_keyword_citations (domain);

-- ------------------------------------------------------------- de-duping

-- The same twenty sites are cited for every keyword in a niche. Without this,
-- keyword two hundred pays to look up the same people keyword one already
-- found. A domain is worked once, ever.
create table if not exists public.ai_outreach_domains (
    domain           text primary key,
    first_keyword_id bigint references public.ai_keywords (id) on delete set null,
    first_keyword    text,
    employees_seen   integer not null default 0,
    leads_pushed     integer not null default 0,
    worked_at        timestamptz not null default now()
);

-- Everyone this has ever pushed, so nobody is mailed twice from two keywords.
create table if not exists public.ai_outreach_leads (
    id            bigint generated always as identity primary key,
    email         text not null,
    full_name     text,
    first_name    text,
    last_name     text,
    job_title     text,
    linkedin_url  text,
    company       text,
    domain        text not null,
    keyword_id    bigint references public.ai_keywords (id) on delete set null,
    keyword       text,
    citation_id   bigint references public.ai_keyword_citations (id) on delete set null,
    article_url   text,
    article_title text,
    -- 'employee_record' when the employee lookup already carried the address
    -- (free), 'linkedin_profile_to_email' when it had to be bought (10 credits).
    email_source  text,
    pushed        boolean not null default false,
    push_error    text,
    created_at    timestamptz not null default now()
);

create unique index if not exists ai_outreach_leads_email_key
    on public.ai_outreach_leads (lower(email));
create index if not exists ai_outreach_leads_keyword_idx
    on public.ai_outreach_leads (keyword_id);

-- Service-role only: the Edge Function reaches these, the anon key does not.
-- RLS on with no policy is what says so.
alter table public.ai_keywords          enable row level security;
alter table public.ai_keyword_citations enable row level security;
alter table public.ai_outreach_domains  enable row level security;
alter table public.ai_outreach_leads    enable row level security;

-- --------------------------------------------------------------- the loop

-- Hands the caller exactly one unit of work, and holds the "one keyword at a
-- time" rule in the one place both halves of the loop can see it.
create or replace function public.ai_claim_work()
returns jsonb
language plpgsql
as $$
declare
    v_keyword  public.ai_keywords%rowtype;
    v_citation public.ai_keyword_citations%rowtype;
begin
    -- Two invocations that both read "nothing in flight" would both start a
    -- keyword. Claiming is rare and quick, so serialising it costs nothing.
    perform pg_advisory_xact_lock(hashtext('ai_claim_work'));

    -- A keyword whose pages are all worked is finished. Doing this here rather
    -- than in the worker means a crash mid-keyword still closes out cleanly on
    -- the next tick.
    update public.ai_keywords k
       set status = 'processed',
           processed_at = now(),
           updated_at = now(),
           citations_found = (select count(*) from public.ai_keyword_citations c
                               where c.keyword_id = k.id),
           leads_pushed = coalesce((select sum(c.leads_pushed) from public.ai_keyword_citations c
                                     where c.keyword_id = k.id), 0)
     where k.status = 'enriching'
       and not exists (select 1 from public.ai_keyword_citations c
                        where c.keyword_id = k.id
                          and c.status in ('pending', 'processing'));

    -- Best page first: cited by the most models, then highest on Google. When
    -- a keyword's budget runs short, it is the strongest rankers that got done.
    select c.* into v_citation
      from public.ai_keyword_citations c
      join public.ai_keywords k on k.id = c.keyword_id
     where c.status = 'pending'
       and k.status = 'enriching'
     order by c.citation_count desc, c.google_position asc nulls last, c.id asc
     limit 1
       for update of c skip locked;

    if v_citation.id is not null then
        update public.ai_keyword_citations
           set status = 'processing', claimed_at = now()
         where id = v_citation.id;

        return jsonb_build_object(
            'kind', 'enrich',
            'citation_id', v_citation.id,
            'keyword_id', v_citation.keyword_id,
            'keyword', v_citation.keyword,
            'url', v_citation.url,
            'title', v_citation.title,
            'domain', v_citation.domain);
    end if;

    if exists (select 1 from public.ai_keywords where status in ('discovering', 'enriching')) then
        return jsonb_build_object('kind', 'idle', 'reason', 'a keyword is already in flight');
    end if;

    select * into v_keyword
      from public.ai_keywords
     where status = 'pending'
     order by created_at asc, id asc
     limit 1
       for update skip locked;

    if v_keyword.id is null then
        return jsonb_build_object('kind', 'idle', 'reason', 'no pending keywords');
    end if;

    update public.ai_keywords
       set status = 'discovering', claimed_at = now(), updated_at = now(), error = null
     where id = v_keyword.id;

    return jsonb_build_object('kind', 'discover', 'keyword_id', v_keyword.id, 'keyword', v_keyword.keyword);
end;
$$;

-- Records what the answer engines cited and moves the keyword on. One
-- statement, so a keyword is never left half-discovered.
create or replace function public.ai_keyword_discovered(
    p_keyword_id bigint,
    p_citations  jsonb,
    p_note       text default null)
returns integer
language plpgsql
as $$
declare
    v_inserted integer;
begin
    insert into public.ai_keyword_citations
        (keyword_id, keyword, url, title, domain, cited_by, citation_count, google_position)
    select p_keyword_id,
           k.keyword,
           c ->> 'url',
           nullif(c ->> 'title', ''),
           c ->> 'domain',
           coalesce((select array_agg(value #>> '{}') from jsonb_array_elements(c -> 'cited_by')), '{}'::text[]),
           greatest(coalesce((c ->> 'citation_count')::int, 1), 1),
           nullif(c ->> 'google_position', '')::int
      from jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) as c
      join public.ai_keywords k on k.id = p_keyword_id
     where c ->> 'url' is not null
       and c ->> 'domain' is not null
    on conflict (keyword_id, url) do nothing;

    get diagnostics v_inserted = row_count;

    update public.ai_keywords
       set status = 'enriching',
           citations_found = v_inserted,
           error = p_note,
           updated_at = now()
     where id = p_keyword_id;

    return v_inserted;
end;
$$;

-- Closes one page and keeps the keyword's clock ticking, which is what stops
-- the stale-work sweeper from treating a long keyword as stuck.
create or replace function public.ai_citation_done(
    p_citation_id bigint,
    p_status      text,
    p_leads       integer default 0,
    p_employees   integer default 0,
    p_skip_reason text default null,
    p_error       text default null)
returns void
language plpgsql
as $$
declare
    v_keyword_id bigint;
begin
    update public.ai_keyword_citations
       set status = p_status,
           leads_pushed = coalesce(p_leads, 0),
           employees_seen = coalesce(p_employees, 0),
           skip_reason = p_skip_reason,
           error = p_error,
           processed_at = now()
     where id = p_citation_id
    returning keyword_id into v_keyword_id;

    update public.ai_keywords
       set updated_at = now()
     where id = v_keyword_id;
end;
$$;

create or replace function public.ai_keyword_failed(p_keyword_id bigint, p_error text)
returns void
language sql
as $$
    update public.ai_keywords
       set status = 'failed', error = left(p_error, 2000), updated_at = now(), processed_at = now()
     where id = p_keyword_id;
$$;

-- An invocation that died mid-page leaves a claim behind. Nothing here takes
-- ten minutes, so a claim older than that belongs to a worker that is gone.
create or replace function public.reset_stuck_ai_work()
returns void
language sql
as $$
    update public.ai_keyword_citations
       set status = 'pending', claimed_at = null
     where status = 'processing'
       and claimed_at < now() - interval '10 minutes';

    update public.ai_keywords
       set status = 'pending', claimed_at = null
     where status = 'discovering'
       and claimed_at < now() - interval '10 minutes';
$$;

-- The keys this feature needs, out of the vault the cron jobs already use.
-- Named one by one so a leaked service key cannot turn this into a dump of
-- every secret in the project.
create or replace function public.ai_settings()
returns jsonb
language sql
security definer
set search_path = public
as $$
    select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
      from vault.decrypted_secrets
     where name in ('openrouter_api_key',
                    'serper_api_key',
                    'linkfinder_api_key',
                    'instantly_api_key',
                    'ai_keywords_campaign_id',
                    'ai_keywords_models');
$$;

revoke all on function public.ai_claim_work()                                          from public, anon, authenticated;
revoke all on function public.ai_keyword_discovered(bigint, jsonb, text)               from public, anon, authenticated;
revoke all on function public.ai_citation_done(bigint, text, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.ai_keyword_failed(bigint, text)                          from public, anon, authenticated;
revoke all on function public.reset_stuck_ai_work()                                    from public, anon, authenticated;
revoke all on function public.ai_settings()                                            from public, anon, authenticated;

grant execute on function public.ai_claim_work()                                          to service_role;
grant execute on function public.ai_keyword_discovered(bigint, jsonb, text)               to service_role;
grant execute on function public.ai_citation_done(bigint, text, integer, integer, text, text) to service_role;
grant execute on function public.ai_keyword_failed(bigint, text)                          to service_role;
grant execute on function public.reset_stuck_ai_work()                                    to service_role, postgres;
grant execute on function public.ai_settings()                                            to service_role;

-- A quick read on where the queue is up to.
create or replace view public.ai_keyword_progress with (security_invoker = true) as
    select k.id,
           k.keyword,
           k.status,
           k.citations_found,
           k.leads_pushed,
           count(c.id) filter (where c.status = 'pending')    as pages_waiting,
           count(c.id) filter (where c.status = 'done')       as pages_done,
           count(c.id) filter (where c.status = 'skipped')    as pages_skipped,
           k.error,
           k.created_at,
           k.processed_at
      from public.ai_keywords k
      left join public.ai_keyword_citations c on c.keyword_id = k.id
     group by k.id
     order by k.created_at;
