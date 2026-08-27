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
    '/* ---------------------------------------------------------------------\n   Resume',
    'app.html batch writer'
);

function writerHarness({ results = [], rows = [], batchId = null, resumeFrom = 0, carry = '', fetchImpl } = {}) {
    const calls = [];
    const ctx = {
        userToken: 'tok_abcdefgh',
        currentInputType: 'lead_full_name',
        currentOutputType: 'email',
        lfUploadedFileName: 'crm-export.csv',
        lfCsvHeaders: ['Name', 'Company'],
        lfCsvRows: rows,
        lfMapping: { name: 0, company: 1 },
        currentCsvBatchId: batchId,
        bulkResults: results,
        csvData: rows.map((r, i) => ({ srcIndex: i, inputData: r[0], name: r[0], company: r[1] })),
        csvResumeFrom: resumeFrom,
        csvResumeFoundRows: 0,
        csvResumeCredits: 0,
        csvCheckpointSlot: 0,
        csvCheckpointRow: resumeFrom,
        csvCheckpointSrc: resumeFrom,
        bulkCarryCsv: carry,
        bulkCarryEndSrc: resumeFrom - 1,
        CSV_BATCH_ENDPOINT: 'https://db.example/rest/v1/csv_enrichment_batches',
        CSV_BATCH_CHECKPOINT_RPC: 'https://db.example/rest/v1/rpc/csv_batch_checkpoint',
        CSV_BATCH_SUPABASE_ANON_KEY: 'anon_key',
        CSV_BATCH_MAX_INPUT_CHARS: 25000000,
        dataConfigurations: {
            lead_full_name: {
                label: 'Enter Lead Full Name + Company Name',
                outputs: { linkedin_url: 'LinkedIn Profile URL', email: 'Verified Email' }
            }
        },
        generateCombinationType: (i, o) => `${i}_to_${o}`,
        // The export builder is covered on its own in csv-export-shape.test.mjs.
        csvBaseName: () => 'crm-export_enriched_2026-08-27',
        buildBulkCsvChunk: (from, upTo, header) =>
            (header ? 'HEADER\n' : '') + results.slice(from, upTo).map(r => `${r.inputData}\n`).join(''),
        csvRenderRange: (fromSrc, toSrc) => rows.slice(fromSrc, toSrc + 1).map(r => `tail:${r[0]}\n`).join(''),
        csvSrcOf: (i) => i,
        posthog: { capture: () => {} },
        fetch: fetchImpl || (async (url, opts) => {
            calls.push({ url, method: opts.method, body: JSON.parse(opts.body) });
            const isRpc = url.includes('/rpc/');
            return {
                ok: true,
                json: async () => isRpc ? JSON.parse(opts.body).p_processed : [{ id: 'batch-1' }]
            };
        })
    };
    const api = new Function(...Object.keys(ctx),
        writerBlock +
        `; return { csvBatchCreate, csvBatchStoreInput, csvBatchUpdate, csvBatchCheckpoint, csvBatchFinalize, csvBatchLabel,
            get batchId(){ return currentCsvBatchId; },
            get checkpointRow(){ return csvCheckpointRow; },
            get checkpointSlot(){ return csvCheckpointSlot; },
            get results(){ return bulkResults; } };`)(...Object.values(ctx));
    return { api, calls };
}

const LEADS = [['Ada', 'AE'], ['Grace', 'UNIVAC'], ['Alan', 'NPL'], ['Edsger', 'THE']];
const res = (name, status = 'Found') => ({ inputData: name, status });

test('opening a batch records the file and the enrichment', async () => {
    const { api, calls } = writerHarness({ rows: LEADS });
    const id = await api.csvBatchCreate(4);
    assert.equal(id, 'batch-1');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].body.file_name, 'crm-export.csv');
    assert.equal(calls[0].body.label, 'Lead Full Name + Company Name → Verified Email');
    assert.equal(calls[0].body.total_rows, 4);
    assert.equal(calls[0].body.file_rows, 4);
    assert.equal(calls[0].body.status, 'processing');
    // The grid is a separate, unawaited request — a wide export runs to
    // megabytes and must not stand between the user and their first result.
    assert.equal(calls[0].body.input_rows, undefined);
});

