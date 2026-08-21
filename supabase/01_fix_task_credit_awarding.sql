-- ===========================================================================
-- Fix: approving an onboarding task never moved any credits.
--
-- Why this is needed
-- ------------------
-- Review tasks (g2_review, trustpilot_review) are submitted to
-- onboarding-tasks-worker's /tasks/submit-review, which files them as
-- status='pending' with credits=0 (see app.html:4936). Approving one meant
-- flipping status to 'completed' by hand in the Supabase table editor.
--
-- Nothing was listening to that flip. The only code that grants credits lives
-- inside the worker's /tasks/complete handler, which review tasks never touch.
-- A dashboard UPDATE fires no worker, so the row said "completed" and the
-- balance never moved.
--
-- This migration makes the database itself the thing that reacts, so the
-- existing approval workflow (flip the status field) starts working as-is.
--
-- Properties
-- ----------
--   * Idempotent. A grant is recorded in a ledger with a uniqueness guarantee,
--     so flipping completed -> pending -> completed cannot pay twice.
--   * Credit amounts come from a catalogue table, not from the row's `credits`
--     column, because pending review rows are written with credits = 0.
--   * Back-fills approvals that were already flipped and silently dropped.
--   * Every grant is auditable: who, which task, how much, when.
--
-- Run order: 00_inspect_task_credit_schema.sql first to confirm the names in
-- the CONFIGURE section below match your schema.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight. These four names were inferred from the client code, not read off
-- the live database. If any is wrong the migration stops here with a message
-- naming the mismatch, rather than half-applying and failing cryptically later.
-- Run 00_inspect_task_credit_schema.sql to get the real names, then correct
-- them here and in the two places flagged CONFIGURE below.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
    v_missing text := '';
BEGIN
    IF to_regclass('public.onboarding_task_completions') IS NULL THEN
        v_missing := v_missing || E'\n  - table public.onboarding_task_completions (the task log)';
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='onboarding_task_completions'
                          AND column_name='user_token') THEN
            v_missing := v_missing || E'\n  - onboarding_task_completions.user_token';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='onboarding_task_completions'
                          AND column_name='task_name') THEN
            v_missing := v_missing || E'\n  - onboarding_task_completions.task_name';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='onboarding_task_completions'
                          AND column_name='status') THEN
            v_missing := v_missing || E'\n  - onboarding_task_completions.status';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='onboarding_task_completions'
                          AND column_name='credits') THEN
            v_missing := v_missing || E'\n  - onboarding_task_completions.credits';
        END IF;
    END IF;

    IF to_regclass('public.users') IS NULL THEN
        v_missing := v_missing || E'\n  - table public.users (the credit balance)';
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='users' AND column_name='token') THEN
            v_missing := v_missing || E'\n  - users.token';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='users' AND column_name='credits') THEN
            v_missing := v_missing || E'\n  - users.credits';
        END IF;
    END IF;

    IF v_missing <> '' THEN
        RAISE EXCEPTION E'Schema mismatch, nothing was applied. Not found:%\n\nRun 00_inspect_task_credit_schema.sql to list the real names, then edit add_user_credits() and the CREATE TRIGGER statement in this file to match.',
            v_missing;
    END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- CONFIGURE: the one place that touches your credit balance.
