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

  let checked = 0;
  for (const op of getOperations()) {
    const match = block.match(new RegExp(`\\b${op.type}['\"]?\\s*:\\s*(\\d+)`));
    if (!match) continue; // app.html does not expose every operation
    assert.strictEqual(
      op.credits,
      Number(match[1]),
      `${op.type} is offered at ${op.credits} credits but charged ${match[1]}`,
    );
    checked++;
  }
  // Without this the regex could stop matching and the test would pass on zero
  // comparisons — which is exactly what it did until the quoted keys were handled.
  assert.ok(checked >= 8, `only ${checked} prices compared against app.html`);
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

test('a result with many fields is spread across columns, not stringified', () => {
  // The old behaviour: every multi-field result collapsed to one value, so a
  // 10-credit profile lookup landed as JSON in a single cell.
  const profile = lfOperation('linkedin_profile_to_linkedin_info');
  const fields = ctx.fieldsFor(profile, null);

  // Array.from rebuilds these in this realm: the .gs files run in a vm context,
  // and deepStrictEqual compares prototypes across realms.
  assert.deepStrictEqual(Array.from(fields, (f) => profile.labels[f]), [
    'Name', 'Job Title', 'Company', 'Location', 'Email', 'Phone', 'LinkedIn URL', 'Industry', 'Headline',
  ]);

  assert.deepStrictEqual(
    Array.from(ctx.rowFor({ name: 'Bill Gates', jobTitle: 'Co-chair', company: 'Gates Foundation', email: 'b@g.org' }, fields)),
    ['Bill Gates', 'Co-chair', 'Gates Foundation', '', 'b@g.org', '', '', '', ''],
  );
});

test('a nested array is counted, not dumped as JSON into a cell', () => {
  const profile = lfOperation('linkedin_profile_to_linkedin_info');
  assert.deepStrictEqual(Array.from(ctx.rowFor({ skills: ['a', 'b', 'c'] }, ['skills'])), ['3 item(s)']);
  assert.deepStrictEqual(Array.from(ctx.rowFor({ skills: [] }, ['skills'])), ['']);
});

test('picking fields keeps the catalog order, not the order they were ticked', () => {
  // Two runs of the same lookup must put the same data in the same columns.
  const profile = lfOperation('linkedin_profile_to_linkedin_info');
  assert.deepStrictEqual(Array.from(ctx.fieldsFor(profile, ['email', 'name', 'jobTitle'])), ['name', 'jobTitle', 'email']);
  assert.deepStrictEqual(
    Array.from(ctx.fieldsFor(profile, [])),
    Array.from(profile.columns.default),
    'an empty pick falls back to the default',
  );
});

test('a scalar lookup still writes exactly one value', () => {
  const scalar = lfOperation('company_name_to_website');
  assert.strictEqual(ctx.fieldsFor(scalar, null), null);
  assert.strictEqual(formatResult({ website: 'tesla.com' }, scalar), 'tesla.com');
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

/**
 * A spreadsheet stub that records every write, so a lost write is visible.
 *
 * Row 1 is the header row and is kept separately from the data, the way the
 * add-on treats it — the header write and the row writes are different bugs.
 */
function fakeSheet(grid, header = []) {
  const writes = [];
  const cell = (row, col) => (row === 1 ? header : grid[row - 2]);

  const sheet = {
    name: 'Sheet1',
    getName: () => sheet.name,
    getLastRow: () => grid.length + 1,
    setFrozenRows() {},
    getRange(row, col, numRows, numCols) {
      // A single cell.
      if (numRows === undefined) {
        return {
          getValue: () => (cell(row, col) || [])[col - 1] ?? '',
          setValue: (v) => {
            writes.push({ row, col, value: v });
            const target = cell(row, col) || [];
            target[col - 1] = v;
            if (row === 1) header.splice(0, header.length, ...target);
          },
          setFontWeight() { return this; },
        };
      }
      // A range.
      return {
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const source = cell(row + r, col) || [];
            const line = [];
            for (let c = 0; c < (numCols ?? 1); c++) line.push(source[col - 1 + c] ?? '');
            out.push(line);
          }
          return out;
        },
        setValues: (values) => {
          values.forEach((line, r) => {
            const target = cell(row + r, col) || (grid[row + r - 2] = []);
            line.forEach((v, c) => (target[col - 1 + c] = v));
            writes.push({ row: row + r, col, values: line });
          });
        },
        setFontWeight() { return this; },
      };
    },
  };
  return { sheet, writes, grid, header };
}