test('the uploaded grid is stored separately, with everything a resume needs', async () => {
    const { api, calls } = writerHarness({ rows: LEADS });
    assert.equal(await api.csvBatchStoreInput('batch-1'), true);
    assert.equal(calls[0].method, 'PATCH');
    assert.ok(calls[0].url.includes('id=eq.batch-1'));
    assert.deepEqual(calls[0].body.input_rows, LEADS);
    assert.deepEqual(calls[0].body.csv_headers, ['Name', 'Company']);
    assert.deepEqual(calls[0].body.column_mapping, { name: 0, company: 1 });
});

test('a wide CRM export still gets stored', async () => {
    // 10,000 rows, 40 columns — the shape the old 6 MB ceiling turned away.
    const wide = Array.from({ length: 10000 }, (_, i) =>
        Array.from({ length: 40 }, (_, c) => `r${i}c${c}value`));
    const { api, calls } = writerHarness({ rows: wide });
    assert.equal(await api.csvBatchStoreInput('batch-1'), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.input_rows.length, 10000);
});

test('a grid too big for the browser to hold is skipped, and the run carries on', async () => {
    const huge = Array.from({ length: 400000 }, (_, i) => [`n${i}`, 'x'.repeat(60)]);
    const { api, calls } = writerHarness({ rows: huge });
    assert.equal(await api.csvBatchStoreInput('batch-1'), false);
    assert.equal(calls.length, 0, 'never even attempted');
});

test('a gateway that refuses the grid is not retried, and never breaks the run', async () => {
    let attempts = 0;
    const { api } = writerHarness({
        rows: LEADS,
        fetchImpl: async () => { attempts++; return { ok: false, status: 413, json: async () => ({}) }; }
    });
    assert.equal(await api.csvBatchStoreInput('batch-1'), false);
    assert.equal(attempts, 1, 'a 413 is an answer — the same payload will not fit next time either');
});

test('storing the grid failing leaves the batch tracked, just not resumable', async () => {
    const { api } = writerHarness({ rows: LEADS, fetchImpl: async () => { throw new Error('offline'); } });
    await assert.doesNotReject(api.csvBatchStoreInput('batch-1'));
    assert.equal(await api.csvBatchStoreInput('batch-1'), false);
});

test('a checkpoint appends only the rows finished since the last one', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1', rows: LEADS, results: [res('Ada'), res('Grace')]
    });
    await api.csvBatchCheckpoint(1, 7);
    assert.equal(calls[0].body.p_from_row, 0);
    assert.equal(calls[0].body.p_processed, 1);
    assert.equal(calls[0].body.p_chunk, 'HEADER\nAda\n', 'first chunk carries the header');

    await api.csvBatchCheckpoint(2, 14);
    assert.equal(calls[1].body.p_from_row, 1, 'must continue where the last one ended');
    assert.equal(calls[1].body.p_chunk, 'Grace\n', 'no second header, and no resent rows');
});

test('a checkpoint that lands out of step does not advance the cursor', async () => {
    // The RPC answers with the row's real processed_rows; a mismatch means
    // somebody else moved it and our chunk was not applied.
    const { api } = writerHarness({
        batchId: 'batch-1', rows: LEADS, results: [res('Ada')],
        fetchImpl: async () => ({ ok: true, json: async () => 99 })
    });
    await api.csvBatchCheckpoint(1, 7);
    assert.equal(api.checkpointRow, 0, 'cursor must stay put so the chunk is retried in order');
    assert.equal(api.checkpointSlot, 0);
});

test('nothing new means no request at all', async () => {
    const { api, calls } = writerHarness({ batchId: 'batch-1', rows: LEADS, results: [res('Ada')] });
    await api.csvBatchCheckpoint(0, 0);
    assert.equal(calls.length, 0);
});

test('a resumed run carries the earlier credits and finds into its counters', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1', rows: LEADS, results: [res('Alan')], resumeFrom: 2, carry: 'HEADER\nAda\nGrace\n'
    });
    await api.csvBatchCheckpoint(1, 7);
    assert.equal(calls[0].body.p_from_row, 2, 'picks up at the stored cursor');
    assert.equal(calls[0].body.p_processed, 3);
    assert.equal(calls[0].body.p_chunk, 'Alan\n', 'a resumed archive already has its header');
});

test('a full run is closed as completed and flushes the trailing rows', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1', rows: LEADS,
        results: [res('Ada'), res('Grace'), res('Alan'), res('Edsger')]
    });
    await api.csvBatchFinalize(4, 28, false);
    const patch = calls.at(-1);
    assert.equal(patch.method, 'PATCH');
    assert.equal(patch.body.status, 'completed');
    assert.ok(patch.body.completed_at);
    assert.equal(api.batchId, null);
});

