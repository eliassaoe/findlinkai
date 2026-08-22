// Email verification for LinkFinder signups.
//
// Why this exists: sign-up.html posts to the signup worker, gets a token back and
// redirects straight into the dashboard. Nothing ever checks that the address is
// real, so anyone can type anything and get a funded account. That costs credits,
// and — now that lifecycle email is live — it costs sending reputation. Amazon SES
// puts an account under review at a 5% hard-bounce rate, and linkfinderai.com is a
// new sending domain with no history to absorb a spike.
//
// The shape of the fix, deliberately narrow:
//
//   * Google signups (76% of them) are already verified by Google. They are never
//     touched by any of this and see no friction at all.
//   * Email/password signups get VERIFY_CAP credits instead of the full grant, can
//     use every part of the product, and are topped up the moment they confirm.
//     The full grant is geo-tiered in the signup worker - 150 normally, 25 for
//     IN/PK/NG/BD/EG - so how much is held differs per signup and cannot be a
//     constant here. The signup worker stashes the exact figure in KV under
//     held_<normalized-email> and this worker reads it back.
//   * Unverified addresses are excluded from marketing email until they confirm.
//
// Endpoints, all POST with {token}:
//   /status  -> {email_verified, verify_cap, credits_pending}
//   /resend  -> asks Supabase to send the confirmation email again (rate limited)
//   /claim   -> if Supabase says the address is confirmed, release the held credits
//
// Deploy: see README.md in this directory.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Only the app's own origins may call this. The token is a bearer credential and
// must not be readable by a page on someone else's domain.
const ALLOWED_ORIGINS = [
    'https://linkfinderai.com',
    'https://www.linkfinderai.com'
];

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const cors = corsHeaders(origin);

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

        const url = new URL(request.url);
        const route = url.pathname.replace(/\/+$/, '').split('/').pop();

        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'Bad JSON' }, 400, cors); }
        const token = body && body.token;
        if (!token) return json({ error: 'Missing token' }, 400, cors);

        const user = await resolveUser(env, token);
        if (!user) return json({ error: 'Unknown token' }, 401, cors);

        try {
            if (route === 'status') return json(await status(env, user), 200, cors);
            if (route === 'resend') return json(await resend(env, user), 200, cors);
            if (route === 'claim')  return json(await claim(env, user), 200, cors);
        } catch (err) {
            // Never leak internals to the browser; the message goes to the log.
            console.error(route + ' failed', err && err.message);
            return json({ error: 'Internal error' }, 500, cors);
        }
        return json({ error: 'Unknown route' }, 404, cors);
    }
};

// --- routes ------------------------------------------------------------------

async function status(env, user) {
    return {
        email_verified: user.email_verified,
        verify_cap: capOf(env),
        credits_pending: user.email_verified ? 0 : await heldFor(env, user.email)
    };
}

async function resend(env, user) {
    if (user.email_verified) return { ok: true, already_verified: true };

    // Supabase enforces its own per-address rate limit and returns 429. Surface
    // that as a normal response rather than an error: the caller shows a wait
    // message, and an unbounded resend button is a good way to get a sending
    // domain blocklisted.
    const r = await fetch(env.SUPABASE_URL + '/auth/v1/resend', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY
        },
        body: JSON.stringify({ type: 'signup', email: user.email })
    });

    if (r.status === 429) return { ok: false, rate_limited: true };
    if (!r.ok) {
        console.error('supabase resend failed', r.status, await r.text());
        return { ok: false };
    }
    return { ok: true };
}

