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
    // The description carries the distinguishing detail, not just the name — a
    // list of bare names tells the user nothing about which row is which.
    assert.deepStrictEqual(lines.map((l) => l.value), ['Ada Lovelace — LIKE', 'Alan Turing — PRAISE']);
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

// --- export: the behaviour that actually converts ------------------------
//
// Measured over 120 days in PostHog: single-lookup-only users paid at 0.35%,
// CSV uploaders at 4.6%, people who hit the export gate at 8.7%. The export path
// is the one worth protecting with tests.

const { toCsv, rowCount } = await import(join(EXT, 'src', 'api.js'));
const { estimateCredits, isExport } = await import(join(EXT, 'src', 'generated', 'operations.js'));

const employees = operationByType('linkedin_company_to_employees');

test('the employee export is the one operation carrying filters', () => {
    assert.deepStrictEqual(employees.params.map((p) => p.name), ['department', 'seniority', 'employee_count']);
    assert.ok(isExport(employees));
    assert.ok(!isExport(operationByType('linkedin_profile_to_email')));
});

test('per-employee cost is quoted from the row cap, not the headline credit', () => {
    // The catalog headline says 1 credit. 200 rows is 101. Quoting the headline
    // would be the single most expensive lie the panel could tell.
    assert.strictEqual(estimateCredits(employees, 25), 13.5);
    assert.strictEqual(estimateCredits(employees, 200), 101);
    assert.strictEqual(estimateCredits(operationByType('linkedin_profile_to_email'), 200), 10);
    assert.strictEqual(estimateCredits(employees, 0), null);
    assert.strictEqual(estimateCredits(employees, 'abc'), null);
});

test('CSV columns come from the catalog, and internal ids never ship', () => {
    const csv = toCsv(employees, [
        {
            firstName: 'Sebastian', lastName: 'Robles', jobTitle: 'Talent Acquisition Manager',
            email: 'srobles@tesla.com', mobileNumber: null, linkedinUrl: 'http://lnkd/x',
            company: 'Tesla', city: 'Mexico City', country: 'Mexico',
            personId: 'INTERNAL', companyId: 'INTERNAL', photoUrl: 'INTERNAL',
        },
    ]);
    const header = csv.split('\r\n')[0].split(',');
    assert.deepStrictEqual(header.slice(0, 9), employees.columns.default);
    for (const skipped of employees.columns.skip) {
        assert.ok(!header.includes(skipped), `${skipped} must not be exported`);
    }
    assert.ok(!csv.includes('INTERNAL'));
});

test('CSV escaping survives commas, quotes and newlines', () => {
    const csv = toCsv(employees, [{ firstName: 'O"Brien, Jr', jobTitle: 'VP, Sales\nEMEA' }]);
    const body = csv.split('\r\n')[1];
    assert.ok(body.includes('"O""Brien, Jr"'), body);
    assert.ok(body.includes('"VP, Sales\nEMEA"'), body);
});

test('a formula is neutralised, so an export cannot execute in Excel', () => {
    // CSV injection: a cell starting = + - or @ runs on open in Excel and Sheets.
    for (const payload of ['=cmd|calc', '+1+1', '-2+3', '@SUM(A1)']) {
        const csv = toCsv(employees, [{ firstName: payload }]);
        assert.match(csv.split('\r\n')[1], /^'/, `${payload} was not neutralised`);
    }
});

test('an array field is joined rather than stringified as an object', () => {
    const csv = toCsv(employees, [{ firstName: 'A', department: ['Human Resources', 'Ops'] }]);
    assert.ok(csv.includes('Human Resources; Ops'), csv);
});

test('a field the catalog did not anticipate is appended, never dropped', () => {
    // Losing data silently on an export is worse than an unfamiliar column.
    const csv = toCsv(employees, [{ firstName: 'A', someNewField: 'keep me' }]);
    assert.ok(csv.split('\r\n')[0].includes('someNewField'));
    assert.ok(csv.includes('keep me'));
});

test('an empty result produces no CSV rather than a lone header', () => {
    assert.strictEqual(toCsv(employees, []), '');
    assert.strictEqual(toCsv(employees, null), '');
    assert.strictEqual(rowCount(null), 0);
});

test('the worker bills from rows returned, not rows requested', () => {
    // An export capped at 200 that finds 60 must be reported as 60 rows' worth.
    const bg = readFileSync(join(EXT, 'src', 'background.js'), 'utf8');
    assert.match(bg, /chargedCredits:.*0\.5 \* rows/, 'charge is not computed from rows returned');
    assert.match(bg, /csv: rows > 0 \? toCsv/, 'CSV is not built in the worker');
});

test('the export form leads on a company page, not the single lookups', () => {
    const content = readFileSync(join(EXT, 'src', 'content.js'), 'utf8');
    assert.match(content, /const exports = ops\.filter/, 'exports are not separated from quick lookups');
    // The cost estimate must exist and must be rendered before the run button.
    assert.ok(content.indexOf('lf-estimate') < content.indexOf('lf-export-run'), 'cost is not shown above the run button');
});

test('the download needs no extra permission', () => {
    const content = readFileSync(join(EXT, 'src', 'content.js'), 'utf8');
    assert.match(content, /URL\.createObjectURL/, 'not using a blob download');
    // Strip comments first: the code explains why it avoids chrome.downloads, and
    // matching that sentence is not the same as calling the API.
    const code = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/chrome\.downloads/.test(code), 'chrome.downloads would need a new permission');
    assert.ok(!manifest.permissions.includes('downloads'));
});

