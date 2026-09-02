import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The export builder, pulled straight out of app.html so the test cannot drift
// from what ships.
const appSrc = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

function slice(startMark, endMark) {
    const start = appSrc.indexOf(startMark);
    assert.ok(start > 0, `could not find "${startMark}"`);
    const end = appSrc.indexOf(endMark, start);
    assert.ok(end > start, `could not find "${endMark}"`);
    return appSrc.slice(start, end);
}

const exportBlock = slice('/* ---------------------------------------------------------------------\n   The export CSV.', 'async function downloadResults(');
const buildInputs = slice('function lfBuildCsvData(){', '\n/* The fallback that replaces the old dead-end error.');

function harness({ headers, rows, inputType, outputType, mapping, fileName = 'crm-export.csv' }) {
    const ctx = {
        currentInputType: inputType,
        currentOutputType: outputType,
        lfCsvHeaders: headers,
        lfCsvRows: rows,
        lfMapping: mapping,
        lfUploadedFileName: fileName,
        csvData: [],
        bulkResults: [],
        csvResumeFrom: 0,
        bulkCarryCsv: '',
        bulkCarryEndSrc: -1,
        csvCheckpointSrc: 0,
        dataConfigurations: {
            lead_full_name: { label: 'Enter Lead Full Name + Company Name', outputs: { linkedin_url: 'LinkedIn Profile URL', email: 'Verified Email' } },
            company_name: { label: 'Enter Company Name', outputs: { website: 'Company Website' } },
            company_domain: { label: 'Enter Company Domain', outputs: { employees: 'Company Employees List' } },
        },
        showAlert: () => {},
        csvCurrentExp: () => null,
        csvFormatEducation: () => '',
        csvFormatExperiences: () => '',
        csvFormatSkills: () => '',
        cipFounded: (v) => v,
        parseReactionTitle: (t) => ({ name: t, jobInfo: '' }),
    };
    const api = new Function(...Object.keys(ctx),
        buildInputs + exportBlock +
        `; return {
            lfBuildCsvData, buildBulkCsv, buildBulkCsvChunk, buildBulkPreviewCsv,
            csvRenderRange, csvEnrichColumns, csvSrcOf, csvBaseName,
            get csvData(){ return csvData; },
            setResults(rs, from){ bulkResults = rs; csvResumeFrom = from || 0; },
            setCarry(csv, endSrc){ bulkCarryCsv = csv; bulkCarryEndSrc = endSrc; },
            setCheckpointSrc(v){ csvCheckpointSrc = v; },
        };`)(...Object.values(ctx));
    api.lfBuildCsvData();
    return api;
}

const parse = (csv) => csv.trimEnd().split('\n').map(line =>
    line.slice(1, -1).split('","').map(c => c.replace(/""/g, '"')));

/* ------------------------------------------------------------------ */

const LEADS = {
    headers: ['First Name', 'Last Name', 'Company', 'Lifecycle Stage', 'Owner'],
    rows: [
        ['Ada', 'Lovelace', 'Analytical Engines', 'Lead', 'sam@x.com'],
        ['', '', 'Ghost Corp', 'Lead', 'sam@x.com'],          // no name — skipped by the enrichment
        ['Grace', 'Hopper', 'UNIVAC', 'Customer', 'jo@x.com'],
        ['Alan', 'Turing', 'NPL', 'Lead', 'jo@x.com'],
    ],
    inputType: 'lead_full_name',
    outputType: 'email',
    mapping: { first: 0, last: 1, company: 2 },
};

const found = (v) => ({ result: v, status: 'Found' });
const notFound = () => ({ result: 'Not found', status: 'Not found' });

