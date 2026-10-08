/**
 * API lookups in History and in "What you've found".
 *
 * Both pages read enrichment_history. A lookup made through the public API
 * used to leave no row there, so it never appeared in History and never
 * counted on the account page. workers/api-history/record.js is what the API
 * worker calls to fix that; these tests pin the ways it could go wrong:
 *
 *   1. Writing a row under the wrong account (the API key -> token mapping).
 *   2. Writing a row for a pending async job, then another when it finishes.
 *   3. A Supabase failure leaking into the customer's API response.
 *   4. The recording RPC being callable from a browser.
 *
 * Run: node --test tests/api-history.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const m = await import(pathToFileURL(join(REPO, 'workers/api-history/record.js')).href);

// app.html / api-access.html build the key exactly like this.
function transformerToken(t){let r='';for(let i=0;i<t.length;i++){let c=t.charCodeAt(i);c+=7;r+=c.toString(16).padStart(2,'0')+'Z';}return r.slice(0,-1);}

const TOKEN = 'tok_9f8e7d6c5b4a';
const KEY = transformerToken(TOKEN);
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'service' };

function kv() {
    const store = new Map();
    return {
        store,
        async get(k) { return store.has(k) ? store.get(k) : null; },
        async put(k, v) { store.set(k, v); },
        async delete(k) { store.delete(k); },
    };
}
function recorder(ok = true) {
    const calls = [];
    const f = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), headers: init.headers }); return { ok }; };
    f.calls = calls;
    return f;
}

test('the API key maps back to the same token the app writes as user_id', () => {
    assert.equal(m.tokenFromApiKey(KEY), TOKEN);
    assert.equal(m.tokenFromApiKey(`Bearer ${KEY}`), TOKEN);
    assert.equal(m.tokenFromApiKey(''), null);
    assert.equal(m.tokenFromApiKey('not-a-key'), null);
});

test('a synchronous 2xx is recorded once, with type, input and credits', async () => {
    const f = recorder();
    const ok = await m.recordApiCall(ENV, {
        apiKey: KEY, pathname: '/', status: 200,
        body: { type: 'linkedin_profile_to_email', input_data: 'https://linkedin.com/in/jane' },
        payload: { result: 'jane@acme.com' },
    }, f);
    assert.equal(ok, true);
    assert.equal(f.calls.length, 1);
    assert.match(f.calls[0].url, /\/rest\/v1\/rpc\/record_api_enrichment$/);
    assert.deepEqual(f.calls[0].body, {
        p_user_id: TOKEN, p_type: 'linkedin_profile_to_email',
        p_input: 'https://linkedin.com/in/jane', p_result: { result: 'jane@acme.com' }, p_credits_used: 10,
    });
    assert.equal(f.calls[0].headers.Authorization, 'Bearer service');
});

test('legacy /v1/<type> paths still resolve a type', async () => {
    assert.equal(m.typeFrom({}, '/v1/company-domain-to-employees'), 'company_domain_to_employees');
    assert.equal(m.typeFrom({}, '/email_to_linkedin_url'), 'email_to_linkedin_url');
    assert.equal(m.typeFrom({ type: 'company_name_to_website' }, '/v1/anything'), 'company_name_to_website');
});

test('errors, refusals and credit walls are not history', async () => {
    const f = recorder();
    for (const [status, payload] of [[401, { message: 'bad key' }], [402, {}], [403, { code: 403 }], [500, null], [200, { status: 'error', message: 'x' }]]) {
        assert.equal(await m.recordApiCall(ENV, { apiKey: KEY, body: { type: 'company_name_to_website', input_data: 'Tesla' }, status, payload }, f), false);
    }
    assert.equal(f.calls.length, 0);
});

test('an async job is parked on 202 and recorded exactly once when it is done', async () => {
    const env = { ...ENV, API_JOBS: kv() };
    const f = recorder();
    const body = { type: 'linkedin_profile_to_linkedin_info', input_data: 'https://linkedin.com/in/jane' };

    assert.equal(await m.recordApiCall(env, { apiKey: KEY, body, status: 202, payload: { status: 'processing', job_id: 'j1' } }, f), false);
    assert.equal(f.calls.length, 0, 'nothing written while pending');

    assert.equal(await m.recordJobResult(env, { jobId: 'j1', status: 200, payload: { status: 'processing' } }, f), false);
    assert.equal(await m.recordJobResult(env, { jobId: 'j1', status: 200, payload: { status: 'done', result: { name: 'Jane Smith' } } }, f), true);
    assert.equal(await m.recordJobResult(env, { jobId: 'j1', status: 200, payload: { status: 'done', result: { name: 'Jane Smith' } } }, f), false);

    assert.equal(f.calls.length, 1, 'a re-poll must not add a second row');
    assert.deepEqual(f.calls[0].body, {
        p_user_id: TOKEN, p_type: 'linkedin_profile_to_linkedin_info', p_input: 'https://linkedin.com/in/jane',
        p_result: { name: 'Jane Smith' }, p_credits_used: 10,
    });
});

test('employee lists are charged per employee, like the app', () => {
    assert.equal(m.creditsFor('company_domain_to_employees', new Array(7).fill({ name: 'a' })), 4);
    assert.equal(m.creditsFor('linkedin_post_to_reactions', new Array(3).fill({})), 3);
});

test('a Supabase failure never throws into the API response', async () => {
    const boom = async () => { throw new Error('down'); };
    assert.equal(await m.recordApiCall(ENV, { apiKey: KEY, body: { type: 'company_name_to_website', input_data: 'Tesla' }, status: 200, payload: { result: 'tesla.com' } }, boom), false);
    assert.equal(await m.recordApiCall({}, { apiKey: KEY, body: { type: 'x' }, status: 200, payload: {} }), false);
});

test('credit costs match app.html creditCosts', () => {
    const app = readFileSync(join(REPO, 'app.html'), 'utf8');
    const line = app.match(/const creditCosts=(\{[^;]*\});/);
    assert.ok(line, 'app.html no longer defines creditCosts on one line');
    const appCosts = vm.runInNewContext(`(${line[1]})`);
    assert.deepEqual({ ...m.CREDIT_COSTS }, { ...appCosts });
});

test('the recording RPC is service-role only and never duplicates a pipeline row', () => {
    const sql = readFileSync(join(REPO, 'supabase/migrations/20261008120000_api_calls_in_history.sql'), 'utf8');
    assert.match(sql, /add column if not exists source text not null default 'app'/);
    assert.match(sql, /revoke all on function public\.record_api_enrichment[^;]*from public, anon, authenticated;/);
    assert.match(sql, /grant execute on function public\.record_api_enrichment[^;]*to service_role;/);
    assert.doesNotMatch(sql, /grant execute on function public\.record_api_enrichment[^;]*\banon\b/);
    assert.match(sql, /interval '2 minutes'/);
    assert.match(sql, /update public\.enrichment_history set source = 'api'/);
});

test('History shows the API badge, filters by source and exports it', () => {
    const page = readFileSync(join(REPO, 'history.html'), 'utf8');
    const start = page.indexOf('function isApiItem(');
    assert.ok(start > 0, 'history.html no longer defines isApiItem');
    const fn = vm.runInNewContext(`(${page.slice(start, page.indexOf('\n}', start) + 2)})`);
    assert.equal(fn({ source: 'api' }), true);
    assert.equal(fn({ source: 'app' }), false);
    assert.equal(fn({}), false, 'rows from before the column are app rows');

    assert.match(page, /id="sourceFilter"/);
    assert.match(page, /badge-api/);
    assert.match(page, /baseHeaders = \['Timestamp', 'Type', 'Source', 'Input', 'Credits Used'\]/);
});
