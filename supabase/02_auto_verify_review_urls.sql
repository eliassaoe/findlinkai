-- ===========================================================================
-- Auto-approve review submissions, so credits are not gated on manual review.
--
-- Runs 01_fix_task_credit_awarding.sql's award trigger for you: this decides
-- status, that pays out. Apply 01 first.
--
-- What it checks, in order:
--   1. Shape   - is this a permalink to one specific review, or just a page
--                anyone could copy?
--   2. Product - does it point at LinkFinder rather than some other company?
--   3. Unique  - has this exact review already been claimed, by anyone?
--
-- What it does NOT check: that the review exists, is live, is positive, or was
-- written by the person submitting it. That needs an HTTP fetch, and both
-- sites sit behind bot protection that refuses datacenter IPs. See the
-- "Residual risk" note at the bottom before relying on this.
-- ===========================================================================

BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.onboarding_task_completions') IS NULL THEN
        RAISE EXCEPTION 'public.onboarding_task_completions not found. Run 00_inspect_task_credit_schema.sql and correct the names first.';
    END IF;
    IF to_regprocedure('public.grant_onboarding_task_credits(text,text,numeric)') IS NULL THEN
        RAISE EXCEPTION 'Apply 01_fix_task_credit_awarding.sql first — without it this would flip statuses that still pay nobody.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='onboarding_task_completions'
                      AND column_name IN ('review_url','submitted_url')) THEN
        RAISE EXCEPTION 'No review_url or submitted_url column on onboarding_task_completions — nothing to verify.';
    END IF;
END;
$preflight$;

-- Audit columns. Additive, so an existing table keeps everything it had.
ALTER TABLE public.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS review_key    text,
    ADD COLUMN IF NOT EXISTS auto_verdict  text,
    ADD COLUMN IF NOT EXISTS auto_reason   text,
    ADD COLUMN IF NOT EXISTS auto_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- Policy switches. Change a value here and the behaviour changes on the next
-- submission — no redeploy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_review_policy (
    key   text PRIMARY KEY,
    value text NOT NULL,
    note  text
);
ALTER TABLE public.onboarding_review_policy ENABLE ROW LEVEL SECURITY;

INSERT INTO public.onboarding_review_policy (key, value, note) VALUES
    ('trustpilot_permalink', 'auto',
     'auto | manual. A Trustpilot permalink proves a specific review exists but NOT that it is about LinkFinder — the company name is not in the URL. auto accepts that risk; manual queues them for you.'),
    ('g2_permalink', 'auto',
     'auto | manual. A G2 permalink contains the linkfinder-ai product slug, so product identity is provable from the URL itself.')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The review's identity, extracted from the URL. NULL means "not a permalink
