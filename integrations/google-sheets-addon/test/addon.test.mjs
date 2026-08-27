/**
 * The published Marketplace add-on.
 *
 * This code runs in tens of thousands of people's spreadsheets and existed only
 * in a Google Drive project with no version control until it was committed here.
 * Every test below pins a bug listed in FINDINGS.md, so a future edit to the
 * Drive copy that loses one of these fixes fails here instead of silently
 * charging someone for a column that never gets written.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADDON = join(HERE, '..');
const load = (f) => readFileSync(join(ADDON, f), 'utf8');

/**
 * Apps Script has no modules — the .gs files are plain globals sharing one scope.
 * Evaluating them together in a vm context is the closest thing to how Google
 * runs them, and it means these tests exercise the file that gets pasted into
 * the editor rather than a copy.
 */
function addon(overrides = {}) {
  const ctx = {
    Logger: { log() {} },
    Utilities: { sleep() {} },
    ...overrides,
  };
  vm.createContext(ctx);
  new vm.Script(`${load('Operations.gs')}\n${load('Code.gs')}`).runInContext(ctx, { timeout: 5000 });
  return ctx;
}

const ctx = addon();
const { lfOperation, buildLookupInput, getOperations, columnLetterToNumber, formatResult } = ctx;

const NAME_OP = lfOperation('lead_full_name_to_linkedin_url');
const PLAIN_OP = lfOperation('company_name_to_website');

// ---------------------------------------------------------------------------
// FINDINGS #3 and #4 — the bug a real user reported
// ---------------------------------------------------------------------------

test('a name lookup reads all four columns, not just name and company', () => {
  assert.deepStrictEqual(
    Array.from(NAME_OP.compositeInput.parts, (p) => p.name),
    ['name', 'company', 'location', 'job_title'],
  );
  assert.strictEqual(
    buildLookupInput(NAME_OP, {
      name: 'Bill Gates',
      company: 'Microsoft',
      location: 'Seattle',
      job_title: 'Co-chair',
    }),
    'Bill Gates Microsoft Seattle Co-chair',
  );
});

test('blank columns are dropped instead of leaving double spaces', () => {
  assert.strictEqual(
    buildLookupInput(NAME_OP, { name: 'Bill Gates', company: '', location: 'Seattle', job_title: null }),
    'Bill Gates Seattle',
  );
});

test('a CRM export\'s "Last, First" is flipped, but only for the name', () => {
  assert.strictEqual(
    buildLookupInput(NAME_OP, { name: 'Gates, Bill', company: 'Microsoft' }),
    'Bill Gates Microsoft',
  );
  assert.strictEqual(
    buildLookupInput(NAME_OP, { name: 'Bill Gates', company: 'Gates, Foundation' }),
    'Bill Gates Gates, Foundation',
  );
});

test('a lookup that takes one value is sent that value untouched', () => {
  assert.strictEqual(PLAIN_OP.compositeInput, null);
  assert.strictEqual(buildLookupInput(PLAIN_OP, { input: '  Tesla  ' }), 'Tesla');
});

// ---------------------------------------------------------------------------
// All twenty lookups reach the sidebar
// ---------------------------------------------------------------------------

test('every catalog lookup is offered, priced and categorised', () => {
  const catalog = JSON.parse(readFileSync(join(ADDON, '..', 'catalog', 'operations.json'), 'utf8'));
  const offered = getOperations();

  assert.strictEqual(offered.length, catalog.operations.length);
  assert.deepStrictEqual(
    Array.from(offered, (o) => o.type),
    catalog.operations.map((o) => o.type),
  );

  for (const op of offered) {
    assert.ok(op.label, `${op.type} needs a label`);
    assert.ok(op.category, `${op.type} needs a category`);
    assert.ok(op.credits >= 1, `${op.type} needs a price`);
  }
});

test('the prices match app.html, which is what the account is actually charged', () => {
  const app = readFileSync(join(ADDON, '..', '..', 'app.html'), 'utf8');
  const block = app.slice(app.indexOf('creditCosts'));

  for (const op of getOperations()) {
    const match = block.match(new RegExp(`${op.type}\\s*:\\s*(\\d+)`));
    if (!match) continue; // app.html does not expose every operation
    assert.strictEqual(
      op.credits,
      Number(match[1]),
      `${op.type} is offered at ${op.credits} credits but charged ${match[1]}`,
    );
  }
});

// ---------------------------------------------------------------------------
// FINDINGS #5 — a real failure must never read as "Not found"
// ---------------------------------------------------------------------------

