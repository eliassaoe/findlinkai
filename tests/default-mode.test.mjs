// The app opens on single lookup. Bulk was the default from 9 Oct 2026 and was
// rolled back: first enrichments fell from 68% to 41% within 14 days of signup,
// with no gain in upgrade intent or payment. Bulk stays one click away, from
// the toggle and from the list line under the quick-start cards.
// Background: docs/bulk-first-default.md ("Result").

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

function appFn(name) {
  const start = app.indexOf('function ' + name + '(');
  assert.ok(start > 0, name + ' exists');
  const body = app.slice(start);
  return body.slice(0, body.indexOf('\n}\n') + 3);
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('default mode');

test('the app starts in single mode', () => {
  assert.ok(app.includes("let currentMode = 'single';"));
  assert.ok(!app.includes("let currentMode = 'bulk';"));
  assert.ok(app.includes("posthog.register({ app_default_mode: 'single' })"), 'events carry the default for before/after reads');
});

test('the toggle puts single first and active, bulk second', () => {
  const toggle = app.slice(app.indexOf('id="modeToggle"'), app.indexOf('id="modeToggle"') + 1500);
  const singleAt = toggle.indexOf('id="singleMode"');
  const bulkAt = toggle.indexOf('id="bulkMode"');
  assert.ok(singleAt > 0 && bulkAt > singleAt, 'single button comes first');
  assert.ok(/class="mode-option active"[^>]*id="singleMode"/.test(toggle), 'single is the active one');
  assert.ok(toggle.includes("switchMode('bulk','toggle')"), 'bulk is still one click away');
});

test('deliberate switches are recorded', () => {
  const sw = appFn('switchMode');
  assert.ok(sw.startsWith('function switchMode(mode, source)'));
  assert.ok(sw.includes("posthog.capture('mode_switched'"));
});

test('the quick-start cards run single lookups; lists are one line below', () => {
  const qs = app.slice(app.indexOf('id="quickstartSection"'), app.indexOf('<div class="config-form">'));
  const grid = qs.slice(qs.indexOf('class="quickstart-grid"'), qs.indexOf('class="qs-list-line"'));
  assert.equal((grid.match(/quickStart\('/g) || []).length, 4, 'four single cards');
  assert.ok(!grid.includes('quickStartBulk('), 'no bulk cards in the grid');
  const line = qs.slice(qs.indexOf('class="qs-list-line"'));
  assert.equal((line.match(/quickStartBulk\('/g) || []).length, 4, 'four list shortcuts');
  assert.ok(appFn('quickStartBulk').includes("switchMode('bulk')"), 'list shortcuts open bulk');
  assert.ok(appFn('quickStart').includes("switchMode('single');"), 'single cards stay in single');
});

console.log(`${passed} passed`);
