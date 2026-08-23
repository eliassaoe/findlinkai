-- ===========================================================================
-- Database support for the onboarding tasks worker.
--
-- Constraints and one atomic function. Deliberately NO credit-awarding
-- trigger: the worker grants credits, and a trigger doing it too would pay
-- everyone twice.
--
-- Safe to re-run.
-- ===========================================================================

BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.linkfinderai_users') IS NULL THEN
        RAISE EXCEPTION 'public.linkfinderai_users not found';
    END IF;
    IF to_regclass('public.user_task_completions') IS NULL THEN
        RAISE EXCEPTION 'public.user_task_completions not found';
    END IF;
    IF to_regclass('public.pending_reviews') IS NULL THEN
        RAISE EXCEPTION 'public.pending_reviews not found';
    END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- Atomic credit grant.
--
-- The worker previously read credits, added, and wrote back. Two grants
-- landing together lose one — the reader sees a stale balance and overwrites
-- the other's write. This does it in one statement, so the row lock
-- serialises them.
--
-- Returns the new balance, or NULL when the token matches nobody, so the
-- caller can tell "credited" from "no such user" without a second query.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_user_credits(
    p_token  text,
    p_amount numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new numeric;
BEGIN
    UPDATE public.linkfinderai_users
       SET credits = COALESCE(credits, 0) + p_amount
     WHERE token = p_token
    RETURNING credits INTO v_new;

    RETURN v_new;   -- NULL when no row matched
END;
$$;

-- ---------------------------------------------------------------------------
-- One completion per person per task.
--
-- The worker checks "already completed?" then inserts. Two requests arriving
-- together both pass the check and both credit. This is what actually stops
-- that; the worker's check just turns it into a friendly message instead of
-- a database error.
--
-- Referrals are excluded because they are legitimately one row per referred
-- friend, and get their own constraint below.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS user_task_completions_one_per_task
    ON public.user_task_completions (user_id, task_name)
    WHERE task_name <> 'referral';

CREATE UNIQUE INDEX IF NOT EXISTS user_task_completions_one_per_referral
    ON public.user_task_completions (user_id, referred_user_id)
    WHERE task_name = 'referral';

-- ---------------------------------------------------------------------------
-- One payout per review, across everybody.
--
-- review_key is the review's identity extracted from its URL by the worker,
-- so http/https, www, a /fr/ locale segment, tracking parameters, casing and
-- a trailing slash all collapse to one value. Without this, the same review
-- link can be passed around and redeemed repeatedly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.pending_reviews
    ADD COLUMN IF NOT EXISTS review_key   text,
    ADD COLUMN IF NOT EXISTS auto_verdict text,
    ADD COLUMN IF NOT EXISTS auto_reason  text;

CREATE UNIQUE INDEX IF NOT EXISTS pending_reviews_one_per_review
    ON public.pending_reviews (review_key)
    WHERE review_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS pending_reviews_status_idx
    ON public.pending_reviews (status);

COMMIT;

-- ---------------------------------------------------------------------------
-- Existing duplicates will block the unique indexes above. If either fails,
-- find the offenders first:
--
--   SELECT user_id, task_name, count(*)
--   FROM public.user_task_completions
--   WHERE task_name <> 'referral'
--   GROUP BY 1,2 HAVING count(*) > 1;
--
-- Decide what to keep before deleting anything — a duplicate may mean
-- somebody was credited twice.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- Reviews that are known to actually exist.
--
-- Added after a fabricated URL — a real product slug with an invented review
-- id — was auto-approved. URL shape cannot catch that: the id is just a
-- number, so valid-looking URLs can be minted without limit.
--
-- The fix is not to check the submitted URL harder. It is to keep the set of
-- reviews that genuinely exist for linkfinder-ai and check membership. Fetching
-- our own review list is easy; fetching an arbitrary review URL past bot
-- protection is not.
--
-- Populate it through POST /admin/sync-reviews from whatever source you like
-- (an Apify G2 actor, the Trustpilot Business API, or pasting URLs by hand).
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.known_reviews (
    review_key    text PRIMARY KEY,   -- same key the worker derives from a URL
    platform      text NOT NULL,
    review_url    text,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS known_reviews_platform_idx
    ON public.known_reviews (platform);

ALTER TABLE public.known_reviews ENABLE ROW LEVEL SECURITY;

COMMIT;

-- An empty table means nothing auto-approves and everything queues for you,
-- which is the safe default: better a short manual queue than a faucet.


-- ===========================================================================
-- Survey answers.
--
-- The product_survey task stores four answers rather than a URL. jsonb, not
-- four columns, because the questions will be replaced once they have been
-- answered enough times and a schema migration per question set is not worth
-- it. The worker validates every value against its own option list before this
-- is ever written, so what lands here is always one of a known set plus one
-- length-capped free-text field.
-- ===========================================================================

ALTER TABLE public.user_task_completions
    ADD COLUMN IF NOT EXISTS payload jsonb;

-- Answers are only ever read in aggregate, so index the two that get grouped.
CREATE INDEX IF NOT EXISTS user_task_completions_survey_idx
    ON public.user_task_completions ((payload->>'cadence'), (payload->>'role'))
    WHERE task_name = 'product_survey';