test('an empty result is "Not found", but a provider error is raised', () => {
  assert.strictEqual(formatResult(null, PLAIN_OP), 'Not found');
  assert.strictEqual(formatResult('', PLAIN_OP), 'Not found');
  assert.strictEqual(formatResult([], PLAIN_OP), 'Not found');

  assert.throws(
    () => formatResult({ error: { message: 'full-permission-actor-not-approved' } }, PLAIN_OP),
    /provider error.*not-approved/,
  );
});

test('a list result is flattened into one cell', () => {
  const listOp = lfOperation('company_domain_to_employees');
  assert.strictEqual(
    formatResult([{ firstName: 'A', email: 'a@x.com' }, { firstName: 'B', email: 'b@x.com' }], listOp),
    'a@x.com, b@x.com',
  );
});

test('column letters convert past Z', () => {
  assert.strictEqual(columnLetterToNumber('A'), 1);
  assert.strictEqual(columnLetterToNumber('F'), 6);
  assert.strictEqual(columnLetterToNumber('AA'), 27);
  assert.strictEqual(columnLetterToNumber(3), 3);
});

// ---------------------------------------------------------------------------
// FINDINGS #1, #2 and #6 — what happens to a long sheet
// ---------------------------------------------------------------------------

/** A spreadsheet stub that records every write, so a lost write is visible. */
function fakeSheet(grid) {
  const writes = [];
  const sheet = {
    getLastRow: () => grid.length + 1,
    getRange(row, col, numRows, numCols) {
      if (numRows === undefined) {
        return {
          getValue: () => (row === 1 ? '' : grid[row - 2][col - 1]),
          setValue: (v) => {
            writes.push({ row, col, value: v });
            if (row > 1) grid[row - 2][col - 1] = v;
          },
        };
      }
      return { getValues: () => grid.slice(row - 2, row - 2 + numRows).map((r) => r.slice(0, numCols)) };
    },
  };
  return { sheet, writes, grid };
}

function runWith({ grid, fetch, now }) {
  const board = fakeSheet(grid);
  const ctx = addon({
    SpreadsheetApp: { getActiveSheet: () => board.sheet, flush() {} },
    PropertiesService: { getUserProperties: () => ({ getProperty: () => 'test-key' }) },
    UrlFetchApp: { fetch },
    Date: now ? { now, prototype: Date.prototype } : Date,
  });
  return { ctx, board };
}

const ok = (body) => ({
  getResponseCode: () => 200,
  getContentText: () => JSON.stringify(body),
});

test('results are written row by row, so a run cut short keeps what it paid for', () => {
  const grid = [['Bill Gates', 'Microsoft', ''], ['Elon Musk', 'Tesla', ''], ['Marc Benioff', 'Salesforce', '']];
  const { ctx, board } = runWith({
    grid,
    fetch: () => ok({ result: { linkedin_url: 'https://linkedin.com/in/x' } }),
  });

  ctx.runEnrichment({
    type: 'lead_full_name_to_linkedin_url',
    outputColumn: 'C',
    columns: { name: 'A', company: 'B' },
  });

  const cellWrites = board.writes.filter((w) => w.col === 3 && w.row > 1);
  assert.strictEqual(cellWrites.length, 3, 'each row must be written as it completes');
  assert.deepStrictEqual(Array.from(cellWrites, (w) => w.row), [2, 3, 4]);
});

test('a row that already has an answer is skipped and never charged again', () => {
  let calls = 0;
  const grid = [['Bill Gates', 'Microsoft', 'https://linkedin.com/in/billgates'], ['Elon Musk', 'Tesla', '']];
  const { ctx } = runWith({
    grid,
    fetch: () => {
      calls++;
      return ok({ result: { linkedin_url: 'https://linkedin.com/in/x' } });
    },
  });

  const result = ctx.runEnrichment({
    type: 'lead_full_name_to_linkedin_url',
    outputColumn: 'C',
    columns: { name: 'A', company: 'B' },
  });

  assert.strictEqual(calls, 1, 'only the empty row should cost a credit');
  assert.strictEqual(result.skipped, 1);
  assert.strictEqual(result.processed, 1);
});

test('hitting the six-minute limit stops cleanly and says where to resume', () => {
  const grid = Array.from({ length: 5 }, (_, i) => [`Person ${i}`, 'Acme', '']);
  let clock = 0;
  const { ctx } = runWith({
    grid,
    now: () => (clock += 120_000),          // two minutes per row
    fetch: () => ok({ result: { linkedin_url: 'https://linkedin.com/in/x' } }),
  });

  const result = ctx.runEnrichment({
    type: 'lead_full_name_to_linkedin_url',
    outputColumn: 'C',
    columns: { name: 'A', company: 'B' },
  });

  assert.strictEqual(result.incomplete, true);
  assert.ok(result.resumeRow > 1 && result.resumeRow <= 6, `resumeRow was ${result.resumeRow}`);
  assert.match(result.message, /6-minute/);
  assert.ok(result.processed >= 1, 'the rows it did finish are still written and reported');
});

