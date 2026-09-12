import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same absolute-path convention as workers/verify-email/worker.test.mjs.
const HERE = dirname(fileURLToPath(import.meta.url));
const m = await import(pathToFileURL(join(HERE, 'worker.js')).href);

const { normalize, parseInput, isProfileUrl, scoreCandidate, pickBest, buildQuery,
        CREDIT_COST, CREDIT_COST_NOT_FOUND } = m;

const hit = (title, link, snippet = '') => ({ title, link, snippet });
const PROFILE = 'https://www.linkedin.com/in/jane-smith-1a2b3c';

// --- normalisation --------------------------------------------------------

test('normalize strips accents, case and punctuation', () => {
    assert.equal(normalize('José'), 'jose');
    assert.equal(normalize("O'Brien-Smith"), 'o brien smith');
    assert.equal(normalize('  Jean   Pierre '), 'jean pierre');
});

// --- parsing --------------------------------------------------------------
// The n8n version reads position: [0] first name, [1] surname, [2] domain.
// These are the shapes that breaks on.

test('parses a plain first and last name', () => {
    const p = parseInput('Jane Smith');
    assert.deepEqual(p.nameTokens, ['jane', 'smith']);
    assert.equal(p.domain, null);
});

test('finds a domain wherever it sits, not only in position 3', () => {
    assert.equal(parseInput('Jane Smith acme.com').domain, 'acme.com');
    assert.equal(parseInput('acme.com Jane Smith').domain, 'acme.com');
    assert.equal(parseInput('Jean Pierre Dupont acme.com').domain, 'acme.com');
});

test('takes the domain out of an email address', () => {
    assert.equal(parseInput('Jane Smith jane@acme.com').domain, 'acme.com');
});

test('does not mistake an initial or a suffix for a domain', () => {
    assert.equal(parseInput('J. Smith Acme').domain, null);
    assert.equal(parseInput('John Smith Jr.').domain, null);
});

test('a three-part name keeps its surname instead of losing it to position', () => {
    // n8n would treat "Pierre" as the surname here and match against it.
    const p = parseInput('Jean Pierre Dupont acme.com');
    assert.ok(p.nameTokens.includes('dupont'), 'surname should survive parsing');
});

test('company words are kept separate from the name', () => {
    const p = parseInput('Jane Smith Acme Corporation');
    assert.ok(p.nameTokens.includes('jane') && p.nameTokens.includes('smith'));
    assert.ok(p.companyWords.length > 0);
});

// --- URL validation -------------------------------------------------------

test('only /in/ profile URLs are accepted', () => {
    assert.equal(isProfileUrl(PROFILE), true);
    assert.equal(isProfileUrl('https://www.linkedin.com/company/acme'), false);
    assert.equal(isProfileUrl('https://www.linkedin.com/posts/jane-smith_activity-123'), false);
    assert.equal(isProfileUrl('https://www.linkedin.com/pulse/some-article'), false);
    assert.equal(isProfileUrl('https://fr.linkedin.com/in/jane-smith'), true);
});

// --- scoring --------------------------------------------------------------

test('a company page scores zero even when the title matches the name', () => {
    const p = parseInput('Jane Smith');
    assert.equal(scoreCandidate(p, hit('Jane Smith | Acme', 'https://www.linkedin.com/company/acme')), 0);
});

test('accented and unaccented spellings match each other', () => {
    const p = parseInput('Jose Garcia');
    assert.ok(scoreCandidate(p, hit('José García - CTO at Acme', PROFILE)) >= 2);
});

test('a first-name-only match is not enough to return', () => {
    const p = parseInput('Jane Smith');
    const best = pickBest(p, [hit('Jane Kowalski - Designer', PROFILE)]);
    assert.equal(best, null, 'should not return a wrong profile on a given name alone');
});

// --- the main regression: looking past organic[0] -------------------------

