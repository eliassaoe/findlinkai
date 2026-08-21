-- Paste this whole file into the Supabase SQL editor and run it, then send
-- me the output.
--
-- It is deliberately ONE query. The Supabase editor only shows the result
-- grid of the last statement, so a script of separate SELECTs would hide
-- most of its own answer. Everything comes back in one table, tagged by
-- section.
--
-- What to look for:
--   section 3 lists triggers on the task table. If nothing is listed there,
--   that is the bug: flipping status to 'completed' fires nothing.

SELECT '1. tables'  AS section,
       table_schema AS name,
       table_name   AS detail_1,
       ''           AS detail_2,
       ''           AS detail_3
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema','auth','storage',
                           'realtime','vault','extensions','graphql','net','cron')
  AND (table_name ILIKE '%task%' OR table_name ILIKE '%credit%' OR table_name ILIKE '%user%')

UNION ALL

SELECT '2. columns',
       table_name,
       column_name,
       data_type,
       COALESCE(column_default, '')
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name ILIKE '%task%' OR table_name ILIKE '%credit%' OR table_name ILIKE '%user%')

UNION ALL

-- The decisive one. No rows for the task table = nothing reacts to an approval.
SELECT '3. triggers',
       event_object_table,
       trigger_name,
       action_timing || ' ' || event_manipulation,
       left(action_statement, 200)
FROM information_schema.triggers
WHERE trigger_schema = 'public'

ORDER BY 1, 2, 3;


-- ---------------------------------------------------------------------------
-- Then run this one separately, substituting the real table name from
-- section 1 if it is not onboarding_task_completions. It shows which status
-- values actually exist, so the trigger matches your spelling of "completed".
-- ---------------------------------------------------------------------------
-- SELECT status, count(*) AS rows, min(created_at) AS first_seen, max(created_at) AS last_seen
-- FROM public.onboarding_task_completions
-- GROUP BY status
-- ORDER BY 2 DESC;
