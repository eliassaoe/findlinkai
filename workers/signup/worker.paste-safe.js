/* linkfinderai-sign-up */
/* */
/* Front door for both signup paths - the email/password form in sign-up.html and */
/* the Google flow in confirmation-signup.html, which posts here with */
/* provider:'google'. One change here therefore covers both. */
/* */
/* It validates, blocks disposable domains, rate-limits by IP, decides the geo */
/* tier and the starting credit grant, then forwards everything to n8n. */
/* */
/* POST /100free is the same handler with one extra step: once n8n has created */
/* the account and returned its token, the onboarding-tasks worker is asked to */
/* grant the 1,000-credit signup bonus (task signup_100free) before the browser */
/* gets its answer. The amount lives there, in TASK_CONFIG, next to the G2 */
/* reward it reuses; this file only names the task. Needs the SIGNUP_GRANT_KEY */
/* secret, set in the dashboard alongside the KV bindings. */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-api-secret',
            'Access-Control-Max-Age': '86400',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: corsHeaders });
        }

        console.log(`🌐 ${request.method} ${url.pathname}`);

        try {
            if (url.pathname === '/' && request.method === 'POST') {
                return handleSignup(request, corsHeaders, env, null);
            }
            /* The grant is bound to this path and nothing else: no promo code, */
            /* no query parameter, nothing the browser can lose on a redirect. */
            if (url.pathname === '/100free' && request.method === 'POST') {
                return handleSignup(request, corsHeaders, env, SIGNUP_GRANT_TASKS['/100free']);
            }

            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });

        } catch (error) {
            console.error('❌ Worker error:', error);
            return new Response(JSON.stringify({
                error: 'Internal server error',
                message: error.message
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
    },
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

/* Consumer mailbox providers other than Gmail. Gmail is handled separately just */
/* above, because a gmail address is a Google account and can always sign in with */
/* the Google button. These have no OAuth provider here, so the rule is a genuine */
/* block — priced at 2.0% of signups (38 people / 365 days) against 75.5% gmail */
/* and 22.6% business. See docs/email-verified-is-wrong.md. */
/* */
/* Exact-match against this Set, never a substring test: 'gmail.com' *contains* */
/* 'mail.com', so substring matching would block every Gmail user on earth. */
const CONSUMER_DOMAINS = new Set([
    'yahoo.com','yahoo.co.uk','yahoo.fr','yahoo.co.in','yahoo.ca','yahoo.com.au','ymail.com','rocketmail.com',
    'hotmail.com','hotmail.co.uk','hotmail.fr','outlook.com','outlook.fr','live.com','live.co.uk','msn.com',
    'icloud.com','me.com','mac.com',
    'aol.com','aim.com',
    'proton.me','protonmail.com','pm.me',
    'gmx.com','gmx.de','gmx.net','mail.com','email.com',
    'zoho.com','yandex.com','yandex.ru','inbox.com','rediffmail.com',
    'free.fr','orange.fr','laposte.net','sfr.fr','wanadoo.fr','web.de','t-online.de'
]);

function normalizeEmail(email) {
    const [local, domain] = email.toLowerCase().trim().split('@');
    if (!local || !domain) return email.toLowerCase().trim();
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        const cleaned = local.replace(/\./g, '').split('+')[0];
        return `${cleaned}@gmail.com`;
    }
    return `${local}@${domain}`;
}

async function isDisposable(domain, env) {
    if (!env.DISPOSABLE_DOMAINS) {
        console.warn('⚠️ DISPOSABLE_DOMAINS KV namespace not configured - disposable check disabled');
        return false;
    }
    const result = await env.DISPOSABLE_DOMAINS.get(domain);
    return result !== null;
}

/* Geo-tier detection for signup credit amounts. */
/* request.cf.country is populated automatically by Cloudflare on every */
/* request that hits this Worker directly from the browser — no external */
/* GeoIP lookup needed. CF-IPCountry header is used as a fallback in case */
/* request.cf is ever unavailable (e.g. certain local dev/preview setups). */
const LOW_CONVERSION_COUNTRIES = new Set(['IN', 'PK', 'NG', 'BD', 'EG']);

/* 22 Aug 2026: standard 150 -> 50, low_conversion 25 -> 10. */
/* */
/* The grant was 50 until mid-June, then raised to 150 to show more value. The */
/* effect is unambiguous in the data: the share of activated users who ever */
/* reached the paywall fell from ~26% to ~5% in the week of 14 June and stayed */
/* there. Raising the grant did what raising a grant does - it stopped people */
/* needing to buy. The median user spends 9 credits, so 50 is still several */
/* times a real evaluation. */
/* */
/* The low tier is cut harder for a different reason. Over sixteen weeks those */
/* five countries were 55% of signups and 5% of revenue: 993 signups produced */
/* one payment, against 820 producing twenty. At 0.1% conversion the grant there */
/* is a cost, not an investment. */
/* */
/* See docs/credit-grant.md for the full working. */
const SIGNUP_CREDITS = { low_conversion: 10, standard: 50 };

/* Landing pages that carry a signup bonus, mapped to the onboarding-tasks task */
/* that pays it. The bonus is granted on top of SIGNUP_CREDITS, exactly as a G2 */
/* review is, and the amount is defined over there (TASK_CONFIG), not here. */
const SIGNUP_GRANT_TASKS = { '/100free': 'signup_100free' };
const ONBOARDING_TASKS_URL = 'https://onboarding-tasks-worker.hamoureliasse.workers.dev';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/* Only the five utm_* fields, trimmed and capped. Anything else the page sends */
/* is dropped here, before it can reach n8n, a column, or an analytics property. */
function pickUtm(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const key of UTM_KEYS) {
        const value = raw[key];
        if (typeof value !== 'string') continue;
        const trimmed = value.trim().slice(0, 200);
        if (trimmed) out[key] = trimmed;
    }
    return out;
}

/* Pull the account token out of whatever n8n answered. The signup pages read */
/* `token` off the JSON, so that is the one field this depends on. */
function tokenFromN8n(text) {
    try {
        const data = JSON.parse(text);
        return data && typeof data.token === 'string' && data.token ? data.token : null;
    } catch (e) {
        return null;
    }
}

/* n8n's answer is passed to the browser verbatim. This adds a field to it */
/* when it is JSON, and leaves it untouched when it is not. */
function mergeIntoJson(text, extra) {
    try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) return text;
        return JSON.stringify({ ...data, ...extra });
    } catch (e) {
        return text;
    }
}

