import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

function makeKV(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
        store,
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, v); }
    };
}

const FREE = { token: 'tok_abcdefgh', plan_type: 'free', is_unlimited: false, subscription_id: null, email: 'a@b.com' };
const PAYING = { token: 'tok_abcdefgh', plan_type: 'starter', is_unlimited: false, subscription_id: 'sub_1', email: 'a@b.com' };

function makeEnv({ kv = makeKV(), account = FREE, dodoOk = true, products = 'pdt_sub_a,pdt_sub_b' } = {}) {
    const calls = { supabase: 0, dodo: 0, dodoBody: null };
    global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (String(url).includes('/rest/v1/')) {
            assert.equal(method, 'GET', 'account lookup must be a GET');
            calls.supabase++;
            return new Response(JSON.stringify(account ? [account] : []), { status: 200 });
        }
        if (String(url).includes('/discounts')) {
            assert.equal(method, 'POST', 'discount creation must be a POST');
            calls.dodo++;
            calls.dodoBody = JSON.parse(opts.body);
            if (!dodoOk) return new Response(JSON.stringify({ error: 'nope' }), { status: 422 });
            return new Response(JSON.stringify({
                code: calls.dodoBody.code,
                discount_id: 'dis_123',
                expires_at: calls.dodoBody.expires_at
            }), { status: 200 });
        }
        throw new Error('unexpected fetch: ' + url);
    };
    return {
        env: {
            DISCOUNTS: kv,
            SUPABASE_URL: 'https://db.example.com',
            SUPABASE_SERVICE_KEY: 'svc',
            DODO_API_KEY: 'dodo_key',
            DISCOUNT_PRODUCT_IDS: products
        },
        calls, kv
    };
}

function post(token = 'tok_abcdefgh', ip = '1.2.3.4') {
    return new Request('https://d.example.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ user_token: token })
    });
}

test('refuses without a usable token, and never calls Dodo', async () => {
    const { env, calls } = makeEnv();
    const r = await worker.fetch(post('short'), env);
    assert.equal(r.status, 401);
    assert.equal(calls.dodo, 0);
});

test('GET never mints - it only looks up', async () => {
    const { env, calls } = makeEnv();
    const r = await worker.fetch(new Request('https://d.example.com/?user_token=tok_abcdefgh'), env);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).code, null);
    assert.equal(calls.dodo, 0, 'a GET must never create a discount');
});

test('refuses an account that does not exist', async () => {
    const { env, calls } = makeEnv({ account: null });
    const r = await worker.fetch(post(), env);
    assert.equal(r.status, 403);
    assert.equal(calls.dodo, 0);
});

test('refuses someone who already subscribes', async () => {
    const { env, calls } = makeEnv({ account: PAYING });
    const r = await worker.fetch(post(), env);
    assert.equal(r.status, 409);
    assert.equal(calls.dodo, 0, 'never discount someone already paying');
});

test('fails closed when no products are configured', async () => {
    const { env, calls } = makeEnv({ products: '' });
    const r = await worker.fetch(post(), env);
    assert.equal(r.status, 503);
    assert.equal(calls.dodo, 0, 'an unrestricted code would discount PAYG too');
});

test('happy path: 40% in basis points, restricted to subscription products', async () => {
    const { env, calls, kv } = makeEnv();
    const r = await worker.fetch(post(), env);
    assert.equal(r.status, 200);
    const body = await r.json();

    assert.match(body.code, /^LF40[A-Z2-9]{8}$/, 'code should be readable and prefixed');
    assert.equal(body.percent_off, 40);
    assert.equal(body.reused, false);

    assert.equal(calls.dodoBody.type, 'percentage');
    assert.equal(calls.dodoBody.amount, 4000, '40% must be 4000 basis points, not 40');
    assert.equal(calls.dodoBody.usage_limit, 1);
    assert.equal(calls.dodoBody.subscription_cycles, 1);
    assert.deepEqual(calls.dodoBody.restricted_to, ['pdt_sub_a', 'pdt_sub_b']);

    const ttlHours = (new Date(calls.dodoBody.expires_at) - Date.now()) / 3600000;
    assert.ok(ttlHours > 23.9 && ttlHours <= 24, `expiry should be 24h, got ${ttlHours}`);

    assert.ok(kv.store.has('disc:acct:tok_abcdefgh'));
    assert.ok(kv.store.has('disc:ip:1.2.3.4'));
});

test('asking twice returns the same code without minting again', async () => {
    const { env, calls } = makeEnv();
    const first = await (await worker.fetch(post(), env)).json();
    const second = await (await worker.fetch(post(), env)).json();
    assert.equal(second.code, first.code);
    assert.equal(second.reused, true);
    assert.equal(calls.dodo, 1, 'the second request must not create a second discount');
});

test('a different account on the same IP is refused', async () => {
    const kv = makeKV();
    const a = makeEnv({ kv });
    await worker.fetch(post('tok_abcdefgh', '9.9.9.9'), a.env);
    const b = makeEnv({ kv });
    const r = await worker.fetch(post('tok_zzzzzzzz', '9.9.9.9'), b.env);
    assert.equal(r.status, 429);
    assert.equal(b.calls.dodo, 0);
});

test('a rejected Dodo call does not burn the account\'s one shot', async () => {
    const kv = makeKV();
    const bad = makeEnv({ kv, dodoOk: false });
    const r = await worker.fetch(post(), bad.env);
    assert.equal(r.status, 502);
    assert.equal(kv.store.size, 0, 'nothing should be recorded when Dodo refuses');

    // and the user can try again once it is working
    const good = makeEnv({ kv });
    const r2 = await worker.fetch(post(), good.env);
    assert.equal(r2.status, 200);
});

test('codes are unique across calls', async () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
        const { env } = makeEnv({ kv: makeKV() });
        const b = await (await worker.fetch(post('tok_' + i + 'aaaaaaa', '5.5.5.' + i), env)).json();
        seen.add(b.code);
    }
    assert.equal(seen.size, 40, 'every issued code must be distinct');
});