test('running out of credits is recorded as such, and leaves the tail alone', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1', rows: LEADS, results: [res('Ada'), res('Grace')]
    });
    await api.csvBatchFinalize(2, 14, true);
    assert.equal(calls.at(-1).body.status, 'out_of_credits');
    // A resume continues at row 2 — appending the unrun rows now would put them
    // in the file ahead of their own enrichment.
    assert.ok(!calls.some(c => String(c.body.p_chunk || '').includes('tail:')));
});

test('a run stopped short is marked stopped, so it can be picked up', async () => {
    const { api, calls } = writerHarness({
        batchId: 'batch-1', rows: LEADS, results: [res('Ada')]
    });
    await api.csvBatchFinalize(1, 7, false);
    assert.equal(calls.at(-1).body.status, 'stopped');
});

test('a batch that never opened is never written to', async () => {
    const { api, calls } = writerHarness({ batchId: null, rows: LEADS });
    await api.csvBatchFinalize(10, 70, false);
    assert.equal(calls.length, 0);
});

test('a Supabase outage never breaks the enrichment', async () => {
    const { api } = writerHarness({
        batchId: 'batch-1', rows: LEADS, results: [res('Ada')],
        fetchImpl: async () => { throw new Error('offline'); }
    });
    assert.equal(await api.csvBatchCreate(4), null);
    await assert.doesNotReject(api.csvBatchCheckpoint(1, 7));
    await assert.doesNotReject(api.csvBatchFinalize(1, 7, false));
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
        readerBlock + '; return { csvBatchState, pct, formatBytes, renderCsvBatches, csvBatchResumable };');
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
    input_bytes: 40960,
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

test('a background run is the server\'s, and never goes stale', () => {
    const { api } = readerHarness([]);
    const ancient = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    // A tab run with no browser behind it is dead; a queued one is not, because
    // nothing about it depends on a browser staying open.
    assert.equal(api.csvBatchState({ status: 'queued', updated_at: ancient }).label, 'Running in background');
    assert.equal(api.csvBatchState({ status: 'processing', updated_at: ancient }).label, 'Interrupted');
});

test('a background run offers no buttons, only what it is doing', () => {
    const { api, nodes } = readerHarness([batch({ status: 'queued', processed_rows: 120, found_rows: 90 })]);
    api.renderCsvBatches();
    assert.match(nodes.csvList.innerHTML, /nothing to keep open/);
    assert.doesNotMatch(nodes.csvList.innerHTML, /resumeCsvBatch/, 'resuming in a tab would double-run it');
    assert.doesNotMatch(nodes.csvList.innerHTML, /backgroundCsvBatch/, 'it is already in the background');
});

test('a stopped run can be finished without a browser at all', () => {
    const { api, nodes } = readerHarness([batch({ status: 'stopped', processed_rows: 320, found_rows: 198 })]);
    api.renderCsvBatches();
    assert.match(nodes.csvList.innerHTML, /backgroundCsvBatch\('b1'/);
    assert.match(nodes.csvList.innerHTML, /Finish 180 rows/);
});

test('handing a batch over is scoped to the caller and resets the lease', () => {
    const fn = slice(historySrc, 'async function backgroundCsvBatch(', 'async function loadCsvBatches(', 'handover');
    assert.match(fn, /user_id=eq\.\$\{encodeURIComponent\(userToken\)\}/);
    assert.match(fn, /status: 'queued'/);
    assert.match(fn, /locked_until: null/, 'a stale lease would delay the pickup');
    assert.match(fn, /attempts: 0/, 'a fresh hand-over deserves a fresh attempt count');
});

test('leaving hands the rest over when the grid is stored, and parks it when not', () => {
    const fn = slice(appSrc, 'function flushCsvBatchOnExit()', "csvExitFlushed = true", 'exit flush');
    assert.match(fn, /const handOver = csvKeepRunning && csvBatchStoredInput/,
        'promising a background finish without the stored file would be a lie');
    assert.match(fn, /status: 'queued'/);
    assert.match(fn, /status: 'stopped'/);
});

test('taking a batch back into the tab stops the server claiming it', () => {
    const body = slice(appSrc, 'async function processBulk(resuming) {', '// Add these new functions after processBulk', 'processBulk');
    assert.match(body, /if \(resuming && currentCsvBatchId\)/);
    assert.match(body, /status: 'processing'/, 'only queued rows are claimable, so this is the guard');
});

test('a dead run is recognised in a minute and a half, not fifteen', () => {
    const { api } = readerHarness([]);
    const quiet = (secs) => new Date(Date.now() - secs * 1000).toISOString();
    assert.equal(api.csvBatchState({ status: 'processing', updated_at: quiet(30) }).label, 'Running');
    assert.equal(api.csvBatchState({ status: 'processing', updated_at: quiet(120) }).label, 'Interrupted');
});

test('a live run keeps the page re-reading, a finished one does not', () => {
    const fn = slice(historySrc, 'function scheduleCsvPoll()', 'document.addEventListener(\'visibilitychange\'', 'poll');
    assert.match(fn, /if \(!live\) return/, 'no polling once nothing is running');
    assert.match(fn, /document\.hidden/, 'a background tab should not poll');
});

test('a run whose tab was closed reads as interrupted, not as still running', () => {
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { api } = readerHarness([]);
    assert.equal(api.csvBatchState({ status: 'processing', updated_at: stale }).label, 'Interrupted');
    assert.equal(api.csvBatchState({ status: 'processing', updated_at: new Date().toISOString() }).label, 'Running');
});

test('a run that stopped part way offers to pick up the rows it never reached', () => {
    const { api, nodes } = readerHarness([batch({ processed_rows: 320, found_rows: 198, status: 'out_of_credits' })]);
    api.renderCsvBatches();
    assert.match(nodes.csvList.innerHTML, /Finish 180 rows/, '500 total - 320 processed');
    assert.match(nodes.csvList.innerHTML, /backgroundCsvBatch\('b1'/);
    // And the partial file is still there to take meanwhile.
    assert.match(nodes.csvList.innerHTML, /downloadCsvBatch\('b1'/);
    assert.match(nodes.csvList.innerHTML, /Download what is enriched/);
});

test('there is one way to finish a stopped run, not two', () => {
    // Resuming in the tab did the same job slower and made the user watch it.
    // Two buttons for one outcome is a choice nobody benefits from making.
    const { api, nodes } = readerHarness([batch({ status: 'stopped', processed_rows: 320, found_rows: 198 })]);
    api.renderCsvBatches();
    assert.doesNotMatch(nodes.csvList.innerHTML, /resumeCsvBatch/);
    assert.doesNotMatch(historySrc, /function resumeCsvBatch/, 'the in-tab handoff should be gone from History');
});

test('a finished run has nothing to resume', () => {
    const { api, nodes } = readerHarness([batch()]);
    api.renderCsvBatches();
    assert.doesNotMatch(nodes.csvList.innerHTML, /resumeCsvBatch/);
    assert.match(nodes.csvList.innerHTML, /Download results/);
});

test('a run whose file was too large to store cannot be resumed', () => {
    const { api } = readerHarness([]);
    assert.equal(api.csvBatchResumable(batch({ status: 'stopped', processed_rows: 100, input_bytes: null })), false);
    assert.equal(api.csvBatchResumable(batch({ status: 'stopped', processed_rows: 100 })), true);
    assert.equal(api.csvBatchResumable(batch({ status: 'completed', processed_rows: 500 })), false);
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

test('processBulk opens, checkpoints and closes the batch', () => {
    assert.match(appSrc, /currentCsvBatchId = await csvBatchCreate\(csvData\.length\)/);
    assert.match(appSrc, /await csvBatchCheckpoint\(processedCount, creditsConsumed\)/);
    assert.match(appSrc, /await csvBatchFinalize\(processedCount, creditsConsumed, creditsExhausted\)/);
});

test('a resumed run starts at the cursor and indexes its own rows', () => {
    const body = slice(appSrc, 'async function processBulk(resuming) {', '// Add these new functions after processBulk', 'processBulk');
    assert.match(body, /for \(let i = csvResumeFrom; i < csvData\.length; i\+\+\)/);
    assert.match(body, /const slot = i - csvResumeFrom/);
    assert.doesNotMatch(body, /bulkResults\[i\]/, 'absolute indexing breaks a resumed run');
    assert.match(body, /if \(!resuming\)/, 'a resume must not open a second batch row');
});

test('the enrichment never waits on the uploaded grid being stored', () => {
    const body = slice(appSrc, 'async function processBulk(resuming) {', '// Add these new functions after processBulk', 'processBulk');
    assert.match(body, /csvBatchStoreInput\(currentCsvBatchId\)\.then\(/, 'must be fired, not awaited');
    assert.doesNotMatch(body, /await csvBatchStoreInput/);
});

test('a small run saves after every row, and the first row always saves', () => {
    // The bug this replaces: 10-rows-or-20-seconds meant a five-row file
    // checkpointed exactly never, and sat in History at "0% · Running" having
    // really enriched most of itself.
    const body = slice(appSrc, 'async function processBulk(resuming) {', '// Add these new functions after processBulk', 'processBulk');
    assert.match(body, /csvData\.length <= CSV_BATCH_SMALL_RUN \? 1 : CSV_BATCH_PROGRESS_EVERY/);
    assert.match(body, /isFirst = processedCount === 1/);
    assert.match(body, /isFirst \|\| dueRows \|\| dueTime/);
});

test('leaving the page saves the rows already paid for', () => {
    const fn = slice(appSrc, 'function flushCsvBatchOnExit()', "csvExitFlushed = true", 'exit flush');
    assert.match(fn, /keepalive: ?true/, 'the request must outlive the page');
    assert.match(fn, /status: 'stopped'/, 'History must stop claiming it is running');
    // Advancing the counters without their rows would make a resume skip rows
    // that never made it into the file.
    assert.match(fn, /if\(done > csvCheckpointSlot\)/);
    assert.match(fn, /body\.length < 55000/, 'keepalive bodies are capped');
});

test('the exit flush fires on pagehide, not only beforeunload', () => {
    const fn = slice(appSrc, 'function setupRefreshWarning()', 'function handleBeforeUnload', 'refresh warning');
    assert.match(fn, /'pagehide',flushCsvBatchOnExit/);
});

test('a run still live in another tab is not offered for resume', () => {
    const fn = slice(appSrc, 'async function checkUnfinishedCsvBatch()', 'function showResumeCsvBanner(', 'unfinished check');
    assert.match(fn, /CSV_BATCH_STALE_MS/, 'resuming a live run would double-charge the overlap');
    assert.match(fn, /input_rows=not\.is\.null/, 'no stored file means nothing to resume');
});

test('a transient failure is retried before it becomes a lost row', () => {
    const fn = slice(appSrc, 'async function bulkFetchWithRetry(', '// `resuming` is true', 'retry helper');
    assert.match(fn, /attempt <= CSV_ROW_RETRIES/);
    assert.match(fn, /res\.ok \|\| res\.status < 500/, 'a 4xx is an answer, not a blip');
});

test('the uploaded file name is captured for every upload path', () => {
    assert.match(appSrc, /lfUploadedFileName = file\.name \|\| ''/);
});

test('the history list never pulls the archived CSV with it', () => {
    const fields = slice(historySrc, 'const CSV_BATCH_FIELDS', ';\n', 'batch field list');
    assert.doesNotMatch(fields, /result_csv/);
    assert.doesNotMatch(fields, /input_rows/, 'the stored upload is far too large to list');
    assert.match(fields, /result_bytes/);
    assert.match(fields, /input_bytes/);
});

test('the load banner queues the file where the user stands, and goes nowhere', () => {
    // It used to navigate into the app and set up an in-tab run. Now it hands
    // the file to the server in place.
    const fn = slice(appSrc, 'async function finishCsvBatchInBackground(', '// Kept, but no longer offered', 'banner handoff');
    assert.match(fn, /status: 'queued'/);
    assert.match(fn, /user_id=eq\.\$\{encodeURIComponent\(userToken\)\}/);
    assert.doesNotMatch(fn, /window\.location/, 'queueing should not move the user off the page');
    assert.match(appSrc, /onclick="finishCsvBatchInBackground/, 'the banner button must call it');
});

test('the in-tab resume survives as an escape hatch, just unadvertised', () => {
    // ?resume=<id> is the only caller of processBulk(true) now. Keeping it costs
    // nothing; ripping it out of the enrichment loop for tidiness would not.
    assert.match(appSrc, /const resumeId = new URLSearchParams\(window\.location\.search\)\.get\('resume'\)/);
    assert.match(appSrc, /async function resumeCsvBatch\(batchId\)/);
});

test('the download is scoped to the caller\'s own token', () => {
    const dl = slice(historySrc, 'async function downloadCsvBatch(', 'async function loadCsvBatches(', 'download');
    assert.match(dl, /user_id=eq\.\$\{encodeURIComponent\(userToken\)\}/);
});
