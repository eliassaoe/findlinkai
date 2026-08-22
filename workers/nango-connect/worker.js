// Mints Nango Connect session tokens so a paid user can authorise HubSpot from
// the CRM Sync tab, and reports whether they already have.
//
// Why this worker exists at all: creating a Nango connection costs money per
// connection. That is the entire reason HubSpot sync is a paid feature and the
// reason the CRM audit was built to need no connection. So the paid check has
// to happen HERE, server-side. The browser cannot be trusted with it - anyone
// can call a worker with any token, and a client-side `if (isPaid)` is a
// suggestion, not a gate.
//
// The Nango secret key never reaches the browser. The browser receives only a
// short-lived connect session token scoped to one end user.
//
// Endpoints, all POST with {token}:
//   /session  -> {sessionToken, expiresAt}  mint a Connect session (paid only)
//   /finalise -> {ready}                    write the sync's metadata post-connect
//   /status   -> {connected, connectionId, provider}
//   /disconnect -> {disconnected}           delete the connection, freeing the seat
//
// Deploy: see README.md in this directory.

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NANGO_API = 'https://api.nango.dev';
const INTEGRATION = 'hubspot';

const ALLOWED_ORIGINS = ['https://linkfinderai.com', 'https://www.linkfinderai.com'];

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const cors = corsHeaders(origin);

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

        const route = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop();

        let body;
        try { body = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400, cors); }

        const token = body && body.token;
        if (!token) return json({ error: 'Missing token' }, 400, cors);

        const user = await resolveUser(env, token);
        if (!user) return json({ error: 'Unknown token' }, 401, cors);

        try {
            if (route === 'status')     return json(await status(env, user), 200, cors);
            if (route === 'session')    return json(...(await session(env, user)), cors);
            if (route === 'finalise')   return json(await finalise(env, user), 200, cors);
            if (route === 'disconnect') return json(await disconnect(env, user), 200, cors);
        } catch (err) {
            console.error(route + ' failed', err && err.message);
            return json({ error: 'Internal error' }, 500, cors);
        }
        return json({ error: 'Unknown route' }, 404, cors);
    }
};

/* ------------------------------------------------------------------ routes */

async function session(env, user) {
    const paid = await isPaid(env, user.token);
    if (!paid) {
        // 402 rather than 403: this is not "you may never", it is "not on this
        // plan". The page turns it into an upgrade prompt.
        return [{ error: 'plan_required', message: 'HubSpot sync is included on any paid plan.' }, 402];
    }

    // Reuse an existing connection instead of minting a second one for the same
    // person - duplicates would silently double the per-connection cost.
    const existing = await findConnection(env, user.token);
    if (existing) {
        return [{ alreadyConnected: true, connectionId: existing.connection_id }, 200];
    }

    const res = await fetch(NANGO_API + '/connect/sessions', {
        method: 'POST',
        headers: { ...JSON_HEADERS, Authorization: 'Bearer ' + env.NANGO_SECRET_KEY },
        body: JSON.stringify({
            end_user: {
                // The LinkFinder token is the stable per-user id everything else
                // keys on, so it is what the Nango connection is filed under too.
                id: user.token,
                email: user.email || undefined,
                display_name: user.email || undefined
            },
            allowed_integrations: [INTEGRATION]
        })
    });

    if (!res.ok) {
        console.error('nango session failed', res.status, await safeText(res));
        return [{ error: 'connect_unavailable' }, 502];
    }

    const data = await res.json();
    return [{ sessionToken: data?.data?.token, expiresAt: data?.data?.expires_at }, 200];
}

/*
 * Authorising HubSpot is only half of it. The sync reads its configuration from
 * the CONNECTION's metadata - above all the customer's own LinkFinder API key,
 * because enrichment is billed to their account, not ours. Without this the
 * connection looks healthy in the Nango dashboard and every run fails on a
 * missing key.
 *
 * The key is read server-side from the account row rather than passed up by the
 * browser: the page should never have to hold it, and a client-supplied key
 * would let anyone bill enrichment to someone else's account.
 */
