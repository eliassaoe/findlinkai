// Paste a list into the search box -> run it as a list (8 Nov 2026, docs/paste-a-list.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

test('pasting several lines into the search box offers to run them as a list', () => {
  assert.match(app, /document\.addEventListener\('paste'/);
  assert.match(app, /if \(lines\.length < 2\) return;/);
  assert.match(app, /function lfRunPastedList\(\)/);
  // nothing runs by itself: it goes through the normal CSV preview and Process button
  assert.match(app, /switchMode\('bulk', 'paste_list'\);\n\s+parseCSV\(parsed\.text\);/);
  assert.match(app, /paste_list_detected/);
  assert.match(app, /paste_list_run/);
});

test('the list-stopped event carries what the finish-your-list email needs', () => {
  const n = (app.match(/posthog\.capture\('bulk_results_gated_shown', \{\n\s+batch_id: currentCsvBatchId \|\| null,/g) || []).length;
  assert.equal(n, 2);
  assert.match(app, /found_rows: \(function\(\)\{ try \{ return csvResumeFoundRows \+ csvBatchFoundRows\(\); \}/);
});
