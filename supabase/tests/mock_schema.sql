-- Mock of the production shape this migration targets.
CREATE TABLE public.users (
    id serial PRIMARY KEY,
    token text UNIQUE NOT NULL,
    email text,
    credits numeric DEFAULT 0
);

CREATE TABLE public.onboarding_task_completions (
    id serial PRIMARY KEY,
    user_token text NOT NULL,
    task_name  text NOT NULL,
    status     text NOT NULL DEFAULT 'pending',
    credits    numeric DEFAULT 0,
    submitted_url text,
    review_url text,
    created_at timestamptz DEFAULT now()
);

INSERT INTO public.users (token, email, credits) VALUES
    ('tok_alice', 'alice@example.com', 25),
    ('tok_bob',   'bob@example.com',    0),
    ('tok_carol', 'carol@example.com', 500);

-- Pending review awaiting manual approval (the broken case).
INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits, review_url) VALUES
    ('tok_alice', 'g2_review',         'pending', 0, 'https://g2.com/r/1'),
    ('tok_bob',   'trustpilot_review', 'pending', 0, 'https://trustpilot.com/r/2');

-- An approval flipped BEFORE the trigger existed: credits never moved.
-- This is what the back-fill has to catch.
INSERT INTO public.onboarding_task_completions (user_token, task_name, status, credits, review_url) VALUES
    ('tok_carol', 'g2_review', 'completed', 0, 'https://g2.com/r/3');
