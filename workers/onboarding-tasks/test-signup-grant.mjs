// Tests for the /100free signup grant.
//   node workers/onboarding-tasks/test-signup-grant.mjs
//
// Supabase and PostHog are replaced by an in-memory fake fetch, so this runs
// anywhere. What it checks is the contract, not the wire format: one grant per
// account, the same ledger row and RPC as a G2 payout, a failed credit leaves
// no ledger row behind, and the route cannot be reached without the key or
// through /tasks/complete.
import { handleSignupGrant, handleComplete, pickUtm } from './worker.js';

let pass = 0, fail = 0;
function is(label, actual, expected) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  pass  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const KEY = 'test-signup-grant-key';
const env = {
    SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    SIGNUP_GRANT_KEY: KEY,
    POSTHOG_API_KEY: 'phc_test',
};

// ---------------------------------------------------------------------------
// A tiny PostgREST: linkfinderai_users keyed by token, user_task_completions
// with the same unique index as schema.sql, and the increment RPC.
// ---------------------------------------------------------------------------
function makeDb() {
    const db = {
        users: new Map([['tok_alice', { token: 'tok_alice', credits: 50 }]]),
        completions: [],
        posthog: [],
        patches: [],
        failCredit: false,
    };
    db.fetch = async (url, options = {}) => {
        const u = new URL(url);
        const method = options.method || 'GET';
        const body = options.body ? JSON.parse(options.body) : null;
        const respond = (data, status = 200) =>
            new Response(status === 204 ? null : JSON.stringify(data), { status });

        if (u.hostname.endsWith('posthog.com')) { db.posthog.push(body); return respond({ status: 1 }); }

        const path = u.pathname.replace('/rest/v1/', '');
        const token = u.searchParams.get('token');
        const uid = u.searchParams.get('user_id');
        const task = u.searchParams.get('task_name');
        const unwrap = (v) => v && decodeURIComponent(v.replace(/^eq\./, ''));

        if (path === 'linkfinderai_users' && method === 'GET') {
            const row = db.users.get(unwrap(token));
            return respond(row ? [{ token: row.token }] : []);
        }
        if (path === 'linkfinderai_users' && method === 'PATCH') {
            db.patches.push({ token: unwrap(token), ...body });
            return respond(null, 204);
        }
        if (path === 'rpc/increment_user_credits' && method === 'POST') {
            if (db.failCredit) return respond({ message: 'boom' }, 500);
            const row = db.users.get(body.p_token);
            if (!row) return respond(null);
            row.credits += body.p_amount;
            return respond(row.credits);
        }
        if (path === 'user_task_completions' && method === 'GET') {
            return respond(db.completions.filter((r) => r.user_id === unwrap(uid) && r.task_name === unwrap(task)));
        }
        if (path === 'user_task_completions' && method === 'POST') {
            if (db.completions.some((r) => r.user_id === body.user_id && r.task_name === body.task_name)) {
                return respond({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
            }
            db.completions.push({ id: db.completions.length + 1, ...body });
            return respond([body]);
        }
        if (path === 'user_task_completions' && method === 'DELETE') {
            db.completions = db.completions.filter((r) => !(r.user_id === unwrap(uid) && r.task_name === unwrap(task)));
            return respond(null, 204);
        }
        return respond({ error: `unhandled ${method} ${path}` }, 500);
    };
    return db;
}

const post = (body) => new Request('https://tasks.example/tasks/signup-grant', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const grant = async (db, body) => {
    globalThis.fetch = db.fetch;
    const res = await handleSignupGrant(post(body), env);
    return { status: res.status, body: await res.json() };
};

console.log('\npickUtm keeps only the five utm_* fields');
is('unknown keys dropped', pickUtm({ utm_source: 'g2', evil: 'x', token: 'y' }), { utm_source: 'g2' });
is('non-strings dropped', pickUtm({ utm_source: 42, utm_medium: null }), {});
is('values trimmed and capped', pickUtm({ utm_campaign: '  ' + 'a'.repeat(300) }).utm_campaign.length, 200);
is('non-object is empty', pickUtm('utm_source=x'), {});

console.log('\nThe route is closed without the key');
{
    const db = makeDb();
    is('missing key -> 401', (await grant(db, { user_token: 'tok_alice', task_name: 'signup_100free' })).status, 401);
    is('wrong key -> 401', (await grant(db, { key: 'nope', user_token: 'tok_alice', task_name: 'signup_100free' })).status, 401);
    is('nothing credited', db.users.get('tok_alice').credits, 50);
    is('no ledger row', db.completions.length, 0);
}

console.log('\nOnly signup_grant tasks can be paid here');
{
    const db = makeDb();
    is('g2_review refused', (await grant(db, { key: KEY, user_token: 'tok_alice', task_name: 'g2_review' })).status, 400);
    is('unknown task refused', (await grant(db, { key: KEY, user_token: 'tok_alice', task_name: 'nope' })).status, 400);
    is('unknown token -> 401', (await grant(db, { key: KEY, user_token: 'tok_nobody', task_name: 'signup_100free' })).status, 401);
}

console.log('\nA first grant pays 1,000 through the same ledger + RPC as G2');
{
    const db = makeDb();
    const r = await grant(db, {
        key: KEY, user_token: 'tok_alice', task_name: 'signup_100free',
        attribution: { utm_source: 'linkedin', utm_campaign: 'sept', ignored: 'x' },
    });
    is('200', r.status, 200);
    is('credits_awarded', r.body.credits_awarded, 1000);
    is('balance = base 50 + 1000', r.body.credits_balance, 1050);
    is('balance persisted', db.users.get('tok_alice').credits, 1050);
    is('one ledger row', db.completions.length, 1);
    is('ledger row shape', {
        user_id: db.completions[0].user_id, task_name: db.completions[0].task_name,
        status: db.completions[0].status, credits: db.completions[0].credits,
    }, { user_id: 'tok_alice', task_name: 'signup_100free', status: 'completed', credits: 1000 });
    is('ledger payload carries landing + utm', db.completions[0].payload, { landing: '/100free', utm_source: 'linkedin', utm_campaign: 'sept' });
    is('user row patched with attribution', db.patches, [{ token: 'tok_alice', signup_landing: '/100free', utm_source: 'linkedin', utm_campaign: 'sept' }]);
    is('one PostHog event', db.posthog.length, 1);
    is('event name', db.posthog[0].event, 'signup_credits_granted');
    is('event distinct_id is the token', db.posthog[0].distinct_id, 'tok_alice');
    is('event properties', db.posthog[0].properties, {
        task_name: 'signup_100free', credits_awarded: 1000, credits_balance: 1050,
        landing_page: '/100free', utm_source: 'linkedin', utm_campaign: 'sept',
    });

    console.log('\nA second call for the same account pays nothing');
    const again = await grant(db, { key: KEY, user_token: 'tok_alice', task_name: 'signup_100free' });
    is('409', again.status, 409);
    is('balance unchanged', db.users.get('tok_alice').credits, 1050);
    is('still one ledger row', db.completions.length, 1);
    is('no second PostHog event', db.posthog.length, 1);
}

console.log('\nA race that loses on the unique index is a 409, not a double payout');
{
    const db = makeDb();
    // Pre-existing row that the "already completed?" read does not see: simulate
    // by making the GET lie once, so the insert is what catches it.
    db.completions.push({ id: 1, user_id: 'tok_alice', task_name: 'signup_100free', status: 'completed', credits: 1000 });
    const realFetch = db.fetch;
    let lied = false;
    db.fetch = async (url, options) => {
        if (!lied && String(url).includes('user_task_completions') && (!options.method || options.method === 'GET')) {
            lied = true; return new Response('[]', { status: 200 });
        }
        return realFetch(url, options);
    };
    const r = await grant(db, { key: KEY, user_token: 'tok_alice', task_name: 'signup_100free' });
    is('409 from the insert', r.status, 409);
    is('balance unchanged', db.users.get('tok_alice').credits, 50);
}

console.log('\nA failed credit rolls the ledger row back so it can be retried');
{
    const db = makeDb();
    db.failCredit = true;
    const r = await grant(db, { key: KEY, user_token: 'tok_alice', task_name: 'signup_100free' });
    is('500', r.status, 500);
    is('no ledger row left', db.completions.length, 0);
    is('no PostHog event', db.posthog.length, 0);
    db.failCredit = false;
    const retry = await grant(db, { key: KEY, user_token: 'tok_alice', task_name: 'signup_100free' });
    is('retry succeeds', retry.status, 200);
    is('retry balance', db.users.get('tok_alice').credits, 1050);
}

console.log('\n/tasks/complete refuses the signup grant even with a valid token');
{
    const db = makeDb();
    globalThis.fetch = db.fetch;
    const res = await handleComplete(new Request('https://tasks.example/tasks/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_token: 'tok_alice', task_name: 'signup_100free' }),
    }), env);
    is('400', res.status, 400);
    is('nothing credited', db.users.get('tok_alice').credits, 50);
    is('no ledger row', db.completions.length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
