/**
 * The scripts published on linkedIn-enrichment-google-sheets.html.
 *
 * This is the code users actually paste into their own sheets — the page is the
 * "Live" Google Sheets integration linked from the integrations hub. It is not
 * the add-on in this folder, so it needs its own coverage: a mistake here ships
 * straight into somebody's spreadsheet.
 *
 * The script is extracted from the page and run against a stubbed Apps Script
 * runtime, so what is tested is exactly what is published.
 */
import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), '..');
const page = readFileSync(join(REPO, 'linkedIn-enrichment-google-sheets.html'), 'utf8');

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function block(id) {
  const m = page.match(new RegExp(`<div id="${id}" class="code-block"[^>]*><pre>([\\s\\S]*?)</pre></div>`));
  assert.ok(m, `no ${id} block on the page`);
  return unescape(m[1]);
}

/** A stand-in for the Apps Script globals the script uses. */
function runtime({ responses = [], key = 'lf_test' } = {}) {
  const calls = [];
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => key }) },
    Utilities: { sleep() {} },
    SpreadsheetApp: { getUi: () => ({ alert() {} }), flush() {} },
    UrlFetchApp: {
      fetch(url, options = {}) {
        calls.push({ url, body: options.payload ? JSON.parse(options.payload) : undefined });
        const next = responses.shift() ?? { code: 200, json: { status: 'success', result: 'ok' } };
        return { getResponseCode: () => next.code ?? 200, getContentText: () => JSON.stringify(next.json ?? {}) };
      },
    },
    Array, JSON, String, Date, Error, RegExp, Math,
  };
  vm.createContext(ctx);
  new vm.Script(block('tab-formula')).runInContext(ctx);
  return { ctx, calls };
}

test('a plain lookup sends the cell value unchanged', () => {
  const { ctx, calls } = runtime({ responses: [{ code: 200, json: { status: 'success', result: 'tesla.com' } }] });
  const out = ctx.LINKFINDER(' Tesla ', 'company_name_to_website');
  assert.strictEqual(calls[0].body.input_data, 'Tesla');
  assert.strictEqual(out, 'tesla.com');
});

test('the argument order is still (input, type) — existing formulas must not break', () => {
  // The published signature has always been =LINKFINDER(A2, "type"). Swapping it
  // would silently post the type string as the lookup for everyone.
  const { ctx, calls } = runtime({ responses: [{ code: 200, json: { result: 'tesla.com' } }] });
  ctx.LINKFINDER('Tesla', 'company_name_to_website');
  assert.strictEqual(calls[0].body.type, 'company_name_to_website');
  assert.strictEqual(calls[0].body.input_data, 'Tesla');
});

test('a name lookup joins company, location and job title', () => {
  const { ctx, calls } = runtime({ responses: [{ code: 200, json: { result: 'a@b.com' } }] });
  ctx.LINKFINDER('Bill Gates', 'lead_full_name_to_email', 'Microsoft', 'Seattle', 'Co-chair');
  assert.strictEqual(calls[0].body.input_data, 'Bill Gates Microsoft Seattle Co-chair');
});

test('missing optional parts leave no double spaces', () => {
  const { ctx, calls } = runtime({ responses: [{ code: 200, json: { result: 'x' } }] });
  ctx.LINKFINDER('Bill Gates', 'lead_full_name_to_email', '', 'Seattle');
  assert.strictEqual(calls[0].body.input_data, 'Bill Gates Seattle');
});

test('"Doe, John" is flipped, but only for name lookups', () => {
  const a = runtime({ responses: [{ code: 200, json: { result: 'x' } }] });
  a.ctx.LINKFINDER('Gates, Bill', 'lead_full_name_to_email', 'Microsoft');
  assert.strictEqual(a.calls[0].body.input_data, 'Bill Gates Microsoft');

  // A company lookup must not have its commas rearranged.
  const b = runtime({ responses: [{ code: 200, json: { result: 'x' } }] });
  b.ctx.LINKFINDER('Gates, Foundation', 'company_name_to_website');
  assert.strictEqual(b.calls[0].body.input_data, 'Gates, Foundation');
});

test('out of credits is an error, not "Not found"', () => {
  // The old script returned "Not found" for 402 and 401, so a whole column would
  // come back empty and look like the data did not exist.
  const { ctx } = runtime({ responses: [{ code: 402, json: {} }] });
  assert.throws(() => ctx.LINKFINDER('Tesla', 'company_name_to_website'), /Out of credits/);
});