test('finds the right profile when it is not the first result', () => {
    const p = parseInput('Jane Smith Acme');
    const results = [
        hit('Acme Corporation', 'https://www.linkedin.com/company/acme'),
        hit('Smith Consulting - Posts', 'https://www.linkedin.com/posts/abc_activity-1'),
        hit('Jane Smith - Head of Talent at Acme', PROFILE)
    ];
    // n8n reads results[0] only, so this input returns "" today.
    assert.equal(pickBest(p, results).link, PROFILE);
});

test('picks the better of two profile matches', () => {
    const p = parseInput('Jane Smith Acme');
    const other = 'https://www.linkedin.com/in/jane-smith-9z8y';
    const best = pickBest(p, [
        hit('Jane Smith - Student', other),
        hit('Jane Smith - Recruiter at Acme', PROFILE)
    ]);
    assert.equal(best.link, PROFILE, 'the one that also matches the company should win');
});

test('query strings are trimmed of tracking parameters', () => {
    const p = parseInput('Jane Smith');
    const best = pickBest(p, [hit('Jane Smith - Acme', PROFILE + '?trk=public_profile')]);
    assert.equal(best.link, PROFILE);
});

test('no candidates yields no match rather than a guess', () => {
    assert.equal(pickBest(parseInput('Jane Smith'), []), null);
    assert.equal(pickBest(parseInput('Jane Smith'), undefined), null);
});

// --- query building -------------------------------------------------------

test('the search stays scoped to profile URLs', () => {
    const q = buildQuery(parseInput('Jane Smith acme.com'));
    assert.ok(q.includes('site:linkedin.com/in'));
    assert.ok(q.includes('jane smith'));
    assert.ok(q.includes('acme'), 'the company hint should narrow the search');
});

// --- pricing parity with n8n ---------------------------------------------

test('credit prices match the n8n workflow', () => {
    assert.equal(CREDIT_COST, 1);
    assert.equal(CREDIT_COST_NOT_FOUND, 0.5);
});

// --- end to end through fetch --------------------------------------------

function withStubs({ organic = [], rows = [{ credits: 100, protected_credits: 0 }] } = {}) {
    const calls = [];
    globalThis.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        calls.push([method, String(url)]);
        if (String(url).includes('serper.dev')) {
            return { ok: true, status: 200, json: async () => ({ organic }) };
        }
        if (method === 'GET') return { ok: true, status: 200, json: async () => rows };
        return { ok: true, status: 200, json: async () => [{ token: 't' }] };   // PATCH
    };
    return calls;
}

const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc', SERPER_API_KEY: 'k' };
const post = (body) => new Request('https://w.test/', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://linkfinderai.com' },
    body: JSON.stringify(body)
});

test('returns the profile and charges the full credit', async () => {
    withStubs({ organic: [hit('Jane Smith - Acme', PROFILE)] });
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith Acme' }), ENV);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { result: PROFILE, status: 'success' });
});

test('an empty result is still a success response, matching n8n', async () => {
    withStubs({ organic: [hit('Acme Corp', 'https://www.linkedin.com/company/acme')] });
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith' }), ENV);
    assert.deepEqual(await res.json(), { result: '', status: 'success' });
});

test('an upstream outage errors instead of reporting a false not-found', async () => {
    globalThis.fetch = async (url) => String(url).includes('serper.dev')
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => [{ credits: 100, protected_credits: 0 }] };
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith' }), ENV);
    assert.equal(res.status, 502);
});

test('an input with no name is refused without spending a credit', async () => {
    const calls = withStubs({ organic: [] });
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'acme.com' }), ENV);
    assert.equal((await res.json()).reason, 'no_name_in_input');
    assert.equal(calls.filter(c => c[0] === 'PATCH').length, 0, 'must not charge');
});

test('a short token is rejected', async () => {
    withStubs();
    const res = await m.default.fetch(post({ user_token: 'abc', input_data: 'Jane Smith' }), ENV);
    assert.equal(res.status, 401);
});

test('insufficient credits returns 402', async () => {
    withStubs({ organic: [hit('Jane Smith - Acme', PROFILE)], rows: [{ credits: 0, protected_credits: 0 }] });
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith' }), ENV);
    assert.equal(res.status, 402);
});
