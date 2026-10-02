// Cancel a subscription, whatever kind of id the user row holds.
//
// Why this exists: the live cancel worker (cancel-subscription.hamoureliasse
// .workers.dev, not in this repo) sends `subscription_id` straight to Dodo. On
// 2026-10-02 only 9 of 34 paying rows in linkfinderai_users held a Dodo
// subscription id. The rest could not cancel themselves:
//
//   sub_0N…  (25 chars)   Dodo subscription      -> cancel it directly
//   cus_0N…  (25 chars)   Dodo CUSTOMER id       -> list that customer's live
//                                                    subscriptions, cancel each
//   sub_01…  (30 chars)   Paddle subscription    -> Paddle API (ULID ids; Dodo
//                                                    rejects them: the
//                                                    worker_rejected of 2026-10-01)
//   anything else         test / manual / null   -> refuse, the page files a
//                                                    manual request instead
//
// The subscription is looked up from the user's token on the server, never
// taken from the browser: the old worker cancels whatever id it is sent.
//
// Cancels at the end of the billing period, which is what the account page
// promises ("access continues until the end of your billing period").
//
// Deploy and secrets: README.md in this directory.

const DODO_SUB = /^sub_0[A-Za-z0-9]{20}$/;
const DODO_CUS = /^cus_[A-Za-z0-9]{21}$/;
const PADDLE_SUB = /^sub_01[0-9a-z]{24}$/;

const CORS = {
    'Access-Control-Allow-Origin': 'https://linkfinderai.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS },
    });
}

export function classify(id) {
    if (!id) return 'missing';
    if (PADDLE_SUB.test(id)) return 'paddle_subscription';
    if (DODO_SUB.test(id)) return 'dodo_subscription';
    if (DODO_CUS.test(id)) return 'dodo_customer';
    return 'unknown';
}

async function findUser(env, token) {
    const url = `${env.SUPABASE_URL}/rest/v1/linkfinderai_users` +
        `?token=eq.${encodeURIComponent(token)}&select=email,subscription_id,customer_id&limit=1`;
    const r = await fetch(url, {
        headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
    });
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json();
    return rows[0] || null;
}

async function dodo(env, path, init = {}) {
    const r = await fetch(`${env.DODO_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${env.DODO_API_KEY}`,
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`dodo ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
}

async function cancelDodoSubscription(env, id) {
    await dodo(env, `/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ cancel_at_next_billing_date: true }),
    });
    return [id];
}

async function cancelDodoCustomer(env, customerId) {
    const list = await dodo(env, `/subscriptions?customer_id=${encodeURIComponent(customerId)}&status=active`);
    const ids = (list.items || []).map((s) => s.subscription_id).filter(Boolean);
    if (!ids.length) throw new Error('no active Dodo subscription for this customer');
    for (const id of ids) await cancelDodoSubscription(env, id);
    return ids;
}

async function cancelPaddleSubscription(env, id) {
    if (!env.PADDLE_API_KEY) throw new Error('paddle_not_configured');
    const r = await fetch(`https://api.paddle.com/subscriptions/${id}/cancel`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.PADDLE_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ effective_from: 'next_billing_period' }),
    });
    if (!r.ok) throw new Error(`paddle ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return [id];
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
        if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

        let body;
        try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'invalid_json' }, 400); }
        if (!body.token) return json({ ok: false, error: 'missing_token' }, 400);

        let user;
        try { user = await findUser(env, body.token); }
        catch (e) { return json({ ok: false, error: 'lookup_failed', detail: e.message }, 502); }
        if (!user) return json({ ok: false, error: 'unknown_token' }, 404);

        const kind = classify(user.subscription_id);
        try {
            let cancelled;
            if (kind === 'dodo_subscription') cancelled = await cancelDodoSubscription(env, user.subscription_id);
            else if (kind === 'dodo_customer') cancelled = await cancelDodoCustomer(env, user.subscription_id);
            else if (kind === 'paddle_subscription') cancelled = await cancelPaddleSubscription(env, user.subscription_id);
            else return json({ ok: false, error: 'unsupported_id', kind }, 422);
            return json({ ok: true, kind, cancelled });
        } catch (e) {
            console.error('cancel_failed', { kind, id: user.subscription_id, error: e.message });
            return json({ ok: false, error: 'provider_rejected', kind, detail: e.message }, 502);
        }
    },
};