async function finalise(env, user) {
    const conn = await findConnection(env, user.token);
    if (!conn) return { ready: false, reason: 'not_connected' };

    const apiKey = await apiKeyFor(env, user.token);
    if (!apiKey) {
        console.error('no api_key on account row; sync would fail on every run');
        return { ready: false, reason: 'no_api_key' };
    }

    const res = await fetch(
        NANGO_API + '/connection/' + encodeURIComponent(conn.connection_id) + '/metadata',
        {
            method: 'POST',
            headers: {
                ...JSON_HEADERS,
                Authorization: 'Bearer ' + env.NANGO_SECRET_KEY,
                'Provider-Config-Key': INTEGRATION
            },
            body: JSON.stringify({
                apiKey,
                // Defaults matching the sync's own schema. The properties must
                // already exist in the customer's HubSpot portal.
                type: 'linkedin_profile_to_linkedin_info',
                linkedinUrlProperty: 'linkedin_url',
                targetProperty: 'linkfinder_ai_data',
                maxContactsPerRun: 100
            })
        }
    );

    if (!res.ok) {
        console.error('nango metadata write failed', res.status, await safeText(res));
        return { ready: false, reason: 'metadata_failed' };
    }
    return { ready: true };
}

async function apiKeyFor(env, token) {
    const table = env.ACCOUNTS_TABLE || 'linkfinderai_users';
    const col = env.TOKEN_COLUMN || 'token';
    const keyCol = env.API_KEY_COLUMN || 'api_key';
    const res = await fetch(
        env.SUPABASE_URL + '/rest/v1/' + table + '?' + col + '=eq.' + encodeURIComponent(token) +
            '&select=' + encodeURIComponent(keyCol) + '&limit=1',
        { headers: sbHeaders(env) }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length ? rows[0][keyCol] || null : null;
}

async function status(env, user) {
    const conn = await findConnection(env, user.token);
    return {
        connected: Boolean(conn),
        connectionId: conn ? conn.connection_id : null,
        provider: conn ? conn.provider_config_key : null,
        paid: await isPaid(env, user.token)
    };
}

async function disconnect(env, user) {
    const conn = await findConnection(env, user.token);
    if (!conn) return { disconnected: false, reason: 'not_connected' };

    const res = await fetch(
        NANGO_API + '/connection/' + encodeURIComponent(conn.connection_id) +
            '?provider_config_key=' + encodeURIComponent(INTEGRATION),
        { method: 'DELETE', headers: { Authorization: 'Bearer ' + env.NANGO_SECRET_KEY } }
    );

    if (!res.ok) {
        console.error('nango delete failed', res.status);
        return { disconnected: false, reason: 'upstream_error' };
    }
    return { disconnected: true };
}

/* ------------------------------------------------------------------ helpers */

async function findConnection(env, token) {
    const res = await fetch(
        NANGO_API + '/connection?endUserId=' + encodeURIComponent(token),
        { headers: { Authorization: 'Bearer ' + env.NANGO_SECRET_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.connections || data?.data || [];
    return list.find((c) => c.provider_config_key === INTEGRATION) || null;
}

/*
 * Subscription state does not live in Supabase - the dodo webhook only emits
 * PostHog events - so the existing Railway endpoint is the source of truth. It
 * is called from here rather than from the page precisely so the answer cannot
 * be forged by whoever is holding the browser.
 */
async function isPaid(env, token) {
    if (!env.SUBSCRIPTION_CHECK_URL) {
        console.error('SUBSCRIPTION_CHECK_URL is not configured; refusing to mint a paid-only session');
        return false;   // fail closed: an unconfigured gate must not be an open one
    }
    try {
        const res = await fetch(env.SUBSCRIPTION_CHECK_URL, {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ token })
        });
        if (!res.ok) return false;
        const data = await res.json();
        return data.issub === true;
    } catch (err) {
        console.error('subscription check failed', err && err.message);
        return false;
    }
}

async function resolveUser(env, token) {
    const table = env.ACCOUNTS_TABLE || 'linkfinderai_users';
    const col = env.TOKEN_COLUMN || 'token';
    const res = await fetch(
        env.SUPABASE_URL + '/rest/v1/' + table + '?' + col + '=eq.' + encodeURIComponent(token) + '&select=*&limit=1',
        { headers: sbHeaders(env) }
    );
    if (!res.ok) { console.error('resolveUser failed', res.status); return null; }
    const rows = await res.json();
    if (!rows.length) return null;
    return { token, email: rows[0].email };
}

function sbHeaders(env) {
    return {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
    };
}

async function safeText(res) { try { return await res.text(); } catch { return ''; } }

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin'
    };
}

function json(payload, statusCode, cors) {
    return new Response(JSON.stringify(payload), {
        status: statusCode,
        headers: { ...JSON_HEADERS, ...cors }
    });
}
