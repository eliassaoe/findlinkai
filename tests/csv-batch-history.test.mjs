import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Both halves of the CSV-enrichment history feature are pulled straight out of
// the shipped HTML, so the test cannot drift from what users get. If a marker
// moves, this fails loudly rather than silently checking nothing.
const appSrc = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const historySrc = readFileSync(new URL('../history.html', import.meta.url), 'utf8');

function slice(src, startMark, endMark, label) {
    const start = src.indexOf(startMark);
    assert.ok(start > 0, `could not find "${startMark}" (${label})`);
    const end = src.indexOf(endMark, start);
    assert.ok(end > start, `could not find "${endMark}" (${label})`);
    return src.slice(start, end);
}

/* ------------------------------------------------------------------ */
/* app.html — writing the batch                                        */
/* ------------------------------------------------------------------ */

const writerBlock = slice(
    appSrc,
    'function csvBatchHeaders()',
    'async function processBulk()',
    'app.html batch writer'
);

function writerHarness({ bulkResults = [], csvData = [], csvOut = 'a,b\n1,2\n', fetchImpl, batchId = null } = {}) {
    const calls = [];
    const ctx = {
        userToken: 'tok_abcdefgh',
        currentInputType: 'lead_full_name',
        currentOutputType: 'email',
        lfUploadedFileName: 'crm-export.csv',
        currentCsvBatchId: batchId,
        bulkResults,
        csvData,
        CSV_BATCH_ENDPOINT: 'https://db.example/rest/v1/csv_enrichment_batches',
        CSV_BATCH_SUPABASE_ANON_KEY: 'anon_key',
        CSV_BATCH_MAX_CSV_CHARS: 4000000,
        dataConfigurations: {
            lead_full_name: {
                label: 'Enter Lead Full Name + Company Name',
                outputs: { linkedin_url: 'LinkedIn Profile URL', email: 'Verified Email' }
            }
        },
        generateCombinationType: (i, o) => `${i}_to_${o}`,
        buildBulkCsv: () => ({ csv: csvOut, baseName: 'linkfinder_ai_enriched_data_2026-08-27' }),
        posthog: { capture: () => {} },
        fetch: fetchImpl || (async (url, opts) => {
            calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
            return { ok: true, json: async () => [{ id: 'batch-1' }] };
        })
    };
    const fn = new Function(...Object.keys(ctx),
        writerBlock +
        '; return { csvBatchCreate, csvBatchUpdate, csvBatchLabel, csvBatchFoundRows, csvBatchFinalize,' +
        '  get batchId(){ return currentCsvBatchId; },' +
        '  get results(){ return bulkResults; } };');
    return { api: fn(...Object.values(ctx)), calls };
}

const rows = (statuses) => statuses.map((status, i) => ({ inputData: `row ${i}`, status }));

test('opening a batch records the file, the enrichment and the row count', async () => {
    const { api, calls } = writerHarness({ csvData: new Array(500) });
    const id = await api.csvBatchCreate(500);
    assert.equal(id, 'batch-1');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, {
        user_id: 'tok_abcdefgh',
        file_name: 'crm-export.csv',
        label: 'Lead Full Name + Company Name → Verified Email',
        type: 'lead_full_name_to_email',
        input_type: 'lead_full_name',
        output_type: 'email',
        total_rows: 500,
        status: 'processing'
    });
});

test('a batch that never opened is never written to', async () => {
    const { api, calls } = writerHarness({ batchId: null });
    await api.csvBatchFinalize(10, 70, false);
    assert.equal(calls.length, 0);
});

test('a Supabase outage never breaks the enrichment', async () => {
    const { api } = writerHarness({ batchId: 'batch-1', fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(await api.csvBatchCreate(10), null);
    await assert.doesNotReject(api.csvBatchFinalize(10, 70, false));
});

test('a full run is completed, and archives the exact export CSV', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1',
        csvData: new Array(3),
        bulkResults: rows(['Found', 'Not found', 'Found']),
        csvOut: 'Name,Email\nJohn,john@acme.com\n'
    });
    await api.csvBatchFinalize(3, 21, false);

    const patch = calls.at(-1);
    assert.equal(patch.method, 'PATCH');
    assert.ok(patch.url.includes('id=eq.batch-1'));
    assert.equal(patch.body.status, 'completed');
    assert.equal(patch.body.processed_rows, 3);
    assert.equal(patch.body.found_rows, 2);
    assert.equal(patch.body.credits_used, 21);
    assert.equal(patch.body.result_csv, 'Name,Email\nJohn,john@acme.com\n');
    assert.equal(patch.body.result_filename, 'linkfinder_ai_enriched_data_2026-08-27.csv');
});

