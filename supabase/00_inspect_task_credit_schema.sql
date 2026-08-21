-- Run this in the Supabase SQL editor and paste the output back.
-- It reports the exact table/column names the credit-award fix needs,
-- and whether anything at all is currently listening for the
-- status -> 'completed' transition on the task table.

-- 1. Which tables hold onboarding-task rows and which hold credit balances?
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema','auth','storage','realtime','vault','extensions','graphql','net','cron')
  AND (table_name ILIKE '%task%' OR table_name ILIKE '%credit%' OR table_name ILIKE '%user%')
ORDER BY table_schema, table_name;

-- 2. Full column list for anything task- or credit-shaped.
SELECT table_name, ordinal_position, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name ILIKE '%task%' OR table_name ILIKE '%credit%' OR table_name ILIKE '%user%')
ORDER BY table_name, ordinal_position;

-- 3. THE KEY QUESTION: is any trigger attached to the task table?
--    An empty result here means flipping status to 'completed' in the
--    dashboard fires nothing, which is exactly the reported symptom.
SELECT event_object_table AS table_name,
       trigger_name,
       action_timing,
       event_manipulation,
       action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 4. Any scheduled job that might be reconciling approvals out-of-band?
SELECT jobid, schedule, jobname, command
FROM cron.job;   -- errors harmlessly if pg_cron is not installed

-- 5. Distinct status values actually present, so the trigger matches reality
--    (e.g. 'completed' vs 'complete' vs 'approved').
--    Replace onboarding_task_completions if step 1 shows a different name.
SELECT status, count(*)
FROM public.onboarding_task_completions
GROUP BY status
ORDER BY 2 DESC;