function runWith({ grid, fetch, now, header = [] }) {
  const board = fakeSheet(grid, header);
  // A list lookup writes into a sheet of its own; this records the one it makes.
  const extraSheets = {};
  const book = {
    getSheetByName: (name) => extraSheets[name] ?? null,
    insertSheet: (name) => {
      const made = fakeSheet([], []);
      made.sheet.name = name;
      extraSheets[name] = made.sheet;
      made.sheet.__board = made;
      return made.sheet;
    },
  };
  const ctx = addon({
    SpreadsheetApp: { getActiveSheet: () => board.sheet, getActiveSpreadsheet: () => book, flush() {} },
    PropertiesService: { getUserProperties: () => ({ getProperty: () => 'test-key' }) },
    UrlFetchApp: { fetch },
    Date: now ? { now, prototype: Date.prototype } : Date,
  });
  return { ctx, board, sheets: extraSheets };
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

// ---------------------------------------------------------------------------
// The three result shapes, written into a sheet
// ---------------------------------------------------------------------------

test('an object result writes a header row and one column per field', () => {
  const grid = [['https://linkedin.com/in/billgates']];
  const header = [];
  const { ctx: run, board } = runWith({
    grid,
    header,
    fetch: (url, options) =>
      options && options.method === 'post'
        ? { getResponseCode: () => 202, getContentText: () => '{"job_id":"j"}' }
        : ok({ status: 'done', result: {
            name: 'Bill Gates', jobTitle: 'Co-chair', company: 'Gates Foundation',
            location: 'Seattle', email: 'b@g.org', mobileNumber: '+1555',
            linkedinUrl: 'https://linkedin.com/in/billgates', industry: 'Philanthropy',
            headline: 'Chair', about: 'long text nobody wants in a cell',
          } }),
  });

  const result = run.runEnrichment({
    type: 'linkedin_profile_to_linkedin_info',
    outputColumn: 'B',
    columns: { input: 'A' },
  });

  assert.strictEqual(result.columnsWritten, 9);
  assert.deepStrictEqual(header.slice(1, 10), [
    'Name', 'Job Title', 'Company', 'Location', 'Email', 'Phone', 'LinkedIn URL', 'Industry', 'Headline',
  ]);
  assert.deepStrictEqual(grid[0].slice(1, 10), [
    'Bill Gates', 'Co-chair', 'Gates Foundation', 'Seattle', 'b@g.org', '+1555',
    'https://linkedin.com/in/billgates', 'Philanthropy', 'Chair',
  ]);
  // `about` is offered but not on by default, so it must not appear uninvited.
  assert.ok(!grid[0].includes('long text nobody wants in a cell'));
});

test('a miss on an object lookup says so once, and leaves the rest blank', () => {
  const grid = [['https://linkedin.com/in/nobody']];
  const { ctx: run } = runWith({
    grid, header: [],
    fetch: (url, options) =>
      options && options.method === 'post'
        ? { getResponseCode: () => 202, getContentText: () => '{"job_id":"j"}' }
        : ok({ status: 'done', result: null }),
  });

  const result = run.runEnrichment({
    type: 'linkedin_profile_to_linkedin_info', outputColumn: 'B', columns: { input: 'A' },
  });

  assert.strictEqual(grid[0][1], 'Not found');
  assert.deepStrictEqual(grid[0].slice(2, 10), ['', '', '', '', '', '', '', ''],
    'a miss must not write "Not found" across nine columns');
  assert.strictEqual(result.found, 0);
});

test('only the chosen fields get columns', () => {
  const grid = [['https://linkedin.com/in/billgates']];
  const header = [];
  const { ctx: run } = runWith({
    grid, header,
    fetch: (url, options) =>
      options && options.method === 'post'
        ? { getResponseCode: () => 202, getContentText: () => '{"job_id":"j"}' }
        : ok({ status: 'done', result: { name: 'Bill Gates', email: 'b@g.org', jobTitle: 'Co-chair' } }),
  });

  const result = run.runEnrichment({
    type: 'linkedin_profile_to_linkedin_info',
    outputColumn: 'B',
    columns: { input: 'A' },
    fields: ['email', 'name'],
  });

  assert.strictEqual(result.columnsWritten, 2);
  assert.deepStrictEqual(header.slice(1, 3), ['Name', 'Email']);
  assert.deepStrictEqual(grid[0].slice(1, 3), ['Bill Gates', 'b@g.org']);
});

test('a list result goes to its own sheet, one row per person', () => {
  // One company can return hundreds of employees; they cannot sit beside the row
  // that asked for them.
  const grid = [['tesla.com', '']];
  const { ctx: run, sheets } = runWith({
    grid, header: [],
    fetch: () => ok({ result: [
      { firstName: 'Ada', lastName: 'L', jobTitle: 'CTO', email: 'ada@tesla.com', company: 'Tesla' },
      { firstName: 'Grace', lastName: 'H', jobTitle: 'VP', email: 'grace@tesla.com', company: 'Tesla' },
    ] }),
  });

  const result = run.runEnrichment({
    type: 'company_domain_to_employees', outputColumn: 'B', columns: { input: 'A' },
  });

  const name = 'LinkFinder — List Employees by Company Domain';
  assert.strictEqual(result.resultSheet, name);
  const made = sheets[name].__board;

  assert.deepStrictEqual(made.header.slice(0, 4), ['Looked up', 'First Name', 'Last Name', 'Job Title']);
  assert.strictEqual(made.grid.length, 2, 'one row per person');
  assert.strictEqual(made.grid[0][0], 'tesla.com', 'the input that found them, so the two can be joined');
  assert.strictEqual(made.grid[0][1], 'Ada');
  assert.strictEqual(made.grid[1][1], 'Grace');

  // And the source row records what happened, so a re-run skips it.
  assert.strictEqual(grid[0][1], '2 result(s)');
});

test('a list lookup that finds nobody marks the row rather than leaving it blank', () => {
  const grid = [['nowhere.com', '']];
  const { ctx: run } = runWith({ grid, header: [], fetch: () => ok({ result: [] }) });
  run.runEnrichment({ type: 'company_domain_to_employees', outputColumn: 'B', columns: { input: 'A' } });
  assert.strictEqual(grid[0][1], 'Not found', 'an unmarked row would be looked up and charged again');
});

test('every lookup that returns more than one field offers columns for them', () => {
  for (const op of getOperations()) {
    if (op.outputKind === 'scalar') {
      assert.strictEqual(op.columns, null, `${op.type} is scalar and should have no columns`);
      continue;
    }
    assert.ok(op.columns && op.columns.default.length, `${op.type} offers no columns`);
    assert.ok(op.labels, `${op.type} has no column labels`);
    for (const field of op.columns.default) {
      assert.ok(op.labels[field], `${op.type} defaults to ${field} but gives it no header`);
    }
  }
});