test('running out of credits is recorded as such, not as a completed file', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1',
        csvData: new Array(500),
        bulkResults: rows(['Found', 'Found'])
    });
    await api.csvBatchFinalize(2, 14, true);
    assert.equal(calls.at(-1).body.status, 'out_of_credits');
    assert.equal(calls.at(-1).body.processed_rows, 2);
});

test('a run stopped short of the file is marked stopped', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1',
        csvData: new Array(500),
        bulkResults: rows(['Found'])
    });
    await api.csvBatchFinalize(1, 7, false);
    assert.equal(calls.at(-1).body.status, 'stopped');
});

test('the row still in flight when credits ran dry stays out of the saved file', async () => {
    const { api } = writerHarness({
        batchId: 'batch-1',
        csvData: new Array(5),
        bulkResults: rows(['Found', 'Found', 'Processing'])
    });
    await api.csvBatchFinalize(2, 14, true);
    // buildBulkCsv reads the live array, so it must be handed back untouched.
    assert.deepEqual(api.results.map(r => r.status), ['Found', 'Found', 'Processing']);
});

test('an archive too large to POST is skipped, but the run is still tracked', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1',
        csvData: new Array(1),
        bulkResults: rows(['Found']),
        csvOut: 'x'.repeat(4000001)
    });
    await api.csvBatchFinalize(1, 7, false);
    assert.equal(calls.at(-1).body.result_csv, undefined);
    assert.equal(calls.at(-1).body.status, 'completed');
});

/* ------------------------------------------------------------------ */
/* history.html — reading the batch back                               */
/* ------------------------------------------------------------------ */

const readerBlock = slice(
    historySrc,
    'const CSV_BATCH_STALE_MS',
    'async function downloadCsvBatch(',
    'history.html batch reader'
);

function readerHarness(batches, filtered) {
    const el = (id) => ({ id, textContent: '', innerHTML: '', classList: { _h: true, add() { this._h = true; }, remove() { this._h = false; } } });
    const nodes = { csvSection: el('csvSection'), csvList: el('csvList'), csvSectionSub: el('csvSectionSub') };
    const ctx = {
        csvBatches: batches,
        filteredCsvBatches: filtered === undefined ? batches : filtered,
        esc: (s) => String(s || ''),
        timeAgo: () => '2d ago',
        fullTimestamp: () => '25 Aug 2026, 09:00',
        formatCredits: (n) => String(n),
        getTypeInfo: () => ({ label: 'Enrichment' }),
        document: { getElementById: (id) => nodes[id] }
    };
    const fn = new Function(...Object.keys(ctx),
        readerBlock + '; return { csvBatchState, pct, formatBytes, renderCsvBatches };');
    return { api: fn(...Object.values(ctx)), nodes };
}

const batch = (over = {}) => Object.assign({
    id: 'b1',
    file_name: 'crm-export.csv',
    label: 'Lead Full Name + Company Name → Verified Email',
    type: 'lead_full_name_to_email',
    total_rows: 500,
    processed_rows: 500,
    found_rows: 310,
    credits_used: 2170,
    status: 'completed',
    result_filename: 'linkfinder_ai_enriched_data_2026-08-27.csv',
    result_bytes: 24576,
    started_at: '2026-08-25T09:00:00Z',
    updated_at: '2026-08-25T09:20:00Z'
}, over);

