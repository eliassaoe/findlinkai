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
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith Acme' }), ENV);
    assert.deepEqual(await res.json(), { result: '', status: 'success' });
});

test('an upstream outage errors instead of reporting a false not-found', async () => {
    globalThis.fetch = async (url) => String(url).includes('serper.dev')
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => [{ credits: 100, protected_credits: 0 }] };
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith Acme' }), ENV);
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
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith Acme' }), ENV);
    assert.equal(res.status, 402);
});

// --- company required + extra passes (7 Nov 2026, docs/find-rate.md) ----------

const { parseRequest, hasCompany, buildQueries, cleanCompanyWords } = m;

test('a name with no company is refused, a name with one is not', () => {
    assert.equal(hasCompany(parseInput('Jane Smith')), false);
    assert.equal(hasCompany(parseInput('Jane Smith Acme')), true);
    assert.equal(hasCompany(parseInput('Jane Smith acme.com')), true);
    assert.equal(hasCompany(parseInput('John F Kennedy')), false, 'an initial makes a three-part name, not a company');
    assert.equal(hasCompany(parseInput('Ana de Souza')), false);
});

test('structured fields win over guessing', () => {
    const p = parseRequest({ first_name: 'Jean Pierre', last_name: 'Dupont', company: 'Acme Corp' });
    assert.deepEqual(p.nameTokens, ['jean', 'pierre', 'dupont']);
    assert.deepEqual(p.companyWords, ['acme', 'corp']);
    assert.equal(parseRequest({ input_data: 'Jane Smith', company: 'Acme' }).companyWords[0], 'acme');
    assert.equal(parseRequest({ first_name: 'Jane', last_name: 'Smith', company: 'acme.com' }).domain, 'acme.com');
});

test('the first query is unchanged, then two more shapes, no duplicates', () => {
    const p = parseInput('Alicia Carrasco Turning Point Brands Inc');
    const qs = buildQueries(p);
    assert.equal(qs[0], buildQuery(p));
    assert.ok(qs.some(q => q === '"alicia carrasco" "turning point brands" linkedin'));
    assert.ok(qs.some(q => q === 'alicia carrasco turning site:linkedin.com/in'));
    assert.equal(new Set(qs).size, qs.length);
    assert.ok(qs.length <= 3);
});

test('legal suffixes and country codes leave the company, its first word never does', () => {
    assert.deepEqual(cleanCompanyWords(['eviden', 'austria', 'gmbh', 'at']), ['eviden', 'austria']);
    assert.deepEqual(cleanCompanyWords(['us', 'foods']), ['us', 'foods']);
});

test('a name with no company is refused with 422 and not charged', async () => {
    const calls = withStubs({ organic: [hit('Jane Smith - Acme', PROFILE)] });
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Jane Smith' }), ENV);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'company_required');
    assert.equal(calls.filter(c => c[0] === 'PATCH').length, 0, 'must not charge');
});

test('a miss on the first query tries the next shapes before giving up', async () => {
    let serperCalls = 0;
    globalThis.fetch = async (url, init) => {
        if (String(url).includes('serper.dev')) {
            serperCalls++;
            const organic = serperCalls === 2 ? [hit('Alicia Carrasco - Turning Point Brands', PROFILE)] : [];
            return { ok: true, status: 200, json: async () => ({ organic }) };
        }
        return { ok: true, status: 200, json: async () => [{ credits: 100, protected_credits: 0, token: 'x' }] };
    };
    const res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Alicia Carrasco Turning Point Brands Inc' }), ENV);
    assert.equal((await res.json()).result, PROFILE);
    assert.equal(serperCalls, 2, 'stops at the first confident match');
});

// --- LinkedIn people search as the last resort (Apify) ------------------------

const { pickFromLinkedInSearch, splitName } = m;
const row = (name, position, linkedinUrl) => ({ name, position, linkedinUrl });

test('accepts a LinkedIn search row only when its headline names the company', () => {
    const p = parseInput('Alicia Carrasco Turning Point Brands Inc');
    const rows = [
        row('Alicia Carrasco', 'Associate Chief of Staff for Primary Care', 'https://www.linkedin.com/in/alicia-carrasco-a8948931'),
        row('Alicia C.', 'SVP, Chief People & Enablement Officer at Turning Point Brands (NYSE:TPB)', 'https://www.linkedin.com/in/alicia-carrasco')
    ];
    assert.equal(pickFromLinkedInSearch(p, rows).link, 'https://www.linkedin.com/in/alicia-carrasco');
});