test('the file that comes back is the file that went in, plus columns', () => {
    const api = harness(LEADS);
    api.setResults([found('ada@ae.com'), found('grace@univac.com'), notFound()]);
    const table = parse(api.buildBulkCsv().csv);

    assert.deepEqual(table[0],
        ['First Name', 'Last Name', 'Company', 'Lifecycle Stage', 'Owner', 'Verified Email', 'Status']);
    // every original row, in order, with its own columns untouched
    assert.deepEqual(table.slice(1).map(r => r.slice(0, 5)), LEADS.rows);
    assert.equal(table.length, LEADS.rows.length + 1);
});

test('a row the enrichment could not read is still in the file, just blank', () => {
    const api = harness(LEADS);
    api.setResults([found('ada@ae.com'), found('grace@univac.com'), notFound()]);
    const table = parse(api.buildBulkCsv().csv);
    const ghost = table.find(r => r[2] === 'Ghost Corp');
    assert.ok(ghost, 'the unreadable row must survive');
    assert.deepEqual(ghost, ['', '', 'Ghost Corp', 'Lead', 'sam@x.com', '', '']);
});

test('enrichment lands on the right row, not the row that happens to be next', () => {
    const api = harness(LEADS);
    api.setResults([found('ada@ae.com'), found('grace@univac.com'), notFound()]);
    const table = parse(api.buildBulkCsv().csv);
    assert.equal(table[1][5], 'ada@ae.com');   // Ada
    assert.equal(table[2][5], '');             // the skipped Ghost Corp row
    assert.equal(table[3][5], 'grace@univac.com'); // Grace
    assert.equal(table[4][5], '');             // Alan, not found
    assert.equal(table[4][6], 'Not found');
});

test('a run that stopped early returns what it got, not the whole file', () => {
    const api = harness(LEADS);
    api.setResults([found('ada@ae.com')]);  // stopped after Ada
    const table = parse(api.buildBulkCsv().csv);
    assert.equal(table.length, 2, 'header + Ada only');
    assert.equal(table[1][0], 'Ada');
});

test('a finished run runs to the end of the file, blank rows and all', () => {
    const api = harness(LEADS);
    // all three enrichable rows done, so the trailing originals come too
    api.setResults([found('ada@ae.com'), found('grace@univac.com'), found('alan@npl.uk')]);
    const table = parse(api.buildBulkCsv().csv);
    assert.equal(table.length, 5);
    assert.equal(table[4][0], 'Alan');
});

/* --- the invariant that makes resume safe --------------------------- */

test('a resumed run rebuilds exactly the file an uninterrupted run would', () => {
    const results = [found('ada@ae.com'), found('grace@univac.com'), found('alan@npl.uk')];

    const oneShot = harness(LEADS);
    oneShot.setResults(results);
    const expected = oneShot.buildBulkCsv().csv;

    // Run one: stops after the first row, archiving a chunk as it goes.
    const first = harness(LEADS);
    first.setResults([results[0]]);
    const chunk1 = first.buildBulkCsvChunk(0, 1, true);

    // Run two: picks up at csvData index 1, carrying run one's archive.
    const second = harness(LEADS);
    second.setResults(results.slice(1), 1);
    second.setCarry(chunk1, second.csvSrcOf(0));
    second.setCheckpointSrc(second.csvSrcOf(0) + 1);
    const resumed = second.buildBulkCsv().csv;

    assert.equal(resumed, expected, 'resume must not lose, duplicate or reorder a single line');
});

test('checkpoint chunks concatenate into exactly the one-shot file', () => {
    const results = [found('ada@ae.com'), found('grace@univac.com'), found('alan@npl.uk')];
    const oneShot = harness(LEADS);
    oneShot.setResults(results);
    const expected = oneShot.buildBulkCsv().csv;

    // Checkpoint after every row, the way a live run does.
    const live = harness(LEADS);
    live.setResults(results);
    let archive = '', src = 0;
    for (let upTo = 1; upTo <= 3; upTo++) {
        live.setCheckpointSrc(src);
        archive += live.buildBulkCsvChunk(upTo - 1, upTo, upTo === 1);
        src = live.csvSrcOf(upTo - 1) + 1;
    }
    // The tail flush a completed run does.
    live.setCheckpointSrc(src);
    archive += live.csvRenderRange(src, LEADS.rows.length - 1, false);

    assert.equal(archive, expected, 'the archive must equal the file the user would have downloaded');
});