// Called when someone lands back on the site after clicking the link, and also
// polled by the app. Idempotent: the top-up only ever happens once, guarded by
// the verified flag on the account row.
async function claim(env, user) {
    const confirmed = await isConfirmedInSupabase(env, user.auth_id);
    if (!confirmed) return { ok: false, email_verified: false };

    if (user.email_verified) return { ok: true, email_verified: true, credits_added: 0 };

    const held = await heldFor(env, user.email);
    await patchAccount(env, user.id, {
        [env.VERIFIED_COLUMN || 'email_verified']: true,
        [env.CREDITS_COLUMN || 'credits']: (user.credits || 0) + held
    });
    // Burn the stash so a replay cannot pay twice even if the account row write
    // is later rolled back by hand. The verified flag is the primary guard; this
    // is the belt to its braces.
    if (held > 0 && env.RATE_LIMITS) {
        try { await env.RATE_LIMITS.delete(heldKey(user.email)); } catch (e) {}
    }
    return { ok: true, email_verified: true, credits_added: held };
}

// --- Supabase ----------------------------------------------------------------
//
// Table and column names come from env so this fits the existing schema without
// editing code. Defaults match the names used elsewhere in the app.

function accountsTable(env) { return env.ACCOUNTS_TABLE || 'users'; }
function tokenColumn(env)   { return env.TOKEN_COLUMN   || 'token'; }
function capOf(env)         { return Number(env.VERIFY_CAP || 10); }

// Gmail dot/plus normalization, matching normalizeEmail() in the signup worker.
// The key was written with the normalized form, so it has to be read that way.
function heldKey(email) {
    const [local, domain] = String(email || '').toLowerCase().trim().split('@');
    if (!local || !domain) return 'held_' + String(email || '').toLowerCase().trim();
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        return 'held_' + local.replace(/\./g, '').split('+')[0] + '@gmail.com';
    }
    return 'held_' + local + '@' + domain;
}

// How many credits this account is owed on confirmation. Falls back to the
// standard grant minus the cap when the stash is missing - which happens for
// anyone who signed up before the hold existed.
async function heldFor(env, email) {
    if (env.RATE_LIMITS) {
        try {
            const v = await env.RATE_LIMITS.get(heldKey(email));
            if (v !== null) return Math.max(0, Number(v) || 0);
        } catch (e) { console.error('held lookup failed', e); }
    }
    return Number(env.VERIFY_HELD_FALLBACK || 0);
}

function sbHeaders(env) {
    return {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY
    };
}

async function resolveUser(env, token) {
    const t = accountsTable(env);
    const col = tokenColumn(env);
    const r = await fetch(
        env.SUPABASE_URL + '/rest/v1/' + t + '?' + col + '=eq.' + encodeURIComponent(token) + '&select=*&limit=1',
        { headers: sbHeaders(env) }
    );
    if (!r.ok) { console.error('resolveUser failed', r.status); return null; }
    const rows = await r.json();
    if (!rows.length) return null;
    const row = rows[0];
    return {
        id: row.id,
        auth_id: row[env.AUTH_ID_COLUMN || 'auth_id'] || row.id,
        email: row.email,
        credits: row[env.CREDITS_COLUMN || 'credits'],
        // A missing column reads as undefined, which must not look like "verified".
        email_verified: row[env.VERIFIED_COLUMN || 'email_verified'] === true
    };
}

async function isConfirmedInSupabase(env, authId) {
    if (!authId) return false;
    const r = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users/' + authId, { headers: sbHeaders(env) });
    if (!r.ok) { console.error('admin user lookup failed', r.status); return false; }
    const u = await r.json();
    return Boolean(u && u.email_confirmed_at);
}

async function patchAccount(env, id, patch) {
    const r = await fetch(
        env.SUPABASE_URL + '/rest/v1/' + accountsTable(env) + '?id=eq.' + encodeURIComponent(id),
        { method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify(patch) }
    );
    if (!r.ok) throw new Error('patchAccount ' + r.status + ' ' + await r.text());
}

// --- helpers -----------------------------------------------------------------

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}

function json(obj, statusCode, extra) {
    return new Response(JSON.stringify(obj), {
        status: statusCode,
        headers: Object.assign({}, JSON_HEADERS, extra || {})
    });
}
