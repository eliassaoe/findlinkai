-- Regression tests for 02_auto_verify_review_urls.sql.
-- Runs after mock_schema.sql + 01 + 02. Every check aborts on failure.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.expect_text(p_label text, p_actual text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_actual IS DISTINCT FROM p_expected THEN
        RAISE EXCEPTION 'FAIL %: expected %, got %', p_label, p_expected, coalesce(p_actual,'<null>');
    END IF;
    RAISE NOTICE 'pass: %', p_label;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.verdict_of(p_task text, p_url text)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT verdict FROM public.classify_review_url(p_task, p_url);
$$;

CREATE OR REPLACE FUNCTION pg_temp.key_of(p_task text, p_url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT public.review_url_key(p_task, p_url);
$$;

-- ---------------------------------------------------------------------------
-- G2 URL shapes
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    PERFORM pg_temp.expect_text('G2 permalink accepted',
        pg_temp.verdict_of('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-10432117'),
        'auto_approve');

    PERFORM pg_temp.expect_text('G2 with /fr/ locale accepted',
        pg_temp.verdict_of('g2_review','https://www.g2.com/fr/products/linkfinder-ai/reviews/linkfinder-ai-review-10432118'),
        'auto_approve');

    PERFORM pg_temp.expect_text('G2 survey_responses permalink accepted',
        pg_temp.verdict_of('g2_review','https://www.g2.com/survey_responses/linkfinder-ai-review-9981234'),
        'auto_approve');

    -- The link we hand users. Anyone can copy it, so it proves nothing.
    PERFORM pg_temp.expect_text('G2 reviews index page rejected',
        pg_temp.verdict_of('g2_review','https://www.g2.com/fr/products/linkfinder-ai/reviews'),
        'reject');

    -- The attack that matters for G2: a real permalink for a DIFFERENT product.
    PERFORM pg_temp.expect_text('G2 review of another product rejected',
        pg_temp.verdict_of('g2_review','https://www.g2.com/products/apollo-io/reviews/apollo-io-review-7654321'),
        'reject');

    PERFORM pg_temp.expect_text('G2 company homepage rejected',
        pg_temp.verdict_of('g2_review','https://www.g2.com/'), 'reject');
END; $$;

-- ---------------------------------------------------------------------------
-- Trustpilot URL shapes
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    PERFORM pg_temp.expect_text('Trustpilot permalink accepted',
        pg_temp.verdict_of('trustpilot_review','https://www.trustpilot.com/reviews/6512a4f1c9d2b30011a7e881'),
        'auto_approve');

    PERFORM pg_temp.expect_text('Trustpilot lang subdomain accepted',
        pg_temp.verdict_of('trustpilot_review','https://fr.trustpilot.com/reviews/6512a4f1c9d2b30011a7e882'),
        'auto_approve');

    -- The link we hand users, and the most common honest mistake.
    PERFORM pg_temp.expect_text('Trustpilot company page rejected',
        pg_temp.verdict_of('trustpilot_review','https://fr.trustpilot.com/review/linkfinderai.com'),
        'reject');

    PERFORM pg_temp.expect_text('Trustpilot company page of someone else rejected',
        pg_temp.verdict_of('trustpilot_review','https://www.trustpilot.com/review/apollo.io'),
        'reject');

    PERFORM pg_temp.expect_text('Trustpilot id too short rejected',
        pg_temp.verdict_of('trustpilot_review','https://www.trustpilot.com/reviews/abc123'),
        'reject');
END; $$;

-- ---------------------------------------------------------------------------
-- Junk and evasion
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    PERFORM pg_temp.expect_text('empty rejected',   pg_temp.verdict_of('g2_review',''), 'reject');
    PERFORM pg_temp.expect_text('non-url rejected', pg_temp.verdict_of('g2_review','i left a review honest'), 'reject');
    PERFORM pg_temp.expect_text('javascript: rejected',
        pg_temp.verdict_of('g2_review','javascript:alert(1)'), 'reject');

    -- A lookalike domain must not pass for the real one.
    PERFORM pg_temp.expect_text('g2.com.evil.example rejected',
        pg_temp.verdict_of('g2_review','https://g2.com.evil.example/products/linkfinder-ai/reviews/x-1'),
        'reject');
    PERFORM pg_temp.expect_text('notg2.com rejected',
        pg_temp.verdict_of('g2_review','https://notg2.com/products/linkfinder-ai/reviews/x-1'),
        'reject');
    PERFORM pg_temp.expect_text('trustpilot lookalike rejected',
        pg_temp.verdict_of('trustpilot_review','https://trustpilot.com.evil.example/reviews/6512a4f1c9d2b30011a7e883'),
        'reject');

    -- The slug must belong to linkfinder-ai, not merely contain it downstream.
    PERFORM pg_temp.expect_text('other product with linkfinder in slug rejected',
        pg_temp.verdict_of('g2_review','https://www.g2.com/products/not-linkfinder-ai/reviews/r-1'),
        'reject');
END; $$;

-- ---------------------------------------------------------------------------
-- Canonicalisation: the same review must yield one key however it is dressed up
-- ---------------------------------------------------------------------------
DO $$
DECLARE k text;
BEGIN
    k := pg_temp.key_of('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555');
    PERFORM pg_temp.expect_text('key: bare',    k, 'g2:linkfinder-ai-review-555');
    PERFORM pg_temp.expect_text('key: no www',
        pg_temp.key_of('g2_review','https://g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555'), k);
    PERFORM pg_temp.expect_text('key: http',
        pg_temp.key_of('g2_review','http://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555'), k);
    PERFORM pg_temp.expect_text('key: locale',
        pg_temp.key_of('g2_review','https://www.g2.com/fr/products/linkfinder-ai/reviews/linkfinder-ai-review-555'), k);
    PERFORM pg_temp.expect_text('key: query string',
        pg_temp.key_of('g2_review','https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555?utm_source=x'), k);
    PERFORM pg_temp.expect_text('key: uppercase',
        pg_temp.key_of('g2_review','HTTPS://WWW.G2.COM/PRODUCTS/LINKFINDER-AI/REVIEWS/LINKFINDER-AI-REVIEW-555'), k);
    PERFORM pg_temp.expect_text('key: trailing space',
        pg_temp.key_of('g2_review','  https://www.g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-555  '), k);
END; $$;

-- ---------------------------------------------------------------------------
-- END TO END: submission -> verdict -> status -> credits, in one insert.
-- This is the trigger-ordering test. If the verify trigger stopped firing
-- before the award trigger, the balance would not move.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_before numeric; v_after numeric; v_status text; v_verdict text; v_id bigint;
BEGIN
    SELECT credits INTO v_before FROM public.users WHERE token='tok_alice';

    INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits, review_url)
    VALUES ('tok_alice','g2_review','pending',0,
            'https://www.g2.com/fr/products/linkfinder-ai/reviews/linkfinder-ai-review-777')
    RETURNING id INTO v_id;

    SELECT status, auto_verdict INTO v_status, v_verdict
      FROM public.onboarding_task_completions WHERE id = v_id;
    SELECT credits INTO v_after FROM public.users WHERE token='tok_alice';

    PERFORM pg_temp.expect_text('e2e verdict', v_verdict, 'auto_approve');
    PERFORM pg_temp.expect_text('e2e status',  v_status,  'completed');
    IF v_after - v_before <> 1000 THEN
        RAISE EXCEPTION 'FAIL e2e credits: expected +1000, got +%', v_after - v_before;
    END IF;
    RAISE NOTICE 'pass: e2e credits awarded in the same statement';
END; $$;

-- The same review, resubmitted by a different person, must not pay again.
DO $$
DECLARE v_before numeric; v_after numeric; v_status text; v_id bigint;
BEGIN
    SELECT credits INTO v_before FROM public.users WHERE token='tok_bob';
    INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits, review_url)
    VALUES ('tok_bob','g2_review','pending',0,
            'https://g2.com/products/linkfinder-ai/reviews/linkfinder-ai-review-777?utm=steal')
    RETURNING id INTO v_id;
    SELECT status INTO v_status FROM public.onboarding_task_completions WHERE id = v_id;
    SELECT credits INTO v_after FROM public.users WHERE token='tok_bob';

    PERFORM pg_temp.expect_text('stolen review rejected', v_status, 'rejected');
    IF v_after <> v_before THEN
        RAISE EXCEPTION 'FAIL stolen review paid out: % -> %', v_before, v_after;
    END IF;
    RAISE NOTICE 'pass: reused review pays nobody';