test('running out of credits stops the run instead of filling every row', () => {
  const grid = Array.from({ length: 4 }, (_, i) => [`Person ${i}`, 'Acme', '']);
  let calls = 0;
  const { ctx, board } = runWith({
    grid,
    fetch: () => {
      calls++;
      return { getResponseCode: () => 402, getContentText: () => '{"message":"no credits"}' };
    },
  });

  const result = ctx.runEnrichment({
    type: 'lead_full_name_to_linkedin_url',
    outputColumn: 'C',
    columns: { name: 'A', company: 'B' },
  });

  assert.strictEqual(calls, 1, 'a 402 cannot fix itself — do not try the next row');
  assert.strictEqual(result.stopped, true);
  assert.match(result.message, /out of credits/i);
  assert.strictEqual(board.writes.filter((w) => w.col === 3 && w.row > 1).length, 1);
});

test('a rejected key stops the run too', () => {
  const grid = [['Bill Gates', 'Microsoft', ''], ['Elon Musk', 'Tesla', '']];
  let calls = 0;
  const { ctx } = runWith({
    grid,
    fetch: () => {
      calls++;
      return { getResponseCode: () => 401, getContentText: () => '{}' };
    },
  });

  const result = ctx.runEnrichment({
    type: 'lead_full_name_to_linkedin_url',
    outputColumn: 'C',
    columns: { name: 'A', company: 'B' },
  });

  assert.strictEqual(calls, 1);
  assert.strictEqual(result.stopped, true);
  assert.match(result.message, /API key/);
});

// ---------------------------------------------------------------------------
// FINDINGS #7 — 202 is a valid answer, not a failure
// ---------------------------------------------------------------------------

test('a 202 with a job is polled rather than treated as an error', () => {
  const grid = [['Bill Gates', 'Microsoft', '']];
  const seen = [];
  const { ctx } = runWith({
    grid,
    fetch: (url, options) => {
      seen.push(url);
      if (options && options.method === 'post') {
        return { getResponseCode: () => 202, getContentText: () => '{"job_id":"j1"}' };
      }
      return ok({ status: 'success', data: { linkedin_url: 'https://linkedin.com/in/billgates' } });
    },
  });

  const result = ctx.runEnrichment({
    type: 'lead_full_name_to_linkedin_url',
    outputColumn: 'C',
    columns: { name: 'A', company: 'B' },
  });

  assert.strictEqual(result.errors, 0, 'a 202 is not an error');
  assert.strictEqual(grid[0][2], 'https://linkedin.com/in/billgates');
  assert.ok(seen.some((u) => u.includes('/status/j1')), 'the job should be polled');
});

test('the old three-argument entry point still works', () => {
  const grid = [['Bill Gates', 'Microsoft', '']];
  const sent = [];
  const { ctx } = runWith({
    grid,
    fetch: (url, options) => {
      sent.push(JSON.parse(options.payload));
      return ok({ result: { linkedin_url: 'https://linkedin.com/in/billgates' } });
    },
  });

  ctx.findLinkedInProfilesFromSelection('A', 'B', 'C');

  assert.strictEqual(sent[0].type, 'lead_full_name_to_linkedin_url');
  assert.strictEqual(sent[0].input_data, 'Bill Gates Microsoft');
});

test('the extra columns reach the API when the sidebar sends them', () => {
  const grid = [['Bill Gates', 'Microsoft', 'Seattle', 'Co-chair', '']];
  const sent = [];
  const { ctx } = runWith({
    grid,
    fetch: (url, options) => {
      sent.push(JSON.parse(options.payload));
      return ok({ result: { email: 'bill@microsoft.com' } });
    },
  });

  ctx.runEnrichment({
    type: 'lead_full_name_to_email',
    outputColumn: 'E',
    columns: { name: 'A', company: 'B', location: 'C', job_title: 'D' },
  });

  assert.strictEqual(sent[0].input_data, 'Bill Gates Microsoft Seattle Co-chair');
});

