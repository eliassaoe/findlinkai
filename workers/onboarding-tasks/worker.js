/**
 * LinkFinder AI — Onboarding Tasks Worker
 * ---------------------------------------------------------------------------
 * Reviews are verified and paid out automatically. Manual approval still
 * exists, but only for the submissions automatic checking cannot settle.
 *
 * Bindings:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_API_KEY
 *   REVIEW_NOTIFICATION_WEBHOOK   optional, overrides the default
 *   TRUSTPILOT_POLICY             optional, 'auto' (default) or 'manual'
 *
 * Requires schema.sql in this directory to be applied first: it provides the
 * atomic increment_user_credits() and the uniqueness this file relies on.
 */

const LOW_CONVERSION_COUNTRIES = new Set(['IN', 'BD', 'NG']);

const TASK_CONFIG = {
    youtube_subscribe: { credits: 100,  kind: 'honor' },
    linkedin_share:    { credits: 150,  kind: 'instant_url' },
    g2_review:         { credits: 1000, kind: 'pending_review', platform: 'g2' },
    trustpilot_review: { credits: 500,  kind: 'pending_review', platform: 'trustpilot' },
    product_survey:    { credits: 500,  kind: 'survey' },
};

// ===========================================================================
// The product survey
// ===========================================================================
//
// Four questions, paid once per person. The point is Q2: docs/data-provider-angle.md
// showed that the users who churn and the users who stay are separated by
// whether their work recurs, and today we can only infer that from behaviour
// weeks after the fact. This asks them on day one.
//
// Options are defined HERE, not in the browser, and an answer that is not one
// of them is refused. A client-supplied option list is a free-text field with
// extra steps: anyone can POST whatever they like, and the answers are the
// entire product of this task - a poisoned set is worse than no set.
const SURVEY_QUESTIONS = [
    {
        id: 'role',
        options: ['agency', 'in_house_sales', 'recruiter', 'founder', 'developer', 'other'],
    },
    {
        id: 'cadence',
        options: ['one_off', 'few_months', 'monthly', 'weekly_or_more'],
    },
    {
        id: 'previous_tool',
        options: ['manual', 'apollo_zoominfo_lusha', 'clay', 'freelancer_va', 'other_api', 'nothing'],
    },
    {
        id: 'missing',
        freeText: true,
        maxLength: 500,
    },
];

const SURVEY_FREE_TEXT_MIN = 2;

// Returns { answers } or { error }. Never throws - a malformed body is a 400,
// not a 500.
function validateSurveyAnswers(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { error: 'answers must be an object' };
    }

    const answers = {};
    for (const q of SURVEY_QUESTIONS) {
        const value = raw[q.id];

        if (q.freeText) {
            if (typeof value !== 'string') return { error: `${q.id} is required` };
            // Strip control characters before anything stores or forwards this.
            // It ends up in Supabase, in PostHog, and eventually on a screen.
            const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
            if (clean.length < SURVEY_FREE_TEXT_MIN) return { error: `${q.id} is required` };
            answers[q.id] = clean.slice(0, q.maxLength);
            continue;
        }

        if (typeof value !== 'string' || !q.options.includes(value)) {
            return { error: `${q.id} must be one of: ${q.options.join(', ')}` };
        }
        answers[q.id] = value;
    }
    return { answers };
}

const REVIEW_TASK_FOR_PLATFORM = { g2: 'g2_review', trustpilot: 'trustpilot_review' };

const DISCLOSURE_HINT =
    'Include this line in your review: "I received account credits for this review." ' +
    "Review platforms and the FTC require it — reviews without it can be removed.";

const DEFAULT_REVIEW_NOTIFICATION_WEBHOOK =
    'https://webhook-processor-production-a61c.up.railway.app/webhook/7c5c2ee1-1700-430c-84d7-3141f3f55092';

const WORKER_BASE_URL = 'https://onboarding-tasks-worker.hamoureliasse.workers.dev';

// ===========================================================================
// Review URL verification
// ===========================================================================
//
// Everything here is decided from the URL string alone. No fetch is attempted:
// G2 and Trustpilot both sit behind bot protection that refuses datacenter
// IPs, so a fetch would fail on genuine submissions as readily as fake ones,
// and a check that cannot be trusted is worse than an absent one.
//
// The two sites are NOT equally verifiable, and the whole design turns on it:
//
//   G2          .../products/linkfinder-ai/reviews/<slug>
//               The product slug is in the URL, so a review of some other
//               product cannot match. Identity is provable.
//
//   Trustpilot  .../reviews/<hex id>
//               The company name appears NOWHERE in a Trustpilot permalink.
//               We can prove a specific review exists and has not been claimed
//               here before; we cannot prove it is about LinkFinder. Anyone
//               pasting a real Trustpilot review URL of any company passes.
//               Bounded by one payout per person per task, and every decision
//               recorded. Set TRUSTPILOT_POLICY=manual to stop accepting them.