test('a lone result at another company is not accepted', () => {
    const p = parseInput('Brent Hanston A. Duda & Sons, Inc.');
    const rows = [row('Brent Hanston', 'Chief Financial Officer at Gerawan Farming Partners Inc.', 'https://www.linkedin.com/in/brent-hanston-89024440')];
    assert.equal(pickFromLinkedInSearch(p, rows), null);
});

test('generic company words never make a match on their own', () => {
    const p = parseInput('Katie Jones JM Family Enterprises, Inc.');
    const rows = [row('Katie Jones', 'Head of Family Office at Smith Enterprises', 'https://www.linkedin.com/in/kj')];
    assert.equal(pickFromLinkedInSearch(p, rows), null);
});

test('it is only asked after every Google pass missed, and only with a token', async () => {
    let serperCalls = 0, apifyCalls = 0;
    globalThis.fetch = async (url) => {
        const u = String(url);
        if (u.includes('serper.dev')) { serperCalls++; return { ok: true, status: 200, json: async () => ({ organic: [] }) }; }
        if (u.includes('api.apify.com')) {
            apifyCalls++;
            return { ok: true, status: 200, json: async () => [row('Alicia W.', 'Co-Founder & CFO, ANA, Inc.', 'https://www.linkedin.com/in/aliciawaineo')] };
        }
        return { ok: true, status: 200, json: async () => [{ credits: 100, protected_credits: 0, token: 'x' }] };
    };
    let res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Alicia Waineo ANA, Inc' }), { ...ENV, APIFY_TOKEN: 't' });
    assert.equal((await res.json()).result, 'https://www.linkedin.com/in/aliciawaineo');
    assert.equal(apifyCalls, 1);
    assert.ok(serperCalls >= 2);
    res = await m.default.fetch(post({ user_token: 'tok-12345678', input_data: 'Alicia Waineo ANA, Inc' }), { ...ENV, APIFY_TOKEN: '' });
    assert.equal((await res.json()).result, '');
    assert.equal(apifyCalls, 1, 'no token, no call');
});

test('first name, then the rest as the last name', () => {
    assert.deepEqual(splitName(parseInput('Martha Yolanda Diaz acme.com')), { firstName: 'martha', lastName: 'yolanda diaz' });
});

// --- called from n8n: n8n charges, the worker must not ------------------------

const postFromN8n = (body, key) => new Request('https://w.test/', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Worker-Key': key }, body: JSON.stringify(body)
});

test('with the right shared secret it returns the result and never charges', async () => {
    const calls = withStubs({ organic: [hit('Jane Smith - Acme', PROFILE)] });
    const res = await m.default.fetch(postFromN8n({ input_data: 'Jane Smith Acme' }, 's3cret'), { ...ENV, N8N_SHARED_SECRET: 's3cret' });
    const out = await res.json();
    assert.equal(out.result, PROFILE);
    assert.equal(out.status, 'success');
    assert.equal(calls.filter(c => c[0] === 'PATCH').length, 0, 'n8n charges, not the worker');
});

test('a wrong or missing secret falls back to the normal paid path', async () => {
    withStubs({ organic: [hit('Jane Smith - Acme', PROFILE)] });
    let res = await m.default.fetch(postFromN8n({ input_data: 'Jane Smith Acme' }, 'guess'), { ...ENV, N8N_SHARED_SECRET: 's3cret' });
    assert.equal(res.status, 401, 'no token, wrong secret: refused');
    res = await m.default.fetch(postFromN8n({ input_data: 'Jane Smith Acme' }, 's3cret'), { ...ENV });
    assert.equal(res.status, 401, 'secret not configured: the header means nothing');
});

test('company_required still comes back from the n8n path, free', async () => {
    withStubs({ organic: [] });
    const res = await m.default.fetch(postFromN8n({ input_data: 'Jane Smith' }, 's3cret'), { ...ENV, N8N_SHARED_SECRET: 's3cret' });
    assert.equal(res.status, 422);
});