-- to one specific LinkFinder review" — which is the whole test for G2, and
-- half of it for Trustpilot.
--
-- Returning a key rather than a normalised URL is deliberate: it makes
-- http/https, www, the /fr/ locale prefix, tracking query strings and a
-- trailing slash all collapse to the same value, so none of them can be used
-- to submit one review twice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_url_key(p_task_name text, p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    u text := lower(btrim(coalesce(p_url, '')));
    m text;
BEGIN
    IF u = '' THEN RETURN NULL; END IF;

    IF p_task_name = 'g2_review' THEN
        -- https://www.g2.com/fr/products/linkfinder-ai/reviews/<review-slug>
        m := substring(u from '^https?://(?:www\.)?g2\.com(?:/[a-z]{2})?/products/linkfinder-ai/reviews/([a-z0-9._~-]+)');
        IF m IS NOT NULL THEN RETURN 'g2:' || m; END IF;

        -- https://www.g2.com/survey_responses/linkfinder-ai-review-<id>
        m := substring(u from '^https?://(?:www\.)?g2\.com(?:/[a-z]{2})?/survey_responses/(linkfinder-ai[a-z0-9._~-]*)');
        IF m IS NOT NULL THEN RETURN 'g2:' || m; END IF;

        RETURN NULL;
    END IF;

    IF p_task_name = 'trustpilot_review' THEN
        -- https://www.trustpilot.com/reviews/<24-hex id>, any language subdomain.
        m := substring(u from '^https?://(?:[a-z]{2}\.)?(?:www\.)?trustpilot\.com/reviews/([0-9a-f]{20,32})');
        IF m IS NOT NULL THEN RETURN 'tp:' || m; END IF;

        RETURN NULL;
    END IF;

    RETURN NULL;
END;
$$;

-- One review, one claim, across every user. This is what stops the same link
-- being passed around and redeemed repeatedly.
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_task_review_key_once
    ON public.onboarding_task_completions (review_key)
    WHERE review_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- The verdict. Pure function of the URL and the policy, so it can be tested
-- and reasoned about without touching a row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classify_review_url(p_task_name text, p_url text)
RETURNS TABLE (verdict text, reason text, key text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    u        text := lower(btrim(coalesce(p_url, '')));
    v_key    text;
    v_policy text;
BEGIN
    key := NULL;

    IF u = '' THEN
        verdict := 'reject'; reason := 'no URL submitted'; RETURN NEXT; RETURN;
    END IF;

    IF u !~ '^https?://' THEN
        verdict := 'reject'; reason := 'not an http(s) URL'; RETURN NEXT; RETURN;
    END IF;

    -- Named separately from "unrecognised" because it is the single most
    -- common honest mistake: people paste the link we gave them.
    IF p_task_name = 'trustpilot_review'
       AND u ~ '^https?://(?:[a-z]{2}\.)?(?:www\.)?trustpilot\.com/review/linkfinderai\.com' THEN
        verdict := 'reject';
        reason  := 'that is our Trustpilot company page, not a link to your review — open your review and copy its own URL';
        RETURN NEXT; RETURN;
    END IF;

    IF p_task_name = 'g2_review'
       AND u ~ '^https?://(?:www\.)?g2\.com(?:/[a-z]{2})?/products/linkfinder-ai/reviews/?$' THEN
        verdict := 'reject';
        reason  := 'that is our G2 reviews page, not a link to your review — open your review and copy its own URL';
        RETURN NEXT; RETURN;
    END IF;

    v_key := public.review_url_key(p_task_name, u);

    IF v_key IS NULL THEN
        verdict := 'reject';
        reason  := CASE p_task_name
            WHEN 'g2_review'         THEN 'not a G2 permalink for the linkfinder-ai product'
            WHEN 'trustpilot_review' THEN 'not a Trustpilot review permalink'
            ELSE 'not a recognised review URL' END;
        RETURN NEXT; RETURN;
    END IF;

    key := v_key;

    IF EXISTS (SELECT 1 FROM public.onboarding_task_completions c
                WHERE c.review_key = v_key) THEN
        verdict := 'reject'; reason := 'this review has already been claimed';
        RETURN NEXT; RETURN;
    END IF;

    SELECT value INTO v_policy FROM public.onboarding_review_policy
     WHERE onboarding_review_policy.key = CASE p_task_name
         WHEN 'g2_review' THEN 'g2_permalink' ELSE 'trustpilot_permalink' END;

    IF coalesce(v_policy, 'manual') <> 'auto' THEN
        verdict := 'manual'; reason := 'policy is set to manual review';
        RETURN NEXT; RETURN;
    END IF;

    verdict := 'auto_approve';
    reason  := CASE p_task_name
        WHEN 'g2_review' THEN 'G2 permalink for linkfinder-ai, not seen before'
        ELSE 'Trustpilot review permalink, not seen before (company not verifiable from the URL)' END;
    RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- Applies the verdict on submission.
--
-- Named to sort before onboarding_task_completed_awards_credits: Postgres
-- fires same-timing triggers in alphabetical order, so this one sets
-- status='completed' and the award trigger then sees it on the same row and
-- pays out in the same statement. Renaming either breaks that chain — the
-- tests cover it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_review_url_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
    v     record;
BEGIN
    IF NEW.task_name NOT IN ('g2_review', 'trustpilot_review') THEN
        RETURN NEW;
    END IF;

    -- Only judge a submission on its way in. Once a row is completed or
    -- rejected, later edits (including a manual override) are left alone.
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('pending', 'submitted') THEN
        RETURN NEW;
    END IF;

    v_url := coalesce(NEW.review_url, NEW.submitted_url);

    SELECT * INTO v FROM public.classify_review_url(NEW.task_name, v_url);

    NEW.auto_verdict    := v.verdict;
    NEW.auto_reason     := v.reason;
    NEW.auto_checked_at := now();

    IF v.verdict = 'reject' THEN
        -- Deliberately NOT stamping review_key here. A rejected row must not
        -- claim the review: on a duplicate submission the key already belongs
        -- to the original row, and writing it again would hit the unique index
        -- and blow up the insert instead of storing a clean rejection. The
        -- attempted key goes in the reason so it is still auditable.
        NEW.review_key := NULL;
        IF v.key IS NOT NULL THEN
            NEW.auto_reason := v.reason || ' (' || v.key || ')';
        END IF;
        NEW.status := 'rejected';
    ELSE
        -- auto_approve and manual both claim the review, so a second person
        -- cannot submit the same link while the first is still being decided.
        NEW.review_key := v.key;
        IF v.verdict = 'auto_approve' THEN
            NEW.status := 'completed';   -- award trigger fires next and pays out
        END IF;
        -- 'manual' leaves the status exactly as submitted, for you to decide.
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onboarding_task_00_verify_review_url
    ON public.onboarding_task_completions;

CREATE TRIGGER onboarding_task_00_verify_review_url
    BEFORE INSERT OR UPDATE ON public.onboarding_task_completions
    FOR EACH ROW
    EXECUTE FUNCTION public.on_review_url_submitted();

-- ---------------------------------------------------------------------------
-- Back-fill: judge the reviews already sitting pending.
-- Re-runnable. Returns what it decided so you can read it before trusting it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverify_pending_reviews()
RETURNS TABLE (user_token text, task_name text, verdict text, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.id, c.user_token, c.task_name
          FROM public.onboarding_task_completions c
         WHERE c.status IN ('pending','submitted')
           AND c.task_name IN ('g2_review','trustpilot_review')
         ORDER BY c.id
    LOOP
        -- A no-op update whose status is unchanged would be skipped by the
        -- trigger's guard, so nudge status to re-enter the decision path.
        UPDATE public.onboarding_task_completions
           SET status = 'pending'
         WHERE id = r.id AND status = 'submitted';

        UPDATE public.onboarding_task_completions t
           SET auto_checked_at = NULL
         WHERE t.id = r.id;

        SELECT c.auto_verdict, c.auto_reason INTO verdict, reason
          FROM public.onboarding_task_completions c WHERE c.id = r.id;

        user_token := r.user_token;
        task_name  := r.task_name;
        RETURN NEXT;
    END LOOP;
END;
$$;

COMMIT;

-- ===========================================================================
-- Residual risk, stated plainly
-- ---------------------------------------------------------------------------
-- A Trustpilot permalink proves a specific review exists and has not been
-- claimed here before. It does NOT prove the review is about LinkFinder --
-- the company name is simply not in the URL. Someone who pastes any real
-- Trustpilot review URL, of any company, gets 500 credits.
--
-- Bounded by: one payout per person per task (01's grant ledger), 500 credits
-- each, and every decision recorded. Not bounded by anything else.
--
-- To watch it:
--   SELECT user_token, task_name, review_url, auto_reason, auto_checked_at
--   FROM public.onboarding_task_completions
--   WHERE auto_verdict = 'auto_approve' AND task_name = 'trustpilot_review'
--   ORDER BY auto_checked_at DESC;
--
-- To turn it off without touching code:
--   UPDATE public.onboarding_review_policy SET value='manual'
--    WHERE key='trustpilot_permalink';
--
-- G2 carries no equivalent risk: its permalinks contain the linkfinder-ai
-- product slug, so a review of another product cannot match.
-- ===========================================================================