test('a rejected key is an error too', () => {
  const { ctx } = runtime({ responses: [{ code: 401, json: {} }] });
  assert.throws(() => ctx.LINKFINDER('Tesla', 'company_name_to_website'), /key rejected/i);
});

test('a genuinely empty result is still "Not found"', () => {
  const { ctx } = runtime({ responses: [{ code: 200, json: { status: 'success', result: null } }] });
  assert.strictEqual(ctx.LINKFINDER('Nope', 'company_name_to_website'), 'Not found');
});

test('an async job is polled instead of returning nothing', () => {
  // linkedin_profile_to_linkedin_info ALWAYS answers with a job. The old script
  // read no result and said "Not found" — the lookup never worked at all.
  const { ctx, calls } = runtime({ responses: [
    { code: 200, json: { status: 'processing', job_id: 'j1', poll_url: 'https://api.linkfinderai.com/status/j1' } },
    { code: 200, json: { status: 'processing' } },
    { code: 200, json: { status: 'success', result: { name: 'Bill Gates' } } },
  ] });

  const out = ctx.LINKFINDER('https://linkedin.com/in/x', 'linkedin_profile_to_linkedin_info');
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[1].url, 'https://api.linkfinderai.com/status/j1');
  assert.strictEqual(out, JSON.stringify({ name: 'Bill Gates' }));
});

test('a provider error dressed as success is raised, not written into the cell', () => {
  const { ctx } = runtime({ responses: [
    { code: 200, json: { status: 'success', result: { error: { message: '403 not approved' } } } },
  ] });
  assert.throws(() => ctx.LINKFINDER('VP Sales', 'leads_finder_ai'), /Provider error/);
});

test('no API key fails with the fix, not a null dereference', () => {
  const { ctx } = runtime({ key: null });
  assert.throws(() => ctx.LINKFINDER('Tesla', 'company_name_to_website'), /Script Properties/);
});

test('the batch script parses and shares lfCall with the formula', () => {
  const batch = block('tab-batch');
  assert.doesNotThrow(() => new vm.Script(batch));
  assert.match(batch, /lfCall\(TYPE, value\)/, 'the batch script should reuse lfCall');
  assert.match(batch, /5 \* 60 \* 1000/, 'the batch script should stop before the 6-minute limit');
});

// ---------------------------------------------------------------------------
// What the page tells people it costs
// ---------------------------------------------------------------------------

const catalog = JSON.parse(readFileSync(join(REPO, 'integrations', 'catalog', 'operations.json'), 'utf8'));

test('every lookup and its real price is in the generated table', () => {
  const table = page.slice(
    page.indexOf('<!-- LF:CREDIT-TABLE:START -->'),
    page.indexOf('<!-- LF:CREDIT-TABLE:END -->'),
  );
  assert.ok(table.length > 500, 'the credit table block is empty — run integrations/catalog/build-pages.mjs');

  for (const op of catalog.operations) {
    assert.ok(table.includes(`<code>${op.type}</code>`), `${op.type} is missing from the price table`);

    const row = table.slice(table.indexOf(`<code>${op.type}</code>`));
    const cell = row.slice(0, row.indexOf('</tr>'));
    const expected = op.perEmployeeBilling ? '0.5 &times; employees' : `<td>${op.credits}</td>`;
    assert.ok(cell.includes(expected), `${op.type} costs ${op.credits} but the table says otherwise`);
  }
});

test('the page no longer claims a flat price', () => {
  // It said "1 credit per API request, so one row costs 1 credit" for as long as
  // it existed. Thirteen of the twenty lookups cost more, and one costs fifty.
  assert.ok(!/one row costs 1 credit/i.test(page));
  assert.ok(!/>1<\/div>\s*<div class="stat-label">Credit per Row/i.test(page));
  assert.ok(/charged whether or not anything is found/i.test(page),
    'the page must say a miss is charged');
});

test('the published add-on is offered, not denied', () => {
  // The page used to say "no marketplace add-on needed" three times, while an
  // add-on was published and installed by real users.
  assert.ok(page.includes('workspace.google.com/marketplace/app/linkfinder_ai/1096371450007'),
    'the Marketplace listing should be linked');
  assert.ok(!/no marketplace add-on (needed|to install)/i.test(page));
  assert.ok(!/No add-on required/i.test(page));
});
