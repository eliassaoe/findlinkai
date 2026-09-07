// Runtime test for the /100free signup route.
//   node workers/signup/worker.test.mjs
//
// n8n and the onboarding-tasks worker are replaced by a fake fetch. Checks that
// the bonus is requested only on /100free, only after n8n has returned a token,
// with the utm fields whitelisted, and that a failed grant never fails the
// signup itself.
import worker from './worker.js';

let pass = 0, fail = 0;
function is(label, actual, expected) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  pass  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const quiet = { log() {}, warn() {}, error() {} };
const realConsole = globalThis.console;

function harness({ n8n = { status: 200, body: { token: 'tok_new' } }, grant = { status: 200, body: { credits_awarded: 1000, credits_balance: 1050 } }, grantThrows = 0 } = {}) {
    const calls = { n8n: [], grant: [] };
    let throwsLeft = grantThrows;
    globalThis.fetch = async (url, options) => {
        const u = String(url);
        if (u.includes('/tasks/signup-grant')) {
            calls.grant.push(JSON.parse(options.body));
            if (throwsLeft-- > 0) throw new Error('network');
            return new Response(JSON.stringify(grant.body), { status: grant.status });
        }
        calls.n8n.push(JSON.parse(options.body));
        return new Response(typeof n8n.body === 'string' ? n8n.body : JSON.stringify(n8n.body), { status: n8n.status });
    };
    return calls;
}

async function signup(path, body, env = { SIGNUP_GRANT_KEY: 'k' }) {
    globalThis.console = quiet;
    try {
        const req = new Request(`https://signup.example${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-IPCountry': 'FR' },
            body: JSON.stringify(body),
        });
        const res = await worker.fetch(req, env, {});
        const text = await res.text();
        let json = null; try { json = JSON.parse(text); } catch (e) {}
        return { status: res.status, json, text };
    } finally {
        globalThis.console = realConsole;
    }
}

const account = { email: 'jane@acme-corp.com', password: 'pw123456', type: 'signup', utm: { utm_source: 'linkedin', utm_campaign: 'sept', junk: 'x' } };

console.log('\nThe plain route never asks for a bonus');
{
    const calls = harness();
    const r = await signup('/', account);
    is('200', r.status, 200);
    is('token passed through', r.json.token, 'tok_new');
    is('no signup_grant field', 'signup_grant' in r.json, false);
    is('no grant call', calls.grant.length, 0);
    is('utm forwarded to n8n, whitelisted', { s: calls.n8n[0].utm_source, c: calls.n8n[0].utm_campaign, j: calls.n8n[0].junk }, { s: 'linkedin', c: 'sept', j: undefined });
    is('landing null on plain route', calls.n8n[0].signupLanding, null);
}

console.log('\n/100free grants after n8n returns a token');
{
    const calls = harness();
    const r = await signup('/100free', account);
    is('200', r.status, 200);
    is('token still passed through', r.json.token, 'tok_new');
    is('signup_grant merged into the answer', r.json.signup_grant, { task_name: 'signup_100free', credits_awarded: 1000, credits_balance: 1050 });
    is('exactly one grant call', calls.grant.length, 1);
    is('grant body', calls.grant[0], { key: 'k', user_token: 'tok_new', task_name: 'signup_100free', attribution: { utm_source: 'linkedin', utm_campaign: 'sept' } });
    is('landing forwarded to n8n', calls.n8n[0].signupLanding, '/100free');
    is('starting credits unchanged', calls.n8n[0].startingCredits, 50);
}

console.log('\nA failed grant does not fail the signup');
{
    const calls = harness({ grant: { status: 500, body: { error: 'Could not credit account' } } });
    const r = await signup('/100free', account);
    is('still 200', r.status, 200);
    is('token still there', r.json.token, 'tok_new');
    is('failure reported', r.json.signup_grant, { error: 'Could not credit account', status: 500 });
    is('no retry on a definite answer', calls.grant.length, 1);
}
{
    const calls = harness({ grantThrows: 1 });
    const r = await signup('/100free', account);
    is('one retry after a network failure', calls.grant.length, 2);
    is('then succeeds', r.json.signup_grant.credits_awarded, 1000);
}
{
    const calls = harness({ grantThrows: 2 });
    const r = await signup('/100free', account);
    is('two failures -> unreachable', r.json.signup_grant, { error: 'grant_unreachable' });
    is('signup still 200', r.status, 200);
}

console.log('\nNo token from n8n, no grant');
{
    const calls = harness({ n8n: { status: 200, body: { ok: true } } });
    const r = await signup('/100free', account);
    is('no grant call', calls.grant.length, 0);
    is('reported as no_token', r.json.signup_grant, { error: 'no_token' });
}
{
    const calls = harness({ n8n: { status: 409, body: { error: 'already registered' } } });
    const r = await signup('/100free', account);
    is('n8n error passed through', r.status, 409);
    is('no grant call on n8n failure', calls.grant.length, 0);
}
{
    const calls = harness({ n8n: { status: 200, body: 'not json' } });
    const r = await signup('/100free', account);
    is('non-JSON n8n answer passed through untouched', r.text, 'not json');
    is('no grant call', calls.grant.length, 0);
}

console.log('\nMissing secret means no grant, loudly, but the signup still works');
{
    const calls = harness();
    const r = await signup('/100free', account, {});
    is('200', r.status, 200);
    is('grant_not_configured', r.json.signup_grant, { error: 'grant_not_configured' });
    is('no grant call', calls.grant.length, 0);
}

console.log('\nThe existing rules still apply on /100free');
{
    const calls = harness();
    const r = await signup('/100free', { ...account, email: 'someone@yahoo.com' });
    is('consumer domain blocked', r.status, 400);
    is('code', r.json.code, 'business_email_required');
    is('nothing sent to n8n', calls.n8n.length, 0);
}
{
    const calls = harness();
    const r = await signup('/100free', { ...account, email: 'someone@gmail.com' });
    is('gmail routed to Google', r.json.code, 'use_google_signin');
}
{
    const calls = harness();
    const r = await signup('/100free', { ...account, email: 'someone@gmail.com', provider: 'google' });
    is('Google signup on /100free is granted too', r.json.signup_grant.credits_awarded, 1000);
    is('provider forwarded', calls.n8n[0].provider, 'google');
}
{
    const r = await signup('/promo', account);
    is('unknown path is 404', r.status, 404);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