test('a list preview describes a row, it does not dump JSON at the user', () => {
    // Found by screenshotting the panel: employee rows have firstName/lastName and
    // no `name`, so the old fallback serialised the whole object — internal ids
    // and all — into the preview the export had just stripped them from.
    const lines = presentResult(employees, [
        { firstName: 'Sebastian', lastName: 'Robles', jobTitle: 'Talent Acquisition Manager', personId: 'INTERNAL' },
    ]);
    assert.strictEqual(lines[0].value, 'Sebastian Robles — Talent Acquisition Manager');
    assert.ok(!lines[0].value.includes('INTERNAL'));
    assert.ok(!lines[0].value.includes('{'));
});

test('a reaction row, which has a name and no job title, still reads cleanly', () => {
    const lines = presentResult(operationByType('linkedin_post_to_reactions'), [
        { name: 'Ada Lovelace', headline: 'VP Engineering at Tesla', reactionType: 'LIKE' },
    ]);
    assert.strictEqual(lines[0].value, 'Ada Lovelace — VP Engineering at Tesla');
});

test('a nameless row falls back to a field, never to JSON', () => {
    const lines = presentResult(employees, [{ personId: 'x1', linkedinUrl: 'http://lnkd/x', city: 'Austin' }]);
    assert.strictEqual(lines[0].value, 'Austin');
});

// --- the extension is an acquisition hook -------------------------------
//
// Its job is to give one answer on the page and send the volume work to
// linkfinderai.com. These tests hold that shape.

const contentSrc = readFileSync(join(EXT, 'src', 'content.js'), 'utf8');

test('every exit from the panel goes to the web app', () => {
    const hrefs = [...contentSrc.matchAll(/https:\/\/linkfinderai\.com\/[a-z]*/g)].map((m) => m[0]);
    assert.ok(hrefs.length > 0, 'no link to the app at all');
    for (const href of hrefs) assert.match(href, /^https:\/\/linkfinderai\.com\/app$/);
});

