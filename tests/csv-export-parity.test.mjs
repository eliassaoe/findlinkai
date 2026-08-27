import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A batch can be enriched partly in the browser and partly by the background
// runner, and both halves are appended to the SAME archive. If the two
// implementations of the export builder ever diverge — a column renamed, a
// value formatted differently, a row expanded another way — the file a user
// downloads is silently corrupt, with a seam in the middle nobody would think
// to look for.
//
// So this does not check that the port "looks right". It runs both over the
// same fixtures and demands byte-identical output.

const appSrc = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const runnerSrc = readFileSync(new URL('../supabase/functions/csv-batch-runner/shared-export.js', import.meta.url), 'utf8');

/* ---- the browser implementation, lifted out of app.html ------------ */

function slice(startMark, endMark) {
    const start = appSrc.indexOf(startMark);
    assert.ok(start > 0, `could not find "${startMark}" in app.html`);
    const end = appSrc.indexOf(endMark, start);
    assert.ok(end > start, `could not find "${endMark}" in app.html`);
    return appSrc.slice(start, end);
}

const helpers = ['csvCurrentExp', 'csvFormatEducation', 'csvFormatExperiences', 'csvFormatSkills']
    .map(name => {
        const i = appSrc.indexOf(`function ${name}(`);
        assert.ok(i > 0, `missing helper ${name}`);
        return appSrc.slice(i, appSrc.indexOf('\n}\n', i) + 3);
    }).join('\n');

const exportBlock = slice('/* ---------------------------------------------------------------------\n   The export CSV.', 'async function downloadResults(');
const buildInputs = slice('function lfBuildCsvData(){', '\n/* The fallback that replaces the old dead-end error.');

function browserImpl({ headers, rows, inputType, outputType, mapping }) {
    const ctx = {
        currentInputType: inputType,
        currentOutputType: outputType,
        lfCsvHeaders: headers,
        lfCsvRows: rows,
        lfMapping: mapping,
        lfUploadedFileName: 'fixture.csv',
        csvData: [],
        bulkResults: [],
        csvResumeFrom: 0,
        bulkCarryCsv: '',
        bulkCarryEndSrc: -1,
        csvCheckpointSrc: 0,
        dataConfigurations: {
            lead_full_name: { label: 'Enter Lead Full Name + Company Name', outputs: { linkedin_url: 'LinkedIn Profile URL', email: 'Verified Email' } },
            company_name: { label: 'Enter Company Name', outputs: { website: 'Company Website', phone: 'Company Phone Number', linkedin_url: 'Company LinkedIn URL', email: 'Company Email' } },
            email: { label: 'Enter Email Address', outputs: { linkedin_url: 'LinkedIn Profile URL' } },
            company_domain: { label: 'Enter Company Domain', outputs: { employees: 'Company Employees List' } },
            linkedin_company: { label: 'Enter LinkedIn Company URL', outputs: { linkedin_info: 'LinkedIn Company Data', employee_count: 'Employee Count' } },
            linkedin_profile: { label: 'Enter LinkedIn Profile URL', outputs: { linkedin_info: 'LinkedIn Profile Data', phone: 'Phone Number', email: 'Email Address' } },
            linkedin_post: { label: 'Enter LinkedIn Post URL', outputs: { reactions: 'Post Reactions' } },
        },
        showAlert: () => {},
        cipFounded: (f) => {
            const empty = (v) => v === undefined || v === null || v === '' || v === 'Not specified' || v === 'Not found';
            if (empty(f)) return '';
            if (typeof f === 'object') { if (!f.year) return ''; return f.month ? `${f.month}/${f.year}` : `${f.year}`; }
            return f;
        },
        parseReactionTitle: (title) => {
            if (!title) return { name: 'Unknown', jobInfo: '' };
            const parts = title.split(' - ');
            return { name: parts[0].trim(), jobInfo: parts.slice(1).join(' - ').trim() };
        },
    };
    const api = new Function(...Object.keys(ctx),
        helpers + buildInputs + exportBlock +
        '; return { lfBuildCsvData, csvRenderRange, csvEnrichColumns, exposeCsvData(){ return csvData; }, setResults(rs){ bulkResults = rs; } };'
    )(...Object.values(ctx));
    api.lfBuildCsvData();
    return api;
}

/* ---- the runner implementation, imported as it ships --------------- */

// The shared builder is plain JavaScript precisely so this test can load the
// exact file the runner runs, rather than a transformed copy of it.
const runner = await import('../supabase/functions/csv-batch-runner/shared-export.js');

/* ---- fixtures ------------------------------------------------------ */