--
-- This assumes balances live in public.users(token, credits). If yours differ,
-- this function body is the ONLY thing to edit -- everything below calls it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_user_credits(
    p_user_token text,
    p_amount     numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated integer;
BEGIN
    IF p_user_token IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
        RETURN false;
    END IF;

    UPDATE public.users
       SET credits = COALESCE(credits, 0) + p_amount
     WHERE token = p_user_token;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        -- Do not abort the caller's transaction over an unknown user: the
        -- approval itself is still valid and worth recording. Surfacing it as
        -- a warning keeps it visible in the Postgres logs.
        RAISE WARNING 'add_user_credits: no user row for token %, % credits not applied',
            p_user_token, p_amount;
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Catalogue: the credit value of each task, as data rather than duplicated
-- between app.html's OTP_TASKS array and the worker. Amounts mirror
-- app.html:4693-4699. Changing a payout is now an UPDATE here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_task_catalog (
    task_name  text PRIMARY KEY,
    credits    numeric NOT NULL CHECK (credits >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.onboarding_task_catalog (task_name, credits) VALUES
    ('g2_review',          1000),
    ('youtube_subscribe',   100),
    ('linkedin_share',      150),
    ('trustpilot_review',   500)
ON CONFLICT (task_name) DO UPDATE
    SET credits    = EXCLUDED.credits,
        updated_at = now();

-- ---------------------------------------------------------------------------
-- Ledger: one row per credit grant that actually happened. The unique
-- constraint is what makes double-payment impossible, no matter how many times
-- a status is toggled or the back-fill is re-run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_task_credit_grants (
    id              bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_token      text    NOT NULL,
    task_name       text    NOT NULL,
    credits_awarded numeric NOT NULL,
    balance_applied boolean NOT NULL DEFAULT false,
    granted_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT onboarding_task_credit_grants_once UNIQUE (user_token, task_name)
);

CREATE INDEX IF NOT EXISTS onboarding_task_credit_grants_user_idx
    ON public.onboarding_task_credit_grants (user_token);

-- Ledger is service-side only: RLS on with no policies means anon/authenticated
-- clients cannot read or forge grants.
ALTER TABLE public.onboarding_task_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_task_catalog       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- The award itself. Shared by the trigger and the back-fill so there is
-- exactly one definition of "approving a task pays out".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_onboarding_task_credits(
    p_user_token   text,
    p_task_name    text,
    p_row_credits  numeric DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_amount  numeric;
    v_applied boolean;
    v_claimed integer;
BEGIN
    IF p_user_token IS NULL OR p_task_name IS NULL THEN
        RETURN 0;
    END IF;

    -- Catalogue is authoritative. The row's own credits column is a fallback
    -- only, since pending review rows carry 0 and would otherwise pay nothing.
    SELECT credits INTO v_amount
      FROM public.onboarding_task_catalog
     WHERE task_name = p_task_name;

    IF v_amount IS NULL THEN
        v_amount := NULLIF(p_row_credits, 0);
    END IF;

    IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE WARNING 'grant_onboarding_task_credits: no credit amount known for task %, nothing awarded to %',
            p_task_name, p_user_token;
        RETURN 0;
    END IF;

    -- Claim the grant first. If the unique constraint rejects it, this user has
    -- already been paid for this task and we must not pay again.
    INSERT INTO public.onboarding_task_credit_grants (user_token, task_name, credits_awarded)
    VALUES (p_user_token, p_task_name, v_amount)
    ON CONFLICT ON CONSTRAINT onboarding_task_credit_grants_once DO NOTHING;

    GET DIAGNOSTICS v_claimed = ROW_COUNT;

    IF v_claimed = 0 THEN
        -- A grant is already on record. Normally that means paid, and we stop.
        -- But a grant whose balance update failed at approval time (no user row
        -- yet) would otherwise be stranded forever behind its own claim, so
        -- those are retried instead of skipped.
        SELECT credits_awarded, balance_applied
          INTO v_amount, v_applied
          FROM public.onboarding_task_credit_grants
         WHERE user_token = p_user_token
           AND task_name  = p_task_name;

        IF v_applied THEN
            RETURN 0;   -- already paid, not an error
        END IF;
    END IF;

    v_applied := public.add_user_credits(p_user_token, v_amount);

    UPDATE public.onboarding_task_credit_grants
       SET balance_applied = v_applied
     WHERE user_token = p_user_token
       AND task_name  = p_task_name;

    -- Report only what actually reached a balance. The trigger writes this back
    -- to the row's credits column, and a stranded grant must not show up in the
    -- UI as credits the user can spend.
    IF NOT v_applied THEN
        RETURN 0;
    END IF;

    RETURN v_amount;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: fires the moment a task row becomes completed, whichever way it
-- happens -- dashboard edit, SQL update, or the worker inserting an
-- already-completed row for an auto-approved task.
--
-- BEFORE rather than AFTER so it can also correct the row's own `credits`
-- column in place (pending rows are stored as 0, and app.html's
-- otpEarnedTotal() sums that column to show "credits earned").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_onboarding_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_awarded numeric;
BEGIN
    IF NEW.status IS DISTINCT FROM 'completed' THEN
        RETURN NEW;
    END IF;

    -- Only on the transition into completed, so ordinary edits to an already
    -- approved row (fixing a URL, adding a note) do not re-enter the award path.
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    v_awarded := public.grant_onboarding_task_credits(
        NEW.user_token, NEW.task_name, NEW.credits
    );

    IF v_awarded > 0 THEN
        NEW.credits := v_awarded;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onboarding_task_completed_awards_credits
    ON public.onboarding_task_completions;

CREATE TRIGGER onboarding_task_completed_awards_credits
    BEFORE INSERT OR UPDATE ON public.onboarding_task_completions
    FOR EACH ROW
    EXECUTE FUNCTION public.on_onboarding_task_completed();

-- ---------------------------------------------------------------------------
-- Back-fill: every approval flipped before this trigger existed. Re-runnable --
-- the ledger's unique constraint makes a second run a no-op.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_onboarding_task_credits()
RETURNS TABLE (user_token text, task_name text, credits_awarded numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r        record;
    v_amount numeric;
BEGIN
    FOR r IN
        SELECT c.user_token, c.task_name, c.credits
          FROM public.onboarding_task_completions c
         WHERE c.status = 'completed'
           AND NOT EXISTS (
               -- Not merely "no grant recorded": a recorded grant that never
               -- reached a balance still owes the user credits.
               SELECT 1 FROM public.onboarding_task_credit_grants g
                WHERE g.user_token = c.user_token
                  AND g.task_name  = c.task_name
                  AND g.balance_applied
           )
    LOOP
        v_amount := public.grant_onboarding_task_credits(r.user_token, r.task_name, r.credits);
        IF v_amount > 0 THEN
            UPDATE public.onboarding_task_completions
               SET credits = v_amount
             WHERE onboarding_task_completions.user_token = r.user_token
               AND onboarding_task_completions.task_name  = r.task_name;

            user_token      := r.user_token;
            task_name       := r.task_name;
            credits_awarded := v_amount;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Run this separately, after reviewing the migration above, to pay out the
-- approvals that were dropped. It prints exactly who got what.
-- ---------------------------------------------------------------------------
-- SELECT * FROM public.backfill_onboarding_task_credits();
