-- "Get started" checklist rewards (docs/onboarding-checklist.md, 18 Nov 2026).
--
-- Step 2: first search of your own (not one of the start-screen examples) -> 25 credits.
-- Step 3: first list of 5+ rows processed in bulk (the sample list has 8) -> 50 credits.
--
-- Called from the browser with the publishable key, so everything that matters
-- is checked here: the account must be new (created on/after launch), the work
-- must be in enrichment_history / csv_enrichment_batches, and the unique index
-- on user_task_completions (user_id, task_name) pays each step at most once.
create or replace function public.lf_starter_reward(p_token text, p_step text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_task    text;
    v_credits numeric;
    v_ok      boolean;
    v_balance numeric;
begin
    if p_step = 'own_search' then
        v_task := 'starter_own_search'; v_credits := 25;
    elsif p_step = 'first_list' then
        v_task := 'starter_first_list'; v_credits := 50;
    else
        return jsonb_build_object('error', 'unknown step');
    end if;

    if not exists (select 1 from linkfinderai_users u
                   where u.token = p_token and u.created_at >= timestamptz '2026-11-18 00:00:00+00') then
        return jsonb_build_object('error', 'not eligible');
    end if;

    if exists (select 1 from user_task_completions c where c.user_id = p_token and c.task_name = v_task) then
        return jsonb_build_object('error', 'already paid');
    end if;

    if p_step = 'own_search' then
        select exists (
            select 1 from enrichment_history e
             where e.user_id = p_token
               and e.input not ilike '%satyanadella%'
               and e.input not ilike 'satya nadella%'
               and e.input not ilike '%linkedin.com/company/microsoft%'
               and lower(trim(e.input)) not in ('tesla', 'tesla.com', 'microsoft', 'microsoft.com')
        ) into v_ok;
    else
        select exists (
            select 1 from csv_enrichment_batches b
             where b.user_id = p_token and coalesce(b.processed_rows, 0) >= 5
        ) into v_ok;
    end if;

    if not v_ok then
        return jsonb_build_object('error', 'not done yet');
    end if;

    begin
        insert into user_task_completions (user_id, task_name, status, credits)
        values (p_token, v_task, 'completed', v_credits);
    exception when unique_violation then
        return jsonb_build_object('error', 'already paid');
    end;

    update linkfinderai_users set credits = coalesce(credits, 0) + v_credits
     where token = p_token returning credits into v_balance;

    return jsonb_build_object('credits_awarded', v_credits, 'credits_balance', v_balance, 'task_name', v_task);
end;
$$;

revoke all on function public.lf_starter_reward(text, text) from public;
grant execute on function public.lf_starter_reward(text, text) to anon, authenticated;