const REVIEW_URL_PATTERNS = {
    g2_review: [
        // A real G2 review permalink ends in linkfinder-ai-review-<digits>.
        //
        // This used to accept ANY slug after /reviews/, which meant the write
        // form we send people to - /products/linkfinder-ai/reviews/start -
        // classified as auto_approve with the key "g2:start". So did /new,
        // /video, and the literal string "x". The hard part of the task was
        // writing a review; pasting back the link from our own email skipped
        // it and still passed. That is most of what is in the pending queue.
        /^https?:\/\/(?:www\.)?g2\.com(?:\/[a-z]{2})?\/products\/linkfinder-ai\/reviews\/(linkfinder-ai-review-[0-9]+)(?:[/?#]|$)/,
        // https://www.g2.com/survey_responses/linkfinder-ai-review-<id>
        /^https?:\/\/(?:www\.)?g2\.com(?:\/[a-z]{2})?\/survey_responses\/(linkfinder-ai-review-[0-9]+)(?:[/?#]|$)/,
    ],
    trustpilot_review: [
        /^https?:\/\/(?:[a-z]{2}\.)?(?:www\.)?trustpilot\.com\/reviews\/([0-9a-f]{20,32})/,
    ],
};

// The pages we link users to. They prove nothing — anyone can copy them —
// and pasting one back is the most common honest mistake, so it gets its own
// message rather than a generic rejection.
// Pages on the right product that are not somebody's review. The tightened
// pattern above already refuses these; naming them explicitly is what lets the
// rejection say "that is the form, not your review" instead of a generic "that
// does not look like a review link", which reads like a bug to someone who has
// genuinely just written one.
const G2_NON_REVIEW_SLUGS = /^(?:start|new|write|edit|video|videos|take_survey|survey|thank_you|thanks)$/;

const LANDING_PAGE_PATTERNS = {
    g2_review: /^https?:\/\/(?:www\.)?g2\.com(?:\/[a-z]{2})?\/products\/linkfinder-ai\/reviews\/?$/,
    trustpilot_review: /^https?:\/\/(?:[a-z]{2}\.)?(?:www\.)?trustpilot\.com\/review\//,
};

const KEY_PREFIX = { g2_review: 'g2', trustpilot_review: 'tp' };

/**
 * The review's identity, or null if this is not a permalink to one specific
 * LinkFinder review. Returning a key rather than a tidied URL is what makes
 * the same review submitted in different dress collapse to one value.
 */
export function reviewUrlKey(taskName, url) {
    const patterns = REVIEW_URL_PATTERNS[taskName];
    if (!patterns) return null;
    const u = String(url || '').trim().toLowerCase();
    if (!u) return null;
    for (const re of patterns) {
        const m = u.match(re);
        if (m) return `${KEY_PREFIX[taskName]}:${m[1]}`;
    }
    return null;
}

/**
 * @returns {{verdict: 'auto_approve'|'manual'|'reject', reason: string, key: string|null}}
 */
export function classifyReviewUrl(taskName, url, opts = {}) {
    const trustpilotPolicy = opts.trustpilotPolicy === 'manual' ? 'manual' : 'auto';
    const u = String(url || '').trim().toLowerCase();

    if (!u) return { verdict: 'reject', reason: 'No URL submitted.', key: null };
    if (!/^https?:\/\//.test(u)) {
        return { verdict: 'reject', reason: 'That is not a web address. Paste the full https:// link to your review.', key: null };
    }

    const landing = LANDING_PAGE_PATTERNS[taskName];
    if (landing && landing.test(u)) {
        return {
            verdict: 'reject',
            key: null,
            reason: 'That is the page we sent you to, not a link to your own review. Open your review and copy the URL from your browser’s address bar.',
        };
    }

    if (taskName === 'g2_review') {
        const slug = (u.match(/\/products\/linkfinder-ai\/reviews\/([^/?#]+)/) || [])[1];
        if (slug && G2_NON_REVIEW_SLUGS.test(slug)) {
            return {
                verdict: 'reject',
                key: null,
                reason: 'That is the form for writing a review, not a link to a review you have written. Once G2 publishes yours, open it and copy the URL from your browser\u2019s address bar \u2014 it ends in something like linkfinder-ai-review-10432117.',
            };
        }
    }

    const key = reviewUrlKey(taskName, u);
    if (!key) {
        return {
            verdict: 'reject',
            key: null,
            reason: taskName === 'g2_review'
                ? 'That does not look like a link to a published G2 review of LinkFinder AI. Open your own review on G2 and copy its URL \u2014 it ends in something like linkfinder-ai-review-10432117.'
                : 'That does not look like a link to a Trustpilot review. Open your review on Trustpilot and copy its URL.',
        };
    }

    const policy = taskName === 'g2_review'
        ? (opts.g2Policy === 'manual' ? 'manual' : 'auto')
        : trustpilotPolicy;
    if (policy !== 'auto') {
        return { verdict: 'manual', reason: 'This platform is set to manual review.', key };
    }

    // Shape is settled; existence is not. The caller checks the key against
    // known_reviews before treating this as final — see verifyReviewExists.
    return {
        verdict: 'auto_approve',
        key,
        reason: taskName === 'g2_review'
            ? 'G2 permalink for the linkfinder-ai product.'
            : 'Trustpilot review permalink (company not verifiable from a Trustpilot URL).',
    };
}

// ===========================================================================
// Plumbing
// ===========================================================================

function geoTierFromRequest(request) {
    const country = request.cf && request.cf.country;
    return country && LOW_CONVERSION_COUNTRIES.has(country) ? 'low_conversion' : 'standard';
}

const POSTHOG_HOST = 'https://us.i.posthog.com';

// Mirrors workers/dodo-webhook. Swallows its own failures on purpose: the
// credits have already moved and the answers are already in Supabase by the
// time this runs, so a PostHog outage must not turn a successful task into a
// 500 that tells the user to try again.
async function captureToPostHog(env, event) {
    if (!env.POSTHOG_API_KEY) {
        console.error('[tasks] POSTHOG_API_KEY not set, survey answers not mirrored');
        return;
    }
    try {
        await fetch(`${POSTHOG_HOST}/capture/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: env.POSTHOG_API_KEY,
                event: event.event,
                distinct_id: event.distinct_id,
                properties: event.properties,
                timestamp: new Date().toISOString(),
            }),
        });
    } catch (e) {
        console.error('[tasks] PostHog capture failed', e);
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}

const badRequest = (message) => json({ error: message }, 400);

// Every value that reaches a PostgREST filter goes through this. Interpolating
// raw input into the query string lets a caller append their own filters and
// change which rows a PATCH or DELETE touches.
const eq = (value) => `eq.${encodeURIComponent(String(value))}`;

async function supabaseFetch(env, path, options = {}) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: options.prefer || 'return=representation',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Supabase ${path} failed: ${res.status} ${text}`);
        err.status = res.status;
        // 23505 is a unique violation. Callers treat it as "someone got here
        // first", which is a normal race outcome rather than a failure.
        err.isDuplicate = res.status === 409 || text.includes('23505');
        throw err;
    }
    return res.status === 204 ? null : res.json();
}

// `token` on linkfinderai_users IS the identifier. The onboarding tables store
// that token in their user_id columns; they are not UUID foreign keys.
async function resolveUserId(env, userToken) {
    const rows = await supabaseFetch(env, `linkfinderai_users?token=${eq(userToken)}&select=token`);
    if (!rows || !rows.length) throw new Error('Unknown user token');
    return rows[0].token;
}

/**
 * Atomic. Returns the new balance, or null when the token matches no user, so
 * a grant against a missing user is visible instead of silently lost.
 */
async function creditUser(env, userToken, amount) {
    const result = await supabaseFetch(env, 'rpc/increment_user_credits', {
        method: 'POST',
        body: JSON.stringify({ p_token: userToken, p_amount: amount }),
    });
    return typeof result === 'number' ? result : (result == null ? null : Number(result));
}

/**
 * Is this a review we have actually seen exist?
 *
 * URL shape proves nothing about existence: a G2 review id is just a number,
 * so `.../linkfinder-ai/reviews/linkfinder-ai-review-13270299` passes every
 * pattern check while pointing at nothing. Only membership in the set of
 * reviews we have independently observed can settle it.
 *
 * Unknown is NOT a rejection — a genuine review written a minute ago will not
 * be in the set until the next sync. It queues for manual review, and
 * /admin/sync-reviews releases it automatically once it shows up.
 */
async function isKnownReview(env, key) {
    if (!key) return false;
    const rows = await supabaseFetch(env, `known_reviews?review_key=${eq(key)}&select=review_key`);
    return !!(rows && rows.length);
}

async function findCompletion(env, userId, taskName) {
    const rows = await supabaseFetch(
        env,
        `user_task_completions?user_id=${eq(userId)}&task_name=${eq(taskName)}&select=id,status,credits`
    );
    return rows && rows.length ? rows[0] : null;
}

const insertCompletion = (env, row) =>
    supabaseFetch(env, 'user_task_completions', { method: 'POST', body: JSON.stringify(row) });

// ===========================================================================
// POST /tasks/complete   { user_token, task_name, submitted_url? }
// ===========================================================================
async function handleComplete(request, env) {
    const body = await request.json().catch(() => ({}));
    const { user_token, task_name, submitted_url } = body;
    if (!user_token || !task_name) return badRequest('user_token and task_name are required');

    const config = TASK_CONFIG[task_name];
    if (!config) return badRequest('Unknown task_name');
    if (config.kind === 'pending_review') return badRequest('Use /tasks/submit-review for review tasks');

    let surveyAnswers = null;
    if (config.kind === 'survey') {
        const check = validateSurveyAnswers(body.answers);
        if (check.error) return badRequest(check.error);
        surveyAnswers = check.answers;
    }

    if (config.kind === 'instant_url') {
        if (!submitted_url) return badRequest('submitted_url is required for this task');
        // Previously any parseable URL earned 150 credits, which made this a
        // free credit faucet for anyone who pasted example.com.
        if (!/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/.+/i.test(String(submitted_url).trim())) {
            return badRequest('That is not a LinkedIn URL. Paste the link to your own post.');
        }
    }

    let userId;
    try {
        userId = await resolveUserId(env, user_token);
    } catch (e) {
        return json({ error: 'Invalid user_token' }, 401);
    }

    const existing = await findCompletion(env, userId, task_name);
    if (existing) return json({ error: 'Task already completed', status: existing.status }, 409);

    // Insert first. The unique index makes this the point where a concurrent
    // duplicate loses, so the credit below happens at most once.
    try {
        await insertCompletion(env, {
            user_id: userId,
            task_name,
            status: 'completed',
            submitted_url: submitted_url || null,
            credits: config.credits,
            payload: surveyAnswers,
        });
    } catch (e) {
        if (e.isDuplicate) return json({ error: 'Task already completed' }, 409);
        return json({ error: 'Could not complete task' }, 500);
    }

    try {
        const balance = await creditUser(env, userId, config.credits);
        if (balance === null) throw new Error('no user row for credit grant');

        // Server-side, not from the browser. The answers are the entire point of
        // this task; a closed tab or a blocked analytics script must not lose
        // them. Supabase already has them - this is so they are queryable
        // alongside the behaviour they are meant to explain.
        if (surveyAnswers) {
            await captureToPostHog(env, {
                event: 'product_survey_completed',
                distinct_id: user_token,
                properties: { ...surveyAnswers, credits_awarded: config.credits },
            });
        }

        return json({ success: true, task_name, credits_awarded: config.credits, credits_balance: balance });
    } catch (e) {
        // The completion row exists but the balance did not move. Roll it back
        // rather than leaving a row that says "paid" and blocks a retry.
        await supabaseFetch(env, `user_task_completions?user_id=${eq(userId)}&task_name=${eq(task_name)}`, {
            method: 'DELETE',
        }).catch(() => {});
        return json({ error: 'Could not credit your account. Please try again.' }, 500);
    }
}

// ===========================================================================
// POST /tasks/submit-review   { user_token, task_name, review_url }
// ===========================================================================
async function handleSubmitReview(request, env) {
    const body = await request.json().catch(() => ({}));
    const { user_token, task_name, review_url } = body;
    if (!user_token || !task_name || !review_url) {
        return badRequest('user_token, task_name, and review_url are required');
    }

    const config = TASK_CONFIG[task_name];
    if (!config || config.kind !== 'pending_review') return badRequest('Unknown or invalid review task_name');

    let userId;
    try {
        userId = await resolveUserId(env, user_token);
    } catch (e) {
        return json({ error: 'Invalid user_token' }, 401);
    }

    const existing = await findCompletion(env, userId, task_name);
    if (existing) return json({ error: 'Task already submitted', status: existing.status }, 409);

    const verdict = classifyReviewUrl(task_name, review_url, {
        trustpilotPolicy: env.TRUSTPILOT_POLICY,
        g2Policy: env.G2_POLICY,
    });

    // Tell the user what is wrong while they still have the page open, instead
    // of leaving them waiting for an approval that is never coming.
    if (verdict.verdict === 'reject') {
        return json({ error: verdict.reason, status: 'rejected', reason: verdict.reason }, 400);
    }

    // The URL looks right. That is not the same as the review existing, so
    // pay out only for one we have actually seen. Everything else waits.
    // For G2 the existence check is not optional. The permalink id is just a
    // number, so a valid shape proves nothing on its own, and
    // REQUIRE_KNOWN_REVIEW=false must not be able to turn the highest-value
    // task on the list into an honour system.
    let approved = verdict.verdict === 'auto_approve';
    const existenceRequired = task_name === 'g2_review' || env.REQUIRE_KNOWN_REVIEW !== 'false';
    if (approved && existenceRequired) {
        try {
            if (!(await isKnownReview(env, verdict.key))) {
                approved = false;
                verdict.verdict = 'manual';
                verdict.reason = 'Shape is valid but this review is not in our synced list yet — holding for review.';
            }
        } catch (e) {
            approved = false;   // cannot confirm, so do not pay
            verdict.verdict = 'manual';
            verdict.reason = 'Could not check the review list; holding for review.';
        }
    }
    let reviewId = null;

    try {
        const inserted = await supabaseFetch(env, 'pending_reviews', {
            method: 'POST',
            body: JSON.stringify({
                user_id: userId,
                platform: config.platform,
                review_url,
                review_key: verdict.key,
                credits: config.credits,
                status: approved ? 'approved' : 'pending',
                auto_verdict: verdict.verdict,
                auto_reason: verdict.reason,
                ...(approved ? { reviewed_at: new Date().toISOString(), reviewed_by: 'auto' } : {}),
            }),
        });
        reviewId = inserted && inserted[0] && inserted[0].id;
    } catch (e) {
        // review_key is unique across every user, so this is the same review
        // arriving a second time.
        if (e.isDuplicate) {
            return json({
                error: 'That review has already been used to claim credits.',
                status: 'rejected',
                reason: 'duplicate review',
            }, 409);
        }
        return json({ error: 'Could not submit review' }, 500);
    }

    try {
        await insertCompletion(env, {
            user_id: userId,
            task_name,
            status: approved ? 'completed' : 'pending',
            submitted_url: review_url,
            credits: approved ? config.credits : 0,
        });
    } catch (e) {
        if (!e.isDuplicate) {
            await supabaseFetch(env, `pending_reviews?id=${eq(reviewId)}`, { method: 'DELETE' }).catch(() => {});
            return json({ error: 'Could not submit review' }, 500);
        }
    }

    if (approved) {
        try {
            const balance = await creditUser(env, userId, config.credits);
            return json({
                success: true,
                status: 'completed',
                credits_awarded: config.credits,
                credits_balance: balance,
                message: 'Verified — your credits are in your account.',
                disclosure_reminder: DISCLOSURE_HINT,
            });
        } catch (e) {
            // Leave the rows in place: the review is genuine and recorded, so
            // this is a repair job, not a rejection. reconcile-approved settles it.
            return json({
                success: true,
                status: 'completed',
                message: 'Verified. Your credits will appear shortly.',
                disclosure_reminder: DISCLOSURE_HINT,
            });
        }
    }

    sendReviewNotificationEmail(env, {
        id: reviewId, user_id: userId, platform: config.platform,
        review_url, credits: config.credits, auto_reason: verdict.reason,
    }).catch(() => {});

    return json({
        success: true,
        status: 'pending',
        message: 'Submitted for review.',
        disclosure_reminder: DISCLOSURE_HINT,
    });
}

async function sendReviewNotificationEmail(env, review) {
    const webhookUrl = env.REVIEW_NOTIFICATION_WEBHOOK || DEFAULT_REVIEW_NOTIFICATION_WEBHOOK;
    const adminKey = env.ADMIN_API_KEY || '';
    const link = (action) => review.id
        ? `${WORKER_BASE_URL}/admin/review/${action}?review_id=${encodeURIComponent(review.id)}&key=${encodeURIComponent(adminKey)}`
        : null;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                review_id: review.id || null,
                user_token: review.user_id,
                platform: review.platform,
                review_url: review.review_url,
                credits: review.credits,
                auto_reason: review.auto_reason || null,
                submitted_at: new Date().toISOString(),
                approve_url: link('approve-link'),
                reject_url: link('reject-link'),
            }),
        });
    } catch (e) {
        console.error('review webhook failed:', e);   // never block the user
    }
}

// ===========================================================================
// POST /tasks/status   { user_token | token }
// ===========================================================================
async function handleStatus(request, env) {
    const body = await request.json().catch(() => ({}));
    const user_token = body.user_token || body.token;
    if (!user_token) return badRequest('user_token is required');

    let userId;
    try {
        userId = await resolveUserId(env, user_token);
    } catch (e) {
        return json({ error: 'Invalid user_token' }, 401);
    }

    const [taskRows, popupState] = await Promise.all([
        supabaseFetch(env, `user_task_completions?user_id=${eq(userId)}&select=task_name,status,credits,submitted_url`),
        supabaseFetch(env, `onboarding_popup_state?user_id=${eq(userId)}&select=dismissed_at`),
    ]);

    const geo_tier = geoTierFromRequest(request);

    if (!popupState || !popupState.length) {
        await supabaseFetch(env, 'onboarding_popup_state', {
            method: 'POST',
            prefer: 'resolution=ignore-duplicates',
            body: JSON.stringify({ user_id: userId, geo_tier }),
        }).catch(() => {});
    }

    return json({
        tasks: taskRows || [],
        geo_tier,
        already_seen: !!(popupState && popupState.length && popupState[0].dismissed_at),
    });
}

// ===========================================================================
// POST /tasks/dismiss-popup
// ===========================================================================
async function handleDismissPopup(request, env) {
    const body = await request.json().catch(() => ({}));
    const user_token = body.user_token || body.token;
    if (!user_token) return badRequest('user_token is required');

    let userId;
    try {
        userId = await resolveUserId(env, user_token);
    } catch (e) {
        return json({ error: 'Invalid user_token' }, 401);
    }

    await supabaseFetch(env, `onboarding_popup_state?user_id=${eq(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ dismissed_at: new Date().toISOString() }),
    });
    return json({ success: true });
}

// ===========================================================================
// Admin: the manual queue, for whatever automatic checking left pending
// ===========================================================================

// Constant-time-ish comparison so a wrong key cannot be discovered by timing.
function adminKeyValid(supplied, expected) {
    if (!expected || typeof supplied !== 'string' || supplied.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < supplied.length; i++) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
}

async function approveReview(env, reviewId, by) {
    const rows = await supabaseFetch(env, `pending_reviews?id=${eq(reviewId)}&select=*`);
    if (!rows || !rows.length) return { error: 'Review not found', status: 404 };
    const review = rows[0];
    if (review.status !== 'pending') return { error: `Review already ${review.status}`, status: 409 };

    const taskName = REVIEW_TASK_FOR_PLATFORM[review.platform];
    if (!taskName) return { error: `Unknown platform ${review.platform}`, status: 400 };

    await supabaseFetch(env, `pending_reviews?id=${eq(reviewId)}&status=eq.pending`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: by }),
    });
    await supabaseFetch(env, `user_task_completions?user_id=${eq(review.user_id)}&task_name=${eq(taskName)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', credits: review.credits }),
    });
    const balance = await creditUser(env, review.user_id, review.credits);
    return { credited: review.credits, user_id: review.user_id, credits_balance: balance, platform: review.platform };
}

async function rejectReview(env, reviewId, by, notes) {
    const rows = await supabaseFetch(env, `pending_reviews?id=${eq(reviewId)}&select=*`);
    if (!rows || !rows.length) return { error: 'Review not found', status: 404 };
    const review = rows[0];
    // The original rejected any review at any time, including approved ones —
    // which deleted the completion row while the credits stayed granted, so the
    // user could resubmit and be paid a second time.
    if (review.status !== 'pending') return { error: `Review already ${review.status}`, status: 409 };

    const taskName = REVIEW_TASK_FOR_PLATFORM[review.platform];

    await supabaseFetch(env, `pending_reviews?id=${eq(reviewId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
            status: 'rejected', admin_notes: notes || null,
            reviewed_at: new Date().toISOString(), reviewed_by: by,
            review_key: null,   // free the key so a corrected URL can be resubmitted
        }),
    });
    if (taskName) {
        await supabaseFetch(env, `user_task_completions?user_id=${eq(review.user_id)}&task_name=${eq(taskName)}`, {
            method: 'DELETE',
        });
    }
    return { rejected: true, user_id: review.user_id };
}

async function handleApproveReview(request, env) {
    const body = await request.json().catch(() => ({}));
    if (!adminKeyValid(body.admin_key, env.ADMIN_API_KEY)) return json({ error: 'Unauthorized' }, 401);
    if (!body.review_id) return badRequest('review_id is required');
    const r = await approveReview(env, body.review_id, body.admin_name || 'admin');
    return r.error ? json({ error: r.error }, r.status) : json({ success: true, ...r });
}

async function handleRejectReview(request, env) {
    const body = await request.json().catch(() => ({}));
    if (!adminKeyValid(body.admin_key, env.ADMIN_API_KEY)) return json({ error: 'Unauthorized' }, 401);
    if (!body.review_id) return badRequest('review_id is required');
    const r = await rejectReview(env, body.review_id, body.admin_name || 'admin', body.notes);
    return r.error ? json({ error: r.error }, r.status) : json({ success: true, ...r });
}

// ---------------------------------------------------------------------------
// Email links.
//
// These used to act on the GET itself. Mail providers and security scanners
// fetch links in messages to check them, so an approval could fire without
// anyone clicking — and the key sits in the URL, in an inbox. The GET now only
// renders a confirmation page; the change happens on the POST that its button
// submits, which no scanner will send.
// ---------------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function htmlPage(title, message, isError, extraHtml = '') {
    return new Response(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex">
        <meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
        <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:64px auto;
        padding:0 20px;text-align:center;color:#111827}.icon{font-size:3rem;margin-bottom:1rem}
        h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#6b7280;font-size:.9rem;line-height:1.6}
        .u{word-break:break-all;font-size:.8rem;background:#f9fafb;border:1px solid #e5e7eb;
        border-radius:6px;padding:10px;margin:16px 0}button{font:inherit;font-weight:600;color:#fff;
        background:#2563eb;border:0;border-radius:8px;padding:12px 24px;cursor:pointer}
        button.danger{background:#dc2626}</style></head>
        <body><div class="icon">${isError ? '⚠️' : '✅'}</div>
        <h1>${esc(title)}</h1><p>${esc(message)}</p>${extraHtml}</body></html>`,
        { status: isError ? 400 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

async function handleReviewLinkPage(request, env, action) {
    const url = new URL(request.url);
    const reviewId = url.searchParams.get('review_id');
    const key = url.searchParams.get('key');
    if (!adminKeyValid(key, env.ADMIN_API_KEY)) return htmlPage('Unauthorized', 'Invalid or missing admin key.', true);
    if (!reviewId) return htmlPage('Missing review_id', 'No review_id in the link.', true);

    const rows = await supabaseFetch(env, `pending_reviews?id=${eq(reviewId)}&select=*`);
    if (!rows || !rows.length) return htmlPage('Not found', 'This review no longer exists.', true);
    const review = rows[0];
    if (review.status !== 'pending') {
        return htmlPage('Already handled', `This review was already marked "${review.status}".`, true);
    }

    const approving = action === 'approve';
    return htmlPage(
        approving ? 'Approve this review?' : 'Reject this review?',
        approving
            ? `${review.credits} credits will be granted for the ${String(review.platform).toUpperCase()} review.`
            : `The ${String(review.platform).toUpperCase()} review will be rejected. The user can resubmit.`,
        false,
        `<div class="u">${esc(review.review_url)}</div>
         <form method="POST" action="/admin/review/${approving ? 'approve' : 'reject'}-link">
           <input type="hidden" name="review_id" value="${esc(reviewId)}">
           <input type="hidden" name="key" value="${esc(key)}">
           <button type="submit"${approving ? '' : ' class="danger"'}>${approving ? 'Yes, approve' : 'Yes, reject'}</button>
         </form>`
    );
}

async function handleReviewLinkAction(request, env, action) {
    const form = await request.formData().catch(() => null);
    if (!form) return htmlPage('Bad request', 'Could not read the form.', true);
    const reviewId = form.get('review_id');
    if (!adminKeyValid(form.get('key'), env.ADMIN_API_KEY)) return htmlPage('Unauthorized', 'Invalid admin key.', true);
    if (!reviewId) return htmlPage('Missing review_id', 'No review_id submitted.', true);

    const r = action === 'approve'
        ? await approveReview(env, reviewId, 'email_link')
        : await rejectReview(env, reviewId, 'email_link', null);

    if (r.error) return htmlPage('Could not complete', r.error, true);
    return action === 'approve'
        ? htmlPage('Review approved', `${r.credited} credits granted. You can close this tab.`, false)
        : htmlPage('Review rejected', 'The user can resubmit. You can close this tab.', false);
}

// ---------------------------------------------------------------------------
// POST /admin/sync-reviews
//   { admin_key, platform: 'g2'|'trustpilot', review_urls: [...] }
//
// Feeds the set of reviews known to exist. Deliberately source-agnostic: it
// takes a list of URLs and does not care where they came from — an Apify G2
// actor, the Trustpilot Business API, or a paste by hand. Point a scheduled
// job at it and auto-approval starts working; point nothing at it and
// everything simply queues, which is the safe failure.
//
// After recording them it releases any pending submission whose review has
// now appeared, so a genuine review submitted before the sync ran is paid
// without anyone touching it.
// ---------------------------------------------------------------------------
async function handleSyncReviews(request, env) {
    const body = await request.json().catch(() => ({}));
    if (!adminKeyValid(body.admin_key, env.ADMIN_API_KEY)) return json({ error: 'Unauthorized' }, 401);

    const platform = body.platform;
    const taskName = REVIEW_TASK_FOR_PLATFORM[platform];
    if (!taskName) return badRequest("platform must be 'g2' or 'trustpilot'");
    if (!Array.isArray(body.review_urls)) return badRequest('review_urls must be an array');

    const seen = new Map();
    const unparsed = [];
    for (const url of body.review_urls) {
        const key = reviewUrlKey(taskName, url);
        if (key) seen.set(key, url);
        else unparsed.push(url);
    }

    if (seen.size) {
        // Upsert so a re-sync refreshes last_seen_at rather than erroring.
        await supabaseFetch(env, 'known_reviews?on_conflict=review_key', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates',
            body: JSON.stringify([...seen].map(([review_key, review_url]) => ({
                review_key, platform, review_url, last_seen_at: new Date().toISOString(),
            }))),
        });
    }

    // Release anything that was waiting only because we had not seen it yet.
    const released = [];
    const pending = await supabaseFetch(
        env,
        `pending_reviews?status=eq.pending&platform=${eq(platform)}&select=id,review_key,user_id`
    );
    for (const row of pending || []) {
        if (!row.review_key || !seen.has(row.review_key)) continue;
        const r = await approveReview(env, row.id, 'auto_after_sync');
        if (!r.error) released.push({ user_id: row.user_id, credited: r.credited });
    }

    return json({
        success: true,
        platform,
        recorded: seen.size,
        unparsed: unparsed.length,
        released_count: released.length,
        released,
    });
}

// ---------------------------------------------------------------------------
// POST /admin/reconcile-approved  { admin_key }
//
// Approved reviews whose credit grant did not land — the RPC failed after the
// rows were written. Without this they stay invisible and unpaid.
// ---------------------------------------------------------------------------
async function handleReconcile(request, env) {
    const body = await request.json().catch(() => ({}));
    if (!adminKeyValid(body.admin_key, env.ADMIN_API_KEY)) return json({ error: 'Unauthorized' }, 401);

    const rows = await supabaseFetch(env, 'pending_reviews?status=eq.approved&select=id,user_id,platform,credits');
    const repaired = [];
    for (const review of rows || []) {
        const taskName = REVIEW_TASK_FOR_PLATFORM[review.platform];
        if (!taskName) continue;
        const completion = await findCompletion(env, review.user_id, taskName);
        // credits === 0 on a completed row means the payout never happened.
        if (completion && completion.status === 'completed' && Number(completion.credits) === 0) {
            await supabaseFetch(env, `user_task_completions?user_id=${eq(review.user_id)}&task_name=${eq(taskName)}`, {
                method: 'PATCH',
                body: JSON.stringify({ credits: review.credits }),
            });
            await creditUser(env, review.user_id, review.credits);
            repaired.push({ user_id: review.user_id, task_name: taskName, credits: review.credits });
        }
    }
    return json({ success: true, repaired_count: repaired.length, repaired });
}

// ===========================================================================
export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        try {
            if (request.method === 'GET') {
                if (url.pathname === '/admin/review/approve-link') return await handleReviewLinkPage(request, env, 'approve');
                if (url.pathname === '/admin/review/reject-link')  return await handleReviewLinkPage(request, env, 'reject');
                return json({ error: 'Method not allowed' }, 405);
            }
            if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

            switch (url.pathname) {
                case '/tasks/complete':            return await handleComplete(request, env);
                case '/tasks/submit-review':       return await handleSubmitReview(request, env);
                case '/tasks/status':              return await handleStatus(request, env);
                case '/tasks/dismiss-popup':       return await handleDismissPopup(request, env);
                case '/admin/review/approve':      return await handleApproveReview(request, env);
                case '/admin/review/reject':       return await handleRejectReview(request, env);
                case '/admin/review/approve-link': return await handleReviewLinkAction(request, env, 'approve');
                case '/admin/review/reject-link':  return await handleReviewLinkAction(request, env, 'reject');
                case '/admin/sync-reviews':        return await handleSyncReviews(request, env);
                case '/admin/reconcile-approved':  return await handleReconcile(request, env);
                default: return json({ error: 'Not found' }, 404);
            }
        } catch (e) {
            console.error('unhandled:', e);
            // Never return e.message: it can carry Supabase responses.
            return json({ error: 'Internal error' }, 500);
        }
    },
};