test('each CTA surface carries a DISTINCT utm_campaign', () => {
    // docs/youtube-decision-record.md: 535 of 561 tagged pageviews collapsed into
    // one campaign, so no individual video could ever be judged. Same mistake here
    // would make "why do people open the app" unanswerable.
    const campaigns = [...contentSrc.matchAll(/appCta\([^,]+,\s*'([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(campaigns.length >= 5, `expected at least 5 CTA surfaces, found ${campaigns.length}`);
    assert.strictEqual(new Set(campaigns).size, campaigns.length, `duplicate utm_campaign: ${campaigns.join(', ')}`);
    for (const expected of ['after_lookup', 'after_export', 'credit_wall', 'no_key', 'no_result']) {
        assert.ok(campaigns.includes(expected), `missing the ${expected} surface`);
    }
});

test('the popup uses its own campaign, not the panel is', () => {
    const popup = readFileSync(join(EXT, 'src', 'popup.js'), 'utf8');
    assert.match(popup, /utm_campaign=popup/);
    assert.match(popup, /utm_source=chrome_extension/);
});

test('the UTM keys are ones app.html actually captures', () => {
    // app.html's UTM_KEYS decides what survives into PostHog person properties.
    // A key outside that list is silently dropped and the surface becomes invisible.
    const appHtml = readFileSync(join(REPO, 'app.html'), 'utf8');
    const declared = appHtml.match(/const UTM_KEYS = \[([^\]]+)\]/);
    assert.ok(declared, 'app.html no longer declares UTM_KEYS — re-check the contract');
    const keys = [...declared[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    for (const used of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
        assert.ok(keys.includes(used), `app.html does not capture ${used}`);
    }
});

test('the credit wall routes to the app, because it is the highest-intent moment', () => {
    assert.match(contentSrc, /response\.status === 402/, '402 is not given its own path');
    const wall = contentSrc.slice(contentSrc.indexOf('response.status === 402'));
    assert.match(wall.slice(0, 400), /credit_wall/);
});

test('the CTA is a link, never a modal or a redirect', () => {
    // An extension that interrupts LinkedIn gets uninstalled.
    assert.ok(!/window\.location\s*=/.test(contentSrc), 'the panel navigates the page');
    assert.ok(!/\.showModal\(|alert\(/.test(contentSrc), 'the panel interrupts');
    assert.match(contentSrc, /target: '_blank', rel: 'noopener'/, 'CTA does not open safely in a new tab');
});

test('the manifest fits the Chrome Web Store field limits', () => {
    // The store rejects the upload outright on these, after the zip is built and
    // the form is filled in — a slow way to find out. 136 chars was the first try.
    const current = JSON.parse(readFileSync(join(EXT, 'src', 'manifest.json'), 'utf8'));
    assert.ok(current.description.length <= 132, `description is ${current.description.length} chars, limit is 132`);
    assert.ok(current.name.length <= 75, `name is ${current.name.length} chars, limit is 75`);
    assert.ok(current.short_name.length <= 12, `short_name is ${current.short_name.length} chars, limit is 12`);
});

test('the listing leads on phone, which is where the intent is', () => {
    // 86.8% of phone-page visitors run a lookup against 13.0% on email, and
    // Apollo/Hunter/Lusha all lead on email. See docs/chrome-extension-direction.md.
    const current = JSON.parse(readFileSync(join(EXT, 'src', 'manifest.json'), 'utf8'));
    assert.match(current.name, /phone/i);
    assert.ok(
        current.name.toLowerCase().indexOf('phone') < current.name.toLowerCase().indexOf('email'),
        'email is named before phone'
    );
});

// --- connect: the step that decides whether any of this works ------------

test("the extension's key derivation matches api-access.html exactly", () => {
    // connect.js copies transformerToken out of the app. If the app ever changes
    // it, the extension silently derives a key that is not the user's and every
    // lookup 401s. This is the guard against that, and it is why the copy carries
    // a "do not improve this" comment.
    const appSrc = readFileSync(join(REPO, 'api-access.html'), 'utf8');
    const appFn = appSrc.match(/function transformerToken\(t\)\{[^}]*\}[^}]*\}/);
    assert.ok(appFn, 'api-access.html no longer defines transformerToken — re-check the contract');

    const connectSrc = readFileSync(join(EXT, 'src', 'connect.js'), 'utf8');

    // Compare behaviour rather than text: the app's is minified, the copy is not.
    const appImpl = new Function(`${appFn[0]}; return transformerToken;`)();
    const extImpl = new Function(
        connectSrc.match(/function transformerToken\(t\) \{[\s\S]*?\n\}/)[0] + '; return transformerToken;'
    )();

    for (const sample of ['abc123', 'a', 'tok_WITH-mixed_Case.09', '~!@#$%^&*()', 'ç'.repeat(3)]) {
        assert.strictEqual(extImpl(sample), appImpl(sample), `derivation differs on ${JSON.stringify(sample)}`);
    }
});

test('connect reads both spellings of the auth token', () => {
    // app.html/account.html/history.html write `linkFinderToken`; api-access.html
    // writes `LinkFinderToken`. localStorage keys are case-sensitive, so reading
    // only one would fail for users who arrived through the other page.
    const connectSrc = readFileSync(join(EXT, 'src', 'connect.js'), 'utf8');
    assert.match(connectSrc, /getItem\('linkFinderToken'\)/);
    assert.match(connectSrc, /getItem\('LinkFinderToken'\)/);
});

test('a key is only accepted from linkfinderai.com', () => {
    const bg = readFileSync(join(EXT, 'src', 'background.js'), 'utf8');
    const handler = bg.slice(bg.indexOf("message.kind === 'connect'"));
    assert.match(handler.slice(0, 700), /origin !== 'https:\/\/linkfinderai\.com'/, 'connect does not check the origin');
    assert.match(handler.slice(0, 900), /rejected: unexpected origin/);
    assert.match(handler.slice(0, 900), /rejected: empty key/);
});

test('the connect content script runs on the site and nowhere else', () => {
    const current = JSON.parse(readFileSync(join(EXT, 'src', 'manifest.json'), 'utf8'));
    const connect = current.content_scripts.find((c) => c.js.includes('connect.js'));
    assert.ok(connect, 'connect.js is not registered');
    assert.deepStrictEqual(connect.matches, ['https://linkfinderai.com/*']);
    // Still no new permissions bought by any of this.
    assert.deepStrictEqual(current.permissions, ['storage']);
});

test('a fresh install lands on the site, not on a "paste a key" screen', () => {
    // The paste step was the single biggest risk to the whole channel: six steps
    // to first value against a competitor's "sign in with Google".
    const bg = readFileSync(join(EXT, 'src', 'background.js'), 'utf8');
    const onInstall = bg.slice(bg.indexOf('onInstalled'));
    assert.match(onInstall, /linkfinderai\.com\/app/, 'first run does not open the site');
    assert.match(onInstall, /utm_campaign=install/, 'the install visit is not attributed');
});

test('the panel leads with connect and demotes pasting', () => {
    assert.match(contentSrc, /Connect my account/);
    assert.match(contentSrc, /Paste a key instead/);
    assert.ok(
        contentSrc.indexOf('Connect my account') < contentSrc.indexOf('Paste a key instead'),
        'pasting is offered before connecting'
    );
});
