/**
 * Tests for the Chrome extension.
 *
 * Three jobs: that the generated operation list still agrees with the catalog and
 * the spec, that the manifest stays minimal (permission creep is what gets an
 * extension pulled from the store), and that the API client handles every
 * documented response — including the two that cost money quietly: a null result
 * that is still billed, and per-employee billing.
 */
import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = dirname(HERE);
const ROOT = dirname(EXT);
const REPO = dirname(ROOT);

const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog', 'operations.json'), 'utf8'));
const spec = JSON.parse(readFileSync(join(REPO, 'openapi.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(EXT, 'src', 'manifest.json'), 'utf8'));

const { OPERATIONS, API_BASE, pageTypeOf, operationsFor, operationByType } = await import(
    join(EXT, 'src', 'generated', 'operations.js')
);

// --- generation -----------------------------------------------------------

test('the committed operations.js is what the builder produces', () => {
    const path = join(EXT, 'src', 'generated', 'operations.js');
    const before = readFileSync(path, 'utf8');
    execFileSync('node', [join(EXT, 'build.mjs')], { stdio: 'pipe' });
    assert.strictEqual(readFileSync(path, 'utf8'), before, 'operations.js is stale — run the build');
});

test('the extension offers exactly the catalog operations whose input is a LinkedIn URL', () => {
    const expected = catalog.operations
        .filter((op) => /^LinkedIn (Profile|Company Page|Post) URL$/.test(op.input.label))
        .map((op) => op.type)
        .sort();
    assert.deepStrictEqual(
        OPERATIONS.map((o) => o.type).sort(),
        expected,
        'the derived LinkedIn set drifted from the catalog'
    );
    assert.ok(expected.length >= 7, 'expected at least the seven known LinkedIn operations');
});

test('no operation needing input the page cannot supply is offered', () => {
    // A name, an email or a bare company name is not on the page, so offering it
    // would mean a button that cannot be filled in.
    for (const op of OPERATIONS) {
        assert.match(op.type, /^linkedin_/, `${op.type} does not take a LinkedIn URL`);
    }
    const types = OPERATIONS.map((o) => o.type);
    for (const excluded of ['lead_full_name_to_email', 'email_to_linkedin_url', 'company_name_to_website', 'instagram_lookup']) {
        assert.ok(!types.includes(excluded), `${excluded} must not be offered`);
    }
});

test('credit costs match the spec exactly, including the 50-credit phone lookup', () => {
    for (const op of OPERATIONS) {
        assert.strictEqual(op.credits, spec['x-linkfinder-operations'][op.type].credits, `${op.type} cost drifted`);
    }
    const cost = Object.fromEntries(OPERATIONS.map((o) => [o.type, o.credits]));
    assert.strictEqual(cost.linkedin_profile_to_phone, 50);
    assert.strictEqual(cost.linkedin_profile_to_email, 10);
    assert.strictEqual(cost.linkedin_profile_to_linkedin_info, 10);
});

test('the async operations are flagged, so the client polls instead of returning empty', () => {
    assert.strictEqual(operationByType('linkedin_profile_to_linkedin_info').alwaysAsync, true);
    assert.strictEqual(operationByType('linkedin_company_to_employees').alwaysAsync, true);
    assert.strictEqual(operationByType('linkedin_profile_to_email').alwaysAsync, false);
});

test('per-employee billing is carried through, because it changes the quoted price', () => {
    assert.strictEqual(operationByType('linkedin_company_to_employees').perEmployeeBilling, true);
    assert.strictEqual(operationByType('linkedin_profile_to_email').perEmployeeBilling, false);
});

test('the API base comes from the catalog and is the production host', () => {
    assert.strictEqual(API_BASE, catalog.apiBase);
    assert.strictEqual(API_BASE, spec.servers[0].url);
});

// --- page routing ---------------------------------------------------------

test('page routing recognises the three LinkedIn page types and nothing else', () => {
    assert.strictEqual(pageTypeOf('https://www.linkedin.com/in/williamhgates/'), 'profile');
    assert.strictEqual(pageTypeOf('https://www.linkedin.com/company/tesla-motors/'), 'company');
    assert.strictEqual(pageTypeOf('https://www.linkedin.com/posts/someone_activity-123'), 'post');
    assert.strictEqual(pageTypeOf('https://www.linkedin.com/feed/'), null);
    assert.strictEqual(pageTypeOf('https://www.linkedin.com/jobs/'), null);
    assert.strictEqual(pageTypeOf('https://example.com/in/nope'), 'profile'); // host is gated by the manifest, not here
});

test('a profile offers email, phone and details, cheapest first', () => {
    const ops = operationsFor('profile');
    assert.deepStrictEqual(ops.map((o) => o.type), [
        'linkedin_profile_to_email',
        'linkedin_profile_to_linkedin_info',
        'linkedin_profile_to_phone',
    ]);
    assert.ok(ops[0].credits <= ops.at(-1).credits, 'not sorted cheapest first');
});

// --- manifest -------------------------------------------------------------

test('the manifest stays minimal', () => {
    assert.strictEqual(manifest.manifest_version, 3);
    // Permission creep is the main reason a store listing gets held for review.
    assert.deepStrictEqual(manifest.permissions, ['storage']);
    assert.deepStrictEqual(manifest.host_permissions, ['https://api.linkfinderai.com/*']);
    for (const forbidden of ['tabs', 'activeTab', 'scripting', 'webRequest', 'cookies', '<all_urls>']) {
        assert.ok(!manifest.permissions.includes(forbidden), `must not request ${forbidden}`);
    }
    assert.deepStrictEqual(manifest.content_scripts[0].matches, ['https://www.linkedin.com/*']);
});

test('every icon the manifest names exists and is a real PNG of the right size', () => {
    for (const [size, path] of Object.entries(manifest.icons)) {
        const file = join(EXT, 'src', path);
        assert.ok(existsSync(file), `${path} missing`);
        const bytes = readFileSync(file);
        assert.deepStrictEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${path} is not a PNG`);
        assert.strictEqual(bytes.readUInt32BE(16), Number(size), `${path} is not ${size}px wide`);
        assert.strictEqual(bytes.readUInt32BE(20), Number(size), `${path} is not ${size}px tall`);
    }
});

test('every file the manifest references is present', () => {
    const referenced = [
        manifest.background.service_worker,
        ...manifest.content_scripts[0].js,
        ...manifest.content_scripts[0].css,
        manifest.action.default_popup,
        manifest.options_ui.page,
    ];
    for (const file of referenced) {
        assert.ok(existsSync(join(EXT, 'src', file)), `${file} referenced but missing`);
    }
});

// --- the key never leaves the worker -------------------------------------

test('the content script cannot touch the API key', () => {
    const content = readFileSync(join(EXT, 'src', 'content.js'), 'utf8');
    assert.ok(!/apiKey/i.test(content), 'content script mentions the API key');
    assert.ok(!/chrome\.storage/.test(content), 'content script reads extension storage');
    assert.ok(!/Authorization/i.test(content), 'content script sets an auth header');
});

test('the worker never sends the key back in a message', () => {
    const bg = readFileSync(join(EXT, 'src', 'background.js'), 'utf8');
    assert.ok(!/sendResponse\([^)]*apiKey/.test(bg), 'the key is put into a response');
    // has-key answers with a boolean, never the value.
    assert.match(bg, /hasKey: Boolean\(key\)/);
});

// --- API client -----------------------------------------------------------

const { runOperation, presentResult, ApiError } = await import(join(EXT, 'src', 'api.js'));

const jsonResponse = (status, body) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
});

test('a 200 returns the result inline', async () => {
    const calls = [];
    const out = await runOperation({
        apiKey: 'k',
        type: 'linkedin_profile_to_email',
        inputData: 'https://www.linkedin.com/in/someone',
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse(200, { status: 'success', result: { email: 'a@b.com' } });
        },
    });
    assert.deepStrictEqual(out.result, { email: 'a@b.com' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer k');
    assert.deepStrictEqual(JSON.parse(calls[0].init.body), {
        type: 'linkedin_profile_to_email',
        input_data: 'https://www.linkedin.com/in/someone',
    });
});

test('a null result is not an error and is still reported as charged', async () => {
    const out = await runOperation({
        apiKey: 'k',
        type: 'linkedin_profile_to_email',
        inputData: 'u',
        fetchImpl: async () => jsonResponse(200, { status: 'success', result: null }),
    });
    assert.strictEqual(out.result, null);
    assert.strictEqual(out.charged, true, 'a nothing-found call is billed and must say so');
    assert.deepStrictEqual(presentResult(operationByType('linkedin_profile_to_email'), out.result), []);
});

test('a 202 polls until done', async () => {
    let poll = 0;
    const out = await runOperation({
        apiKey: 'k',
        type: 'linkedin_profile_to_linkedin_info',
        inputData: 'u',
        sleep: async () => {},
        fetchImpl: async (url) => {
            if (!url.includes('/status/')) return jsonResponse(202, { status: 'processing', job_id: 'j1' });
            poll += 1;
            if (poll < 3) return jsonResponse(200, { status: 'processing' });
            return jsonResponse(200, { status: 'done', result: { name: 'Bill Gates' } });
        },
    });
    assert.deepStrictEqual(out.result, { name: 'Bill Gates' });
    assert.strictEqual(poll, 3);
});

test('a job that reports an error surfaces its message', async () => {
    await assert.rejects(
        runOperation({
            apiKey: 'k',
            type: 'linkedin_profile_to_linkedin_info',
            inputData: 'u',
            sleep: async () => {},
            fetchImpl: async (url) =>
                url.includes('/status/')
                    ? jsonResponse(200, { status: 'error', message: 'provider unavailable' })
                    : jsonResponse(202, { status: 'processing', job_id: 'j' }),
        }),
        /provider unavailable/
    );
});

test('an expired job says so rather than hanging', async () => {
    await assert.rejects(
        runOperation({
            apiKey: 'k',
            type: 'linkedin_profile_to_linkedin_info',
            inputData: 'u',
            sleep: async () => {},
            fetchImpl: async (url) =>
                url.includes('/status/') ? jsonResponse(404, { status: 'error' }) : jsonResponse(202, { status: 'processing', job_id: 'j' }),
        }),
        /expired/
    );
});

test('polling is bounded, so a stuck job fails visibly', async () => {
    let clock = 0;
    await assert.rejects(
        runOperation({
            apiKey: 'k',
            type: 'linkedin_profile_to_linkedin_info',
            inputData: 'u',
            sleep: async (ms) => {
                clock += ms;
            },
            now: () => clock,
            fetchImpl: async (url) =>
                url.includes('/status/') ? jsonResponse(200, { status: 'processing' }) : jsonResponse(202, { status: 'processing', job_id: 'j' }),
        }),
        /taking longer than expected/
    );
});

test('each documented failure gets a message written for a user, not a status code', async () => {
    const cases = [
        [401, /API key was rejected/],
        [402, /Not enough credits/],
        [429, /Too many lookups/],
        [500, /having trouble/],
    ];
    for (const [status, expected] of cases) {
        await assert.rejects(
            runOperation({
                apiKey: 'k',
                type: 'linkedin_profile_to_email',
                inputData: 'u',
                fetchImpl: async () => jsonResponse(status, { status: 'error', message: 'raw internal detail' }),
            }),
            expected,
            `HTTP ${status}`
        );
    }
});

test('a 422 passes the server message through, since it explains the bad input', async () => {
    await assert.rejects(
        runOperation({
            apiKey: 'k',
            type: 'linkedin_profile_to_email',
            inputData: 'nonsense',
            fetchImpl: async () => jsonResponse(422, { status: 'error', message: 'input_data is not a LinkedIn profile URL' }),
        }),
        /not a LinkedIn profile URL/
    );
});

test('a missing key fails before any request is made', async () => {
    let called = false;
    await assert.rejects(
        runOperation({
            apiKey: null,
            type: 'linkedin_profile_to_email',
            inputData: 'u',
            fetchImpl: async () => {
                called = true;
                return jsonResponse(200, {});
            },
        }),
        /No API key set/
    );
    assert.strictEqual(called, false, 'called the API without a key');
});

test('a non-JSON body does not crash the client', async () => {
    await assert.rejects(
        runOperation({
            apiKey: 'k',
            type: 'linkedin_profile_to_email',
            inputData: 'u',
            fetchImpl: async () => ({
                status: 502,
                ok: false,
                json: async () => {
                    throw new SyntaxError('Unexpected token < in JSON');
                },
            }),
        }),
        ApiError
    );
});

// --- presentation ---------------------------------------------------------

test('a scalar result is shown as one labelled line', () => {
    const lines = presentResult(operationByType('linkedin_profile_to_email'), { email: 'bill@microsoft.com' });
    assert.deepStrictEqual(lines, [{ label: 'Email', value: 'bill@microsoft.com' }]);
});

test('an object result drops empty and nested values', () => {
    const lines = presentResult(operationByType('linkedin_profile_to_linkedin_info'), {
        name: 'Bill Gates',
        jobTitle: 'Co-chair',
        blank: '',
        missing: null,
        nested: { a: 1 },
    });
    assert.deepStrictEqual(lines.map((l) => l.label), ['name', 'jobTitle']);
});

test('a list result is numbered and keeps the row for detail', () => {
    const lines = presentResult(operationByType('linkedin_post_to_reactions'), [
        { name: 'Ada Lovelace', reactionType: 'LIKE' },
        { name: 'Alan Turing', reactionType: 'PRAISE' },
    ]);
    assert.deepStrictEqual(lines.map((l) => l.value), ['Ada Lovelace', 'Alan Turing']);
    assert.strictEqual(lines[0].detail.reactionType, 'LIKE');
});

test('a network failure says the network failed, not "something went wrong"', async () => {
    // Found by running the extension in real Chromium against a blocked host: an
    // unwrapped fetch TypeError reached the panel as the generic fallback.
    await assert.rejects(
        runOperation({
            apiKey: 'k',
            type: 'linkedin_profile_to_email',
            inputData: 'u',
            fetchImpl: async () => {
                throw new TypeError('Failed to fetch');
            },
        }),
        /Could not reach LinkFinder/
    );
});

test('an aborted lookup is reported as cancelled', async () => {
    await assert.rejects(
        runOperation({
            apiKey: 'k',
            type: 'linkedin_profile_to_email',
            inputData: 'u',
            fetchImpl: async () => {
                const e = new Error('aborted');
                e.name = 'AbortError';
                throw e;
            },
        }),
        /cancelled/
    );
});