test('optional params are passed through, blanks are not', () => {
  const grid = [['tesla.com', '']];
  const sent = [];
  const { ctx } = runWith({
    grid,
    fetch: (url, options) => {
      sent.push(JSON.parse(options.payload));
      return ok({ result: [{ email: 'a@tesla.com' }] });
    },
  });

  ctx.runEnrichment({
    type: 'company_domain_to_employees',
    outputColumn: 'B',
    columns: { input: 'A' },
    params: { department: 'Sales', seniority: '', employee_count: 10 },
  });

  assert.strictEqual(sent[0].department, 'Sales');
  assert.strictEqual(sent[0].employee_count, 10);
  assert.ok(!('seniority' in sent[0]), 'an empty param must not be sent');
});

// ---------------------------------------------------------------------------
// The sidebar and the server agree
// ---------------------------------------------------------------------------

test('the sidebar calls only functions the server defines', () => {
  const sidebar = load('Sidebar.html');
  for (const fn of ['getOperations', 'isApiKeyConfigured', 'runEnrichment']) {
    assert.ok(sidebar.includes(`.${fn}(`), `Sidebar.html should call ${fn}`);
    assert.strictEqual(typeof ctx[fn], 'function', `Code.gs or Operations.gs must define ${fn}`);
  }
  assert.ok(load('Settings.html').includes('.saveApiKey('));
  assert.strictEqual(typeof ctx.saveApiKey, 'function');
});

test('the add-on uses no service that would need a new OAuth scope', () => {
  // The published manifest has no oauthScopes block, so Apps Script infers scopes
  // from the code. A new service here means a new scope, which means Google
  // re-verification and the add-on being pulled from the store until it passes.
  const allowed = new Set([
    'SpreadsheetApp', 'PropertiesService', 'UrlFetchApp',
    'Utilities', 'HtmlService', 'Logger',
  ]);

  const source = load('Code.gs') + load('Operations.gs');
  const used = new Set(source.match(/\b[A-Z][A-Za-z]+App\b|\bPropertiesService\b|\bUtilities\b|\bLogger\b/g) ?? []);

  for (const service of used) {
    assert.ok(allowed.has(service), `${service} is a new Apps Script service — that means a new OAuth scope`);
  }
  assert.ok(load('Code.gs').includes('@OnlyCurrentDoc'), '@OnlyCurrentDoc must stay');
});

test('the help page is generated from the catalog and covers every lookup', () => {
  const help = load('Help.html');
  for (const op of getOperations()) {
    assert.ok(help.includes(op.label), `Help.html does not mention ${op.label}`);
  }
  assert.ok(help.includes('still charged'), 'the help must say a miss is charged');
});

test('a finished job returns the value it found, not the envelope around it', () => {
  // The documented status shape is { status, result }. Reading the envelope
  // instead of its `result` wrote "Not found" over a lookup that had succeeded —
  // and had already been charged for.
  const grid = [['nasa.gov', '']];
  const { ctx } = runWith({
    grid,
    fetch: (url, options) =>
      options && options.method === 'post'
        ? { getResponseCode: () => 202, getContentText: () => '{"job_id":"j2"}' }
        : ok({ status: 'done', result: { website: 'https://nasa.gov' } }),
  });

  ctx.runEnrichment({ type: 'company_name_to_website', outputColumn: 'B', columns: { input: 'A' } });
  assert.strictEqual(grid[0][1], 'https://nasa.gov');
});

test('a job that finishes with status "error" fails the row rather than reporting "Not found"', () => {
  const grid = [['VP Sales at B2B SaaS', '']];
  const { ctx } = runWith({
    grid,
    fetch: (url, options) =>
      options && options.method === 'post'
        ? { getResponseCode: () => 202, getContentText: () => '{"job_id":"j3"}' }
        : ok({ status: 'error', message: 'the provider rejected the query' }),
  });

  const result = ctx.runEnrichment({ type: 'leads_finder_ai', outputColumn: 'B', columns: { input: 'A' } });
  assert.strictEqual(result.errors, 1);
  assert.match(String(grid[0][1]), /ERROR.*provider rejected/);
});

test('a job that never finishes fails the row instead of hanging the whole run', () => {
  const grid = [['VP Sales at B2B SaaS', ''], ['CTO at fintechs', '']];
  const { ctx } = runWith({
    grid,
    fetch: (url, options) =>
      options && options.method === 'post'
        ? { getResponseCode: () => 202, getContentText: () => '{"job_id":"j4"}' }
        : ok({ status: 'processing' }),
  });

  const result = ctx.runEnrichment({ type: 'leads_finder_ai', outputColumn: 'B', columns: { input: 'A' } });
  assert.strictEqual(result.errors, 2, 'a stuck job is one bad row, not a dead run');
  assert.match(String(grid[0][1]), /Still running/);
});