test('a finished file shows its enrichment rate and offers the download', () => {
    const { api, nodes } = readerHarness([batch()]);
    api.renderCsvBatches();
    assert.equal(nodes.csvSection.classList._h, false, 'section must be visible');
    assert.match(nodes.csvList.innerHTML, /62% enriched/);
    assert.match(nodes.csvList.innerHTML, /500 of 500 rows processed/);
    assert.match(nodes.csvList.innerHTML, /crm-export\.csv/);
    assert.match(nodes.csvList.innerHTML, /downloadCsvBatch\('b1'/);
    assert.match(nodes.csvList.innerHTML, /Download results · 24 KB/);
});

test('the legend accounts for every row in the file', () => {
    const { api, nodes } = readerHarness([batch({ processed_rows: 320, found_rows: 198, status: 'out_of_credits' })]);
    api.renderCsvBatches();
    assert.match(nodes.csvList.innerHTML, /198 enriched/);
    assert.match(nodes.csvList.innerHTML, /122 no match/);   // 320 processed - 198 found
    assert.match(nodes.csvList.innerHTML, /180 not processed/); // 500 total - 320 processed
    assert.match(nodes.csvList.innerHTML, /Out of credits/);
});

test('a run still going offers no download, only an explanation', () => {
    const fresh = new Date().toISOString();
    const { api, nodes } = readerHarness([
        batch({ status: 'processing', processed_rows: 120, found_rows: 70, result_bytes: null, updated_at: fresh, started_at: fresh })
    ]);
    api.renderCsvBatches();
    assert.match(nodes.csvList.innerHTML, /Running/);
    assert.doesNotMatch(nodes.csvList.innerHTML, /downloadCsvBatch/);
});

test('a run whose tab was closed reads as interrupted, not as still running', () => {
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { api } = readerHarness([]);
    assert.equal(api.csvBatchState({ status: 'processing', updated_at: stale }).label, 'Interrupted');
    assert.equal(api.csvBatchState({ status: 'processing', updated_at: new Date().toISOString() }).label, 'Running');
});

test('a batch with no archived file says so instead of a dead button', () => {
    const { api, nodes } = readerHarness([batch({ result_bytes: null })]);
    api.renderCsvBatches();
    assert.match(nodes.csvList.innerHTML, /No file saved for this run/);
    assert.doesNotMatch(nodes.csvList.innerHTML, /downloadCsvBatch/);
});

test('no CSV runs at all hides the whole section', () => {
    const { api, nodes } = readerHarness([]);
    api.renderCsvBatches();
    assert.equal(nodes.csvSection.classList._h, true);
});

test('a search that matches no file says so rather than showing nothing', () => {
    // renderCsvBatches lists filteredCsvBatches, which the search box narrows,
    // but the section header still counts everything the user has.
    const { api, nodes } = readerHarness([batch()], []);
    api.renderCsvBatches();
    assert.equal(nodes.csvSection.classList._h, false, 'section stays open so the box is still reachable');
    assert.match(nodes.csvList.innerHTML, /No CSV files match your search/);
    assert.match(nodes.csvSectionSub.textContent, /1 file · 310 rows enriched/);
});

test('percentages never exceed 100 and never divide by zero', () => {
    const { api } = readerHarness([]);
    assert.equal(api.pct(5, 0), 0);
    assert.equal(api.pct(600, 500), 100);
    assert.equal(api.pct(0, 500), 0);
});

test('archive sizes read in human units', () => {
    const { api } = readerHarness([]);
    assert.equal(api.formatBytes(0), '');
    assert.equal(api.formatBytes(512), '512 B');
    assert.equal(api.formatBytes(24576), '24 KB');
    assert.equal(api.formatBytes(3 * 1024 * 1024), '3.0 MB');
});

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

test('processBulk opens, updates and closes the batch', () => {
    assert.match(appSrc, /currentCsvBatchId = await csvBatchCreate\(csvData\.length\)/);
    assert.match(appSrc, /processedCount % CSV_BATCH_PROGRESS_EVERY === 0/);
    assert.match(appSrc, /await csvBatchFinalize\(processedCount, creditsConsumed, creditsExhausted\)/);
});

test('the uploaded file name is captured for every upload path', () => {
    assert.match(appSrc, /lfUploadedFileName = file\.name \|\| ''/);
});

test('the history list never pulls the archived CSV with it', () => {
    const fields = slice(historySrc, 'const CSV_BATCH_FIELDS', ';\n', 'batch field list');
    assert.doesNotMatch(fields, /result_csv/);
    assert.match(fields, /result_bytes/);
});

test('the download is scoped to the caller\'s own token', () => {
    const dl = slice(historySrc, 'async function downloadCsvBatch(', 'async function loadCsvBatches(', 'download');
    assert.match(dl, /user_id=eq\.\$\{encodeURIComponent\(userToken\)\}/);
});