test('the header is written once, by the first chunk only', () => {
    const api = harness(LEADS);
    api.setResults([found('a@x'), found('b@x')]);
    assert.ok(api.buildBulkCsvChunk(0, 1, true).startsWith('"First Name"'));
    api.setCheckpointSrc(1);
    assert.ok(!api.buildBulkCsvChunk(1, 2, false).includes('First Name'));
});

/* --- the expanding enrichments ------------------------------------- */

const ACCOUNTS = {
    headers: ['Domain', 'Account Owner', 'ARR'],
    rows: [['tesla.com', 'sam@x.com', '120000'], ['acme.com', 'jo@x.com', '4000']],
    inputType: 'company_domain',
    outputType: 'employees',
    mapping: { name: 0 },
};

test('an employee list keeps the account row on every line it produces', () => {
    const api = harness(ACCOUNTS);
    api.setResults([
        { status: 'Found', employees: [{ name: 'Elon', email: 'e@tesla.com' }, { name: 'Drew', email: 'd@tesla.com' }] },
        { status: 'Not found', employees: [] },
    ]);
    const table = parse(api.buildBulkCsv().csv);

    assert.deepEqual(table[0].slice(0, 3), ['Domain', 'Account Owner', 'ARR']);
    assert.equal(table[0][3], 'Employee Name');
    // two employees -> two lines, each still carrying the user's own columns
    assert.deepEqual(table[1].slice(0, 3), ['tesla.com', 'sam@x.com', '120000']);
    assert.deepEqual(table[2].slice(0, 3), ['tesla.com', 'sam@x.com', '120000']);
    assert.equal(table[1][3], 'Elon');
    assert.equal(table[2][3], 'Drew');
    // an account with no employees is still a row
    assert.deepEqual(table[3].slice(0, 3), ['acme.com', 'jo@x.com', '4000']);
    assert.equal(table[3][3], '');
});

/* --- odds and ends -------------------------------------------------- */

test('a ragged row is padded, not shifted into the enrichment columns', () => {
    const api = harness({
        ...LEADS,
        rows: [['Ada', 'Lovelace'], ['Grace', 'Hopper', 'UNIVAC', 'Customer', 'jo@x.com']],
    });
    api.setResults([found('ada@ae.com'), found('grace@univac.com')]);
    const table = parse(api.buildBulkCsv().csv);
    assert.equal(table[1].length, table[0].length);
    assert.equal(table[1][5], 'ada@ae.com', 'the short row must not push the email left');
});

test('commas, quotes and newlines in the original survive the round trip', () => {
    const api = harness({
        ...LEADS,
        rows: [['Ada', 'Lovelace', 'Byron, Noel & Co "AE"', 'Lead\nStage', 'sam@x.com']],
    });
    api.setResults([found('ada@ae.com')]);
    const table = parse(api.buildBulkCsv().csv);
    assert.equal(table[1][2], 'Byron, Noel & Co "AE"');
    assert.equal(table[1][3], 'Lead Stage', 'newlines are flattened, not left to break the row');
});

test('the download is named after the file they uploaded', () => {
    const api = harness(LEADS);
    assert.match(api.csvBaseName(), /^crm-export_enriched_\d{4}-\d{2}-\d{2}$/);
});

test('placeholder values never reach the file as text', () => {
    const api = harness(LEADS);
    api.setResults([{ result: 'Processing...', status: 'Processing' }, notFound()]);
    const csv = api.buildBulkCsv().csv;
    assert.doesNotMatch(csv, /Processing/);
    assert.doesNotMatch(csv, /"Not found","Not found"/);
});
