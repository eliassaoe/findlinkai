-- Regression tests for 01_fix_task_credit_awarding.sql.
-- Every check aborts with a message naming the failure, so a silent pass is
-- a real pass. See tests/README.md for how to run this against a scratch
-- Postgres; it must never be pointed at production.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.expect(
    p_label text, p_actual numeric, p_expected numeric
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'FAIL %: expected %, got %', p_label, p_expected, p_actual;
    END IF;
    RAISE NOTICE 'pass: %', p_label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.balance(p_token text)
RETURNS numeric LANGUAGE sql AS $$
    SELECT credits FROM public.users WHERE token = p_token;
$$;

CREATE OR REPLACE FUNCTION pg_temp.row_credits(p_token text, p_task text)
RETURNS numeric LANGUAGE sql AS $$
    SELECT credits FROM public.onboarding_task_completions
     WHERE user_token = p_token AND task_name = p_task;
$$;

DO $$
BEGIN
    -- Baseline, straight from tests/mock_schema.sql.
    PERFORM pg_temp.expect('baseline alice', pg_temp.balance('tok_alice'), 25);
    PERFORM pg_temp.expect('baseline bob',   pg_temp.balance('tok_bob'),    0);
    PERFORM pg_temp.expect('baseline carol', pg_temp.balance('tok_carol'), 500);
END;
$$;

-- T1  The reported bug: approving by flipping status must move the balance.
UPDATE public.onboarding_task_completions SET status='completed'
 WHERE user_token='tok_alice' AND task_name='g2_review';
DO $$ BEGIN
    PERFORM pg_temp.expect('T1 approval awards 1000', pg_temp.balance('tok_alice'), 1025);
    PERFORM pg_temp.expect('T1 row credits corrected from 0',
                           pg_temp.row_credits('tok_alice','g2_review'), 1000);
END; $$;

-- T2  Toggling the status must never pay twice.
UPDATE public.onboarding_task_completions SET status='pending'
 WHERE user_token='tok_alice' AND task_name='g2_review';
UPDATE public.onboarding_task_completions SET status='completed'
 WHERE user_token='tok_alice' AND task_name='g2_review';
DO $$ BEGIN
    PERFORM pg_temp.expect('T2 re-approval does not double-pay', pg_temp.balance('tok_alice'), 1025);
END; $$;

-- T3  Editing an already-approved row is not a new approval.
UPDATE public.onboarding_task_completions SET review_url='https://g2.com/r/1-edited'
 WHERE user_token='tok_alice' AND task_name='g2_review';
DO $$ BEGIN
    PERFORM pg_temp.expect('T3 unrelated edit does not re-pay', pg_temp.balance('tok_alice'), 1025);
END; $$;

-- T4  Approvals flipped before this migration existed are recovered.
DO $$
DECLARE v_rows integer;
BEGIN
    SELECT count(*) INTO v_rows FROM public.backfill_onboarding_task_credits();
    PERFORM pg_temp.expect('T4 back-fill finds carol', v_rows, 1);
    PERFORM pg_temp.expect('T4 carol paid', pg_temp.balance('tok_carol'), 1500);
END; $$;

-- T5  Back-fill is re-runnable.
DO $$
DECLARE v_rows integer;
BEGIN
    SELECT count(*) INTO v_rows FROM public.backfill_onboarding_task_credits();
    PERFORM pg_temp.expect('T5 second back-fill is a no-op', v_rows, 0);
    PERFORM pg_temp.expect('T5 carol unchanged', pg_temp.balance('tok_carol'), 1500);
END; $$;

-- T6  Auto-approved tasks the worker inserts as already-completed still pay.
INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits)
VALUES ('tok_bob', 'youtube_subscribe', 'completed', 100);
DO $$ BEGIN
    PERFORM pg_temp.expect('T6 insert-as-completed awards 100', pg_temp.balance('tok_bob'), 100);
END; $$;

-- T7  A second task for the same user accumulates.
UPDATE public.onboarding_task_completions SET status='completed'
 WHERE user_token='tok_bob' AND task_name='trustpilot_review';
DO $$ BEGIN
    PERFORM pg_temp.expect('T7 second task accumulates', pg_temp.balance('tok_bob'), 600);
END; $$;

-- T8  An approval for a user with no balance row must not abort the approval,
--     and must not credit the row either.
INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits)
VALUES ('tok_ghost', 'linkedin_share', 'completed', 0);
DO $$
DECLARE v_stranded integer;
BEGIN
    PERFORM pg_temp.expect('T8 row not falsely credited',
                           pg_temp.row_credits('tok_ghost','linkedin_share'), 0);
    SELECT count(*) INTO v_stranded
      FROM public.onboarding_task_credit_grants WHERE NOT balance_applied;
    PERFORM pg_temp.expect('T8 stranded grant is queued for repair', v_stranded, 1);
END; $$;

-- T9  An unknown task awards nothing rather than guessing an amount.
INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits)
VALUES ('tok_alice', 'some_unconfigured_task', 'completed', 0);
DO $$ BEGIN
    PERFORM pg_temp.expect('T9 unknown task awards nothing', pg_temp.balance('tok_alice'), 1025);
END; $$;

-- T10 Once the missing user exists, the stranded grant is recovered.
INSERT INTO public.users (token, email, credits) VALUES ('tok_ghost','ghost@example.com', 10);
DO $$
DECLARE v_stranded integer;
BEGIN
    PERFORM public.backfill_onboarding_task_credits();
    PERFORM pg_temp.expect('T10 stranded grant recovered', pg_temp.balance('tok_ghost'), 160);
    PERFORM pg_temp.expect('T10 row credited on recovery',
                           pg_temp.row_credits('tok_ghost','linkedin_share'), 150);
    SELECT count(*) INTO v_stranded
      FROM public.onboarding_task_credit_grants WHERE NOT balance_applied;
    PERFORM pg_temp.expect('T10 repair queue drained', v_stranded, 0);
END; $$;

-- T11 A recovered grant is still protected against double payment.
UPDATE public.onboarding_task_completions SET status='pending'   WHERE user_token='tok_ghost';
UPDATE public.onboarding_task_completions SET status='completed' WHERE user_token='tok_ghost';
DO $$ BEGIN
    PERFORM pg_temp.expect('T11 recovered grant not re-paid', pg_temp.balance('tok_ghost'), 160);
END; $$;

-- T12 Repricing a task in the catalogue does not retroactively top anyone up.
UPDATE public.onboarding_task_catalog SET credits = 2000 WHERE task_name='g2_review';
UPDATE public.onboarding_task_completions SET status='pending'
 WHERE user_token='tok_alice' AND task_name='g2_review';
UPDATE public.onboarding_task_completions SET status='completed'
 WHERE user_token='tok_alice' AND task_name='g2_review';
DO $$ BEGIN
    PERFORM pg_temp.expect('T12 reprice does not backdate', pg_temp.balance('tok_alice'), 1025);
END; $$;

-- Final state, asserted as a whole.
DO $$ BEGIN
    PERFORM pg_temp.expect('final alice', pg_temp.balance('tok_alice'), 1025);
    PERFORM pg_temp.expect('final bob',   pg_temp.balance('tok_bob'),    600);
    PERFORM pg_temp.expect('final carol', pg_temp.balance('tok_carol'), 1500);
    PERFORM pg_temp.expect('final ghost', pg_temp.balance('tok_ghost'),  160);
    RAISE NOTICE 'ALL TESTS PASSED';
END; $$;