const HEADERS = ['First Name', 'Last Name', 'Company', 'Owner', 'Notes'];
const ROWS = [
    ['Ada', 'Lovelace', 'Analytical Engines', 'sam@x.com', 'warm'],
    ['', '', 'Ghost Corp', 'sam@x.com', 'no name'],
    ['Grace', 'Hopper', 'UNIVAC', 'jo@x.com', 'commas, and "quotes"'],
    ['Alan', 'Turing', 'NPL', 'jo@x.com', 'line\nbreak'],
    ['Doe, John', '', 'Acme', 'kim@x.com', 'flipped name'],
];

const PROFILE = {
    name: 'Ada Lovelace', headline: 'Mathematician', jobTitle: 'Analyst',
    location: 'London', country: 'UK', industry: 'Computing',
    connections: 500, followers: '1,200', website: 'https://ae.com',
    email: 'ada@ae.com', mobileNumber: '+44 123', about: 'Notes about, "things"',
    education: [{ school: 'Home', degree: 'BSc', fieldOfStudy: 'Maths' }],
    experiences: [
        { title: 'Analyst', companyName: 'AE', jobStartedOn: '1842', jobStillWorking: true },
        { title: 'Assistant', companyName: 'Old', jobStartedOn: '1840', jobEndedOn: '1842' },
    ],
    skills: [{ name: 'Algorithms' }, 'Logic'],
};

const COMPANY = {
    name: 'Analytical Engines', industry: 'Computing', company_size: 42,
    followerCount: '12,345', city: 'London', country: 'UK',
    foundedOn: { year: 1842, month: 6 }, website: 'https://ae.com',
    company_email: 'hi@ae.com', company_phone: '+44 1', company_description: 'Engines',
};

const CASES = [
    {
        name: 'name to email',
        inputType: 'lead_full_name', outputType: 'email', mapping: { first: 0, last: 1, company: 2 },
        results: [
            { inputData: 'a', result: 'ada@ae.com', status: 'Found' },
            { inputData: 'b', result: 'Not found', status: 'Not found' },
            { inputData: 'c', result: 'alan@npl.uk', status: 'Found' },
            { inputData: 'd', result: 'john@acme.com', status: 'Found' },
        ],
    },
    {
        name: 'email to linkedin (carries a confidence column)',
        inputType: 'email', outputType: 'linkedin_url', mapping: { name: 3 },
        results: [
            { inputData: 'a', result: 'https://li/1', status: 'Found', confidence: 'high' },
            { inputData: 'b', result: 'Not found', status: 'Not found' },
            { inputData: 'c', result: 'https://li/3', status: 'Found', confidence: 'low_confidence' },
            { inputData: 'd', result: 'https://li/4', status: 'Found' },
            { inputData: 'e', result: 'https://li/5', status: 'Found' },
        ],
    },
    {
        name: 'profile scrape (the widest shape)',
        inputType: 'linkedin_profile', outputType: 'linkedin_info', mapping: { name: 0 },
        results: [
            { inputData: 'a', result: 'Ada Lovelace', status: 'Found', rawData: PROFILE },
            { inputData: 'b', result: 'Not found', status: 'Not found', rawData: {} },
            { inputData: 'c', result: 'x', status: 'Found', rawData: { name: 'Grace', experiences: [] } },
            { inputData: 'd', result: 'Not found', status: 'Error' },
        ],
    },
    {
        name: 'company scrape',
        inputType: 'linkedin_company', outputType: 'linkedin_info', mapping: { name: 2 },
        results: [
            { inputData: 'a', result: 'x', status: 'Found', rawData: COMPANY },
            { inputData: 'b', result: 'x', status: 'Found', rawData: { name: 'Ghost', company_size: 0, foundedOn: {} } },
            { inputData: 'c', result: 'Not found', status: 'Not found', rawData: {} },
            { inputData: 'd', result: 'x', status: 'Found', rawData: { name: 'NPL', foundedOn: 1945 } },
            { inputData: 'e', result: 'Not found', status: 'Not found' },
        ],
    },
    {
        name: 'employee count',
        inputType: 'linkedin_company', outputType: 'employee_count', mapping: { name: 2 },
        results: [
            { inputData: 'a', employeeCount: 42, status: 'Found' },
            { inputData: 'b', employeeCount: 'Not found', status: 'Not found' },
            { inputData: 'c', employeeCount: 0, status: 'Found' },
            { inputData: 'd', employeeCount: 7, status: 'Found' },
            { inputData: 'e', employeeCount: 1, status: 'Found' },
        ],
    },
    {
        name: 'employees list (one row in, many out)',
        inputType: 'company_domain', outputType: 'employees', mapping: { name: 2 },
        results: [
            { inputData: 'a', status: 'Found', employees: [
                { name: 'Elon', jobTitle: 'CEO', email: 'e@x.com', companySize: 100, industry: ['Auto', 'Tech'] },
                { name: 'Drew', jobTitle: 'CTO', email: 'd@x.com' },
            ] },
            { inputData: 'b', status: 'Not found', employees: [] },
            { inputData: 'c', status: 'Found', employees: [{ name: 'Grace' }] },
            { inputData: 'd', status: 'Not found' },
            { inputData: 'e', status: 'Found', employees: [{ name: 'K', country: null, city: '' }] },
        ],
    },
    {
        name: 'post reactions (one row in, many out)',
        inputType: 'linkedin_post', outputType: 'reactions', mapping: { name: 0 },
        results: [
            { inputData: 'a', status: 'Found', reactions: [
                { title: 'Ada Lovelace - Analyst at AE', snippet: 'liked', link: 'https://li/1' },
                { title: 'NoDash', snippet: null, link: 'https://li/2' },
            ] },
            { inputData: 'b', status: 'Not found', reactions: [] },
            { inputData: 'c', status: 'Found', reactions: [{ title: '', snippet: 'x', link: 'y' }] },
            { inputData: 'd', status: 'Found', reactions: [{ title: 'A - B - C', snippet: 's', link: 'l' }] },
        ],
    },
];