/* Ask the onboarding-tasks worker to pay the signup bonus. Same route shape as */
/* its other task endpoints; the key is what makes it unreachable from a browser. */
/* One retry on a network failure, none on a definite answer (a 409 means the */
/* account was already paid, which is the guard working, not an error). */
async function grantSignupCredits(env, userToken, taskName, attribution) {
    if (!env.SIGNUP_GRANT_KEY) {
        console.error('❌ SIGNUP_GRANT_KEY not set - signup bonus NOT granted for', taskName);
        return { error: 'grant_not_configured' };
    }
    const body = JSON.stringify({ key: env.SIGNUP_GRANT_KEY, user_token: userToken, task_name: taskName, attribution });
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await fetch(`${ONBOARDING_TASKS_URL}/tasks/signup-grant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                console.log(`🎁 Signup bonus granted: ${taskName} +${data.credits_awarded} -> balance ${data.credits_balance}`);
                return { task_name: taskName, credits_awarded: data.credits_awarded, credits_balance: data.credits_balance };
            }
            console.error(`❌ Signup bonus refused (${res.status}):`, data.error || 'no detail');
            return { error: data.error || `grant_failed_${res.status}`, status: res.status };
        } catch (e) {
            console.error(`⚠️ Signup bonus request failed (attempt ${attempt}/2):`, e.message);
            if (attempt === 2) return { error: 'grant_unreachable' };
        }
    }
    return { error: 'grant_unreachable' };
}

function getCountry(request) {
    return (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || null;
}

function geoTierFromCountry(country) {
    return country && LOW_CONVERSION_COUNTRIES.has(country) ? 'low_conversion' : 'standard';
}

/* ─── Handler ───────────────────────────────────────────────────────────────── */

async function handleSignup(request, corsHeaders, env, grantTask) {
    try {
        const body = await request.json();

        const { email, password, provider, type, ref, firstName, lastName, companyName, fbc, fbp, gclid } = body;
        const utm = pickUtm(body.utm);

        /* ── 1. Basic email validation ────────────────────────────────────────── */
        if (!email || !email.includes('@')) {
            return new Response(JSON.stringify({ error: 'A valid email address is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 2. Normalize email (Gmail dot/+ dedup) ───────────────────────────── */
        const normalizedEmail = normalizeEmail(email);
        const emailDomain = normalizedEmail.split('@')[1];

        /* ── 2b. Geo tier + starting credits ───────────────────────────────────── */
        const country = getCountry(request);
        const geoTier = geoTierFromCountry(country);
        const startingCredits = SIGNUP_CREDITS[geoTier];

        console.log('📧 Handling signup:', {
            email,
            normalizedEmail,
            hasPassword: !!password,
            provider: provider || 'email',
            type,
            ref: ref || 'none',
            firstName: firstName || 'none',
            lastName: lastName || 'none',
            companyName: companyName || 'none',
            fbc: fbc || 'none',
            fbp: fbp || 'none',
            gclid: gclid || 'none',
            country: country || 'unknown',
            geoTier,
            startingCredits,
            grantTask: grantTask || 'none',
            utm
        });

        /* ── 3. Block disposable email domains ────────────────────────────────── */
        const disposable = await isDisposable(emailDomain, env);
        if (disposable) {
            console.log('🚫 Disposable email blocked:', emailDomain);
            return new Response(JSON.stringify({
                error: 'Please use a permanent email address to sign up.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 3b. Gmail on the password form → send them to the Google button ──── */
        /* */
        /* A @gmail.com address IS a Google account, so anyone with a real one can */
        /* always sign in with Google — same address, one click, and Google has */
        /* already verified it for us. The only people this stops are the ones */
        /* typing a gmail they do not own, because they cannot pass Google's login. */
        /* */
        /* 3,350 of the 4,616 never-verified accounts in the base are gmail, so */
        /* this closes ~73% of the hole for free. See docs/email-verified-is-wrong.md. */
        /* */
        /* Deliberately NOT extended to yahoo / outlook / hotmail / icloud: there is */
        /* no OAuth provider for those on this site, so blocking them would leave */
        /* real people with no way to sign up at all. */
        if (provider !== 'google' && (emailDomain === 'gmail.com' || emailDomain === 'googlemail.com')) {
            console.log('🚫 Gmail on password signup, routed to Google:', normalizedEmail);
            return new Response(JSON.stringify({
                error: 'Gmail addresses sign in with the Google button — one click, no password to remember.',
                code: 'use_google_signin'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 3c. Other consumer mailboxes → business email required ───────────── */
        if (provider !== 'google' && CONSUMER_DOMAINS.has(emailDomain)) {
            console.log('🚫 Consumer domain blocked on signup:', emailDomain);
            return new Response(JSON.stringify({
                error: 'Please sign up with your work email address.',
                code: 'business_email_required'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        /* ── 4. IP rate limiting (3 accounts per IP per 24h) ──────────────────── */
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const ipKey = `ip_${ip}`;
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        if (!env.RATE_LIMITS) {
            console.warn('⚠️ RATE_LIMITS KV namespace not configured - rate limiting disabled');
        } else {
            const ipData = await env.RATE_LIMITS.get(ipKey);
            let ipAttempts = ipData ? JSON.parse(ipData) : { count: 0, firstAttempt: now };

            if (now - ipAttempts.firstAttempt > oneDay) {
                ipAttempts = { count: 0, firstAttempt: now };
            }

            if (ipAttempts.count >= 3) {
                console.log('🚫 Rate limit exceeded for IP:', ip);
                const hoursLeft = Math.ceil((oneDay - (now - ipAttempts.firstAttempt)) / (60 * 60 * 1000));
                return new Response(JSON.stringify({
                    error: `Too many accounts created from this network.`,
                    retryAfter: hoursLeft
                }), {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': (hoursLeft * 3600).toString(),
                        ...corsHeaders
                    }
                });
            }

            console.log(`✅ IP ${ip} - Attempt ${ipAttempts.count + 1}/3`);
        }

        /* ── 5. Forward to n8n ────────────────────────────────────────────────── */
        const response = await fetch('https://scalelinkfinderai-production.up.railway.app/webhook/751f84b6-ee4b-4f80-a724-fa64d89580ff', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                normalizedEmail: normalizedEmail,
                password: password,
                provider: provider || 'email',
                type: type || 'signup',
                ref: ref || null,
                firstName: firstName || null,
                lastName: lastName || null,
                companyName: companyName || null,
                fbc: fbc || null,
                fbp: fbp || null,
                gclid: gclid || null,
                country: country || null,
                geoTier: geoTier,
                startingCredits: startingCredits,
                /* Attribution, forwarded so n8n can store it if it wants to. The */
                /* authoritative write is the PATCH the onboarding-tasks worker */
                /* does during the grant; this is belt and braces. */
                ...utm,
                signupLanding: grantTask ? Object.keys(SIGNUP_GRANT_TASKS).find((k) => SIGNUP_GRANT_TASKS[k] === grantTask) : null
            })
        });

        let responseData = await response.text();
        console.log(`📡 n8n signup response: ${response.status}`);

        /* ── 5b. Signup bonus, before the browser hears back ──────────────────── */
        /* */
        /* The account now exists and n8n has returned its token, but nobody has */
        /* opened the app yet. Granting here is what makes "credited at account */
        /* creation, before first login" literally true. A failed grant does not */
        /* fail the signup: the account is real, the answer carries the failure, */
        /* and the page reports it. */
        if (response.ok && grantTask) {
            const token = tokenFromN8n(responseData);
            if (!token) {
                console.error('❌ n8n returned no token; signup bonus NOT granted for', grantTask);
                responseData = mergeIntoJson(responseData, { signup_grant: { error: 'no_token' } });
            } else {
                const grant = await grantSignupCredits(env, token, grantTask, utm);
                responseData = mergeIntoJson(responseData, { signup_grant: grant });
            }
        }

        /* ── 6. Increment IP counter on success ───────────────────────────────── */
        if (response.ok && env.RATE_LIMITS) {
            try {
                const ipData = await env.RATE_LIMITS.get(ipKey);
                let ipAttempts = ipData ? JSON.parse(ipData) : { count: 0, firstAttempt: now };

                ipAttempts.count++;

                await env.RATE_LIMITS.put(ipKey, JSON.stringify(ipAttempts), {
                    expirationTtl: 86400
                });

                console.log(`✅ Signup successful. IP now at ${ipAttempts.count}/3 attempts`);
            } catch (e) {
                console.error('⚠️ Failed to update rate limit (non-critical):', e);
            }
        }

        return new Response(responseData, {
            status: response.status,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

    } catch (error) {
        console.error('❌ Signup error:', error);
        return new Response(JSON.stringify({
            error: 'Signup failed',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}
