-- The clock.
--
-- Once a minute, as asked: one keyword's worth of work per tick, and never two
-- keywords at once (public.ai_claim_work holds that rule). A keyword takes
-- roughly one tick to discover plus one per page it turned up, so a keyword
-- that lands ten pages finishes in about eleven minutes and the next one starts.
--
-- Raise the rate by adding a second job with a pg_sleep offset, the way
-- process-partner-1..4 do it. Do that only with the credit maths in
-- docs/ai-keyword-outreach.md in front of you: the cadence IS the spend rate.
--
-- The sweeper picks up work whose worker died mid-slice. Nothing here takes ten
-- minutes, so a claim older than that belongs to nobody.

do $$
begin
    perform cron.unschedule('process-ai-keyword')
      where exists (select 1 from cron.job where jobname = 'process-ai-keyword');
    perform cron.unschedule('reset-stuck-ai-work')
      where exists (select 1 from cron.job where jobname = 'reset-stuck-ai-work');
end $$;

select cron.schedule('process-ai-keyword', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/process-ai-keyword',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_fn_key'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000);
$job$);

select cron.schedule('reset-stuck-ai-work', '*/10 * * * *', $job$ select public.reset_stuck_ai_work(); $job$);