/* ---- the comparison ------------------------------------------------ */

function bothRender(c, { from = 0, to = ROWS.length - 1, header = true } = {}) {
    const browser = browserImpl({ headers: HEADERS, rows: ROWS, inputType: c.inputType, outputType: c.outputType, mapping: c.mapping });
    browser.setResults(c.results);

    // Both sides key enrichment by the ORIGINAL row it came from.
    const runnerData = runner.buildCsvData(ROWS, c.mapping, c.inputType);
    const bySrc = new Map();
    runnerData.forEach((row, i) => { if (c.results[i]) bySrc.set(row.srcIndex, c.results[i]); });

    return {
        browser: browser.csvRenderRange(from, to, header),
        runner: runner.renderRange(from, to, header, HEADERS, ROWS, bySrc, c.inputType, c.outputType),
    };
}

for (const c of CASES) {
    test(`the runner and the browser agree byte for byte — ${c.name}`, () => {
        const { browser, runner: rn } = bothRender(c);
        assert.equal(rn, browser);
        assert.ok(browser.length > 0, 'the fixture must actually render something');
    });
}

test('they agree on the column headers, which is where a seam would show', () => {
    for (const c of CASES) {
        const browser = browserImpl({ headers: HEADERS, rows: ROWS, inputType: c.inputType, outputType: c.outputType, mapping: c.mapping });
        assert.deepEqual(
            runner.enrichColumns(c.inputType, c.outputType),
            browser.csvEnrichColumns(),
            `${c.name}: header drift silently corrupts every resumed file`
        );
    }
});

test('they agree on which original row each enriched row came from', () => {
    // The resume cursor is an index into this list, so if the two disagree a
    // handover enriches the wrong rows.
    for (const c of CASES) {
        const browser = browserImpl({ headers: HEADERS, rows: ROWS, inputType: c.inputType, outputType: c.outputType, mapping: c.mapping });
        assert.deepEqual(
            runner.buildCsvData(ROWS, c.mapping, c.inputType).map(r => [r.srcIndex, r.inputData]),
            browser.exposeCsvData().map(r => [r.srcIndex, r.inputData]),
            `${c.name}: the two must skip and flip exactly the same rows`
        );
    }
});

test('a handover mid-file joins without a seam', () => {
    // The browser does rows 0-1, the runner finishes 2 onward, exactly as a
    // real "keep going in the background" handover does.
    for (const c of CASES) {
        const whole = bothRender(c).browser;

        const browser = browserImpl({ headers: HEADERS, rows: ROWS, inputType: c.inputType, outputType: c.outputType, mapping: c.mapping });
        browser.setResults(c.results.slice(0, 2));
        const runnerData = runner.buildCsvData(ROWS, c.mapping, c.inputType);
        const firstHalf = browser.csvRenderRange(0, runnerData[1].srcIndex, true);

        const bySrc = new Map();
        runnerData.forEach((row, i) => { if (i >= 2 && c.results[i]) bySrc.set(row.srcIndex, c.results[i]); });
        const secondHalf = runner.renderRange(
            runnerData[1].srcIndex + 1, ROWS.length - 1, false, HEADERS, ROWS, bySrc, c.inputType, c.outputType);

        assert.equal(firstHalf + secondHalf, whole, `${c.name}: a handover must be invisible in the file`);
    }
});

test('the runner file has not drifted from the browser on the shared helpers', () => {
    // Cheap tripwire: these formatters are the ones most likely to be edited on
    // one side only.
    for (const fn of ['formatEducation', 'formatExperiences', 'formatSkills', 'currentExp']) {
        assert.match(runnerSrc, new RegExp(`function ${fn}\\(`), `runner lost ${fn}`);
    }
    assert.match(runnerSrc, /byte-identical output/,
        'the warning that these two must stay in step should stay in the file');
});
