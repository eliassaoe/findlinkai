// Mints a single-use, 24-hour, 40%-off discount code for one account.
//
// This endpoint creates real money-off codes, so it is written to fail closed.
// Four independent guards, all of which must pass before Dodo is ever called:
//
//   1. The account must exist in Supabase. Without this, anyone can POST random
//      tokens in a loop and mint coupons.
//   2. The account must not already be a subscriber. A 40% code handed to
//      someone already paying full price is a pure refund.
//   3. One code per account, ever (within the KV retention window).
//   4. One code per IP. Shared offices will collide; that is the intended
//      trade-off, and the account guard is the one that actually matters.
//
// Guards 3 and 4 are idempotent rather than refusing: asking twice returns the
// same code with its original expiry. A user who closes the modal and reopens it
// should see their code again, not be told off.
//
// The discount is restricted to subscription products only. DISCOUNT_PRODUCT_IDS
// is required - with no restriction Dodo would happily apply 40% to the
// pay-as-you-go packs too, which is not what this offer is.

const DODO_API = 'https://live.dodopayments.com';
const PERCENT_OFF = 40;
const TTL_SECONDS = 24 * 60 * 60;

// No I/O/0/1 - these codes get read off a screen and typed by hand.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
        }
    });
}

function generateCode() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let out = '';
    for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
    return 'LF40' + out;
}

function acctKey(token) { return 'disc:acct:' + token; }
function ipKey(ip) { return 'disc:ip:' + ip; }

// Matches the checkout worker's own validation so a corrupted token fails here
// rather than deeper in.
function tokenLooksValid(t) {
    return typeof t === 'string' && t.length >= 8;
}

async function lookupAccount(env, token) {
    const url = env.SUPABASE_URL
        + '/rest/v1/' + (env.ACCOUNTS_TABLE || 'linkfinderai_users')
        + '?token=eq.' + encodeURIComponent(token)
        + '&select=token,plan_type,is_unlimited,subscription_id,email';
    const r = await fetch(url, {
        headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
            Accept: 'application/json'
        }
    });
    if (!r.ok) return { ok: false, status: r.status };
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, status: 404 };
    return { ok: true, account: rows[0] };
}

// `plan_type` carries the paid tier; `is_unlimited` and a live `subscription_id`
// both mean the same thing here - money is already arriving from this account.
function isSubscriber(a) {
    if (!a) return false;
    if (a.is_unlimited === true) return true;
    if (a.subscription_id) return true;
    const p = (a.plan_type || '').toString().trim().toLowerCase();
    return p !== '' && p !== 'free' && p !== 'none';
}

async function createDodoDiscount(env, code, productIds) {
    const body = {
        // Basis points: 4000 => 40%. Dodo reads `amount` as cents for flat
        // discounts and basis points for percentage ones, so this number is
        // wrong by a factor of 100 if `type` is ever changed without it.
        type: 'percentage',
        amount: PERCENT_OFF * 100,
        code: code,
        name: 'Last-resort 40% (24h)',
        usage_limit: 1,
        expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
        restricted_to: productIds
    };
    // Absent means "applies to every recurring payment forever". One cycle is
    // the conservative default; raise DISCOUNT_SUBSCRIPTION_CYCLES deliberately,
    // knowing 40% off a $149/mo plan in perpetuity is a permanent margin cut.
    const cycles = parseInt(env.DISCOUNT_SUBSCRIPTION_CYCLES || '1', 10);
    if (Number.isFinite(cycles) && cycles >= 1) body.subscription_cycles = cycles;

    const r = await fetch(DODO_API + '/discounts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + env.DODO_API_KEY
        },
        body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, data };
    return { ok: true, data };
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        const url = new URL(request.url);
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

        let token;
        if (request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            token = body.user_token;
        } else {
            token = url.searchParams.get('user_token');
        }

        if (!tokenLooksValid(token)) {
            return json({ error: 'sign_in_required' }, 401);
        }

        // Existing code wins over everything, including the subscriber check -
        // if we already promised someone a code we honour it.
        const existingRaw = await env.DISCOUNTS.get(acctKey(token));
        if (existingRaw) {
            const existing = JSON.parse(existingRaw);
            return json({ code: existing.code, expires_at: existing.expires_at, percent_off: PERCENT_OFF, reused: true });
        }

        // GET is a pure lookup: it never mints. Only an explicit POST spends money.
        if (request.method !== 'POST') {
            return json({ code: null }, 200);
        }

        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.DODO_API_KEY) {
            return json({ error: 'not_configured' }, 503);
        }

        const productIds = (env.DISCOUNT_PRODUCT_IDS || '')
            .split(',').map(s => s.trim()).filter(Boolean);
        if (productIds.length === 0) {
            // Fail closed. An unrestricted 40% code would apply to the PAYG packs.
            return json({ error: 'not_configured', detail: 'DISCOUNT_PRODUCT_IDS is empty' }, 503);
        }

        const found = await lookupAccount(env, token);
        if (!found.ok) return json({ error: 'unknown_account' }, 403);
        if (isSubscriber(found.account)) return json({ error: 'already_subscribed' }, 409);

        if (await env.DISCOUNTS.get(ipKey(ip))) {
            return json({ error: 'already_issued_for_network' }, 429);
        }

        const code = generateCode();
        const made = await createDodoDiscount(env, code, productIds);
        if (!made.ok) {
            return json({ error: 'dodo_rejected', status: made.status }, 502);
        }

        const record = {
            code: made.data.code || code,
            expires_at: made.data.expires_at || new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
            discount_id: made.data.discount_id || null,
            issued_at: new Date().toISOString(),
            ip: ip
        };

        // Written after Dodo confirms, so a failed create never burns the
        // account's one shot. TTL matches the coupon: once it expires the
        // account becomes eligible again, which is deliberate.
        await env.DISCOUNTS.put(acctKey(token), JSON.stringify(record), { expirationTtl: TTL_SECONDS });
        await env.DISCOUNTS.put(ipKey(ip), '1', { expirationTtl: TTL_SECONDS });

        return json({ code: record.code, expires_at: record.expires_at, percent_off: PERCENT_OFF, reused: false });
    }
};