END; $$;

-- A bad URL must not pay, and must say why.
DO $$
DECLARE v_before numeric; v_after numeric; v_status text; v_reason text; v_id bigint;
BEGIN
    SELECT credits INTO v_before FROM public.users WHERE token='tok_carol';
    INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits, review_url)
    VALUES ('tok_carol','trustpilot_review','pending',0,'https://fr.trustpilot.com/review/linkfinderai.com')
    RETURNING id INTO v_id;
    SELECT status, auto_reason INTO v_status, v_reason
      FROM public.onboarding_task_completions WHERE id = v_id;
    SELECT credits INTO v_after FROM public.users WHERE token='tok_carol';

    PERFORM pg_temp.expect_text('company page submission rejected', v_status, 'rejected');
    IF v_after <> v_before THEN RAISE EXCEPTION 'FAIL rejected URL paid out'; END IF;
    IF v_reason NOT LIKE '%company page%' THEN
        RAISE EXCEPTION 'FAIL reason unhelpful: %', v_reason;
    END IF;
    RAISE NOTICE 'pass: rejection explains itself (%)', v_reason;
END; $$;

-- Policy switch must actually switch.
DO $$
DECLARE v_status text; v_id bigint;
BEGIN
    UPDATE public.onboarding_review_policy SET value='manual' WHERE key='trustpilot_permalink';
    INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits, review_url)
    VALUES ('tok_ghost','trustpilot_review','pending',0,
            'https://www.trustpilot.com/reviews/6512a4f1c9d2b30011a7e999')
    RETURNING id INTO v_id;
    SELECT status INTO v_status FROM public.onboarding_task_completions WHERE id = v_id;
    PERFORM pg_temp.expect_text('policy=manual holds it pending', v_status, 'pending');
    UPDATE public.onboarding_review_policy SET value='auto' WHERE key='trustpilot_permalink';
END; $$;

-- Non-review tasks must pass through untouched.
DO $$
DECLARE v_status text; v_verdict text; v_id bigint;
BEGIN
    INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits)
    VALUES ('tok_carol','youtube_subscribe','completed',100)
    RETURNING id INTO v_id;
    SELECT status, auto_verdict INTO v_status, v_verdict
      FROM public.onboarding_task_completions WHERE id = v_id;
    PERFORM pg_temp.expect_text('non-review task untouched', v_status, 'completed');
    PERFORM pg_temp.expect_text('non-review task unjudged', coalesce(v_verdict,'<none>'), '<none>');
    RAISE NOTICE 'ALL REVIEW VERIFICATION TESTS PASSED';
END; $$;
