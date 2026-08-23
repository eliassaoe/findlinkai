// linkfinderai-sign-up
//
// Front door for both signup paths - the email/password form in sign-up.html and
// the Google flow in confirmation-signup.html, which posts here with
// provider:'google'. One change here therefore covers both.
//
// It validates, blocks disposable domains, rate-limits by IP, decides the geo
// tier and the starting credit grant, then forwards everything to n8n.

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
                return handleSignup(request, corsHeaders, env);
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// Geo-tier detection for signup credit amounts.
// request.cf.country is populated automatically by Cloudflare on every
// request that hits this Worker directly from the browser — no external
// GeoIP lookup needed. CF-IPCountry header is used as a fallback in case
// request.cf is ever unavailable (e.g. certain local dev/preview setups).
const LOW_CONVERSION_COUNTRIES = new Set(['IN', 'PK', 'NG', 'BD', 'EG']);

// 22 Aug 2026: standard 150 -> 50, low_conversion 25 -> 10.
//
// The grant was 50 until mid-June, then raised to 150 to show more value. The
// effect is unambiguous in the data: the share of activated users who ever
// reached the paywall fell from ~26% to ~5% in the week of 14 June and stayed
// there. Raising the grant did what raising a grant does - it stopped people
// needing to buy. The median user spends 9 credits, so 50 is still several
// times a real evaluation.
//
// The low tier is cut harder for a different reason. Over sixteen weeks those
// five countries were 55% of signups and 5% of revenue: 993 signups produced
// one payment, against 820 producing twenty. At 0.1% conversion the grant there
// is a cost, not an investment.
//
// See docs/credit-grant.md for the full working.
const SIGNUP_CREDITS = { low_conversion: 10, standard: 50 };

function getCountry(request) {
    return (request.cf && request.cf.country) || request.headers.get('CF-IPCountry') || null;
}

function geoTierFromCountry(country) {
    return country && LOW_CONVERSION_COUNTRIES.has(country) ? 'low_conversion' : 'standard';
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handleSignup(request, corsHeaders, env) {
    try {
        const body = await request.json();

        const { email, password, provider, type, ref, firstName, lastName, companyName, fbc, fbp, gclid } = body;

        // ── 1. Basic email validation ──────────────────────────────────────────
        if (!email || !email.includes('@')) {
            return new Response(JSON.stringify({ error: 'A valid email address is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // ── 2. Normalize email (Gmail dot/+ dedup) ─────────────────────────────
        const normalizedEmail = normalizeEmail(email);
        const emailDomain = normalizedEmail.split('@')[1];

        // ── 2b. Geo tier + starting credits ─────────────────────────────────────
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
            startingCredits
        });

        // ── 3. Block disposable email domains ──────────────────────────────────
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

        // ── 3b. Gmail on the password form → send them to the Google button ────
        //
        // A @gmail.com address IS a Google account, so anyone with a real one can
        // always sign in with Google — same address, one click, and Google has
        // already verified it for us. The only people this stops are the ones
        // typing a gmail they do not own, because they cannot pass Google's login.
        //
        // 3,350 of the 4,616 never-verified accounts in the base are gmail, so
        // this closes ~73% of the hole for free. See docs/email-verified-is-wrong.md.
        //
        // Deliberately NOT extended to yahoo / outlook / hotmail / icloud: there is
        // no OAuth provider for those on this site, so blocking them would leave
        // real people with no way to sign up at all.
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

        // ── 4. IP rate limiting (3 accounts per IP per 24h) ────────────────────
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

        // ── 5. Forward to n8n ──────────────────────────────────────────────────
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
                startingCredits: startingCredits
            })
        });

        const responseData = await response.text();
        console.log(`📡 n8n signup response: ${response.status}`);

        // ── 6. Increment IP counter on success ─────────────────────────────────
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
