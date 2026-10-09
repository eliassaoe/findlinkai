// The app opens on bulk. Single lookup is still there, one click away, and
// every path that needs it (the instant-try links, the "one lookup" route
// choice) switches to it explicitly. Background: docs/bulk-first-default.md.

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

console.log('bulk-first default');

test('the app starts in bulk mode and renders the bulk panel on load', () => {
  assert.ok(app.includes("let currentMode = 'bulk';"));
  assert.ok(!app.includes("let currentMode = 'single';"));
  assert.ok(/setupDropdowns\(\);\n\s*showInputSections\(\);/.test(app), 'locked bulk panel is drawn before any pick');
  assert.ok(app.includes("posthog.register({ app_default_mode: 'bulk' })"), 'events carry the default for before/after reads');
});

test('the toggle puts bulk first and active, single second', () => {
  const toggle = app.slice(app.indexOf('<div id="modeToggle"'), app.indexOf('id="creditCost"'));
  const bulkAt = toggle.indexOf('id="bulkMode"');
  const singleAt = toggle.indexOf('id="singleMode"');
  assert.ok(bulkAt > 0 && singleAt > bulkAt, 'bulk button comes first');
  assert.ok(/class="mode-option mode-primary active"[^>]*id="bulkMode"/.test(toggle), 'bulk is the active one');
  assert.ok(!/active"[^>]*id="singleMode"/.test(toggle), 'single is not active');
  assert.ok(toggle.includes("switchMode('single','toggle')"), 'single is still one click away');
});

test('deliberate switches are recorded', () => {
  const sw = appFn('switchMode');
  assert.ok(sw.startsWith('function switchMode(mode, source)'));
  assert.ok(sw.includes("posthog.capture('mode_switched'"));
});

test('every single-lookup entry point switches to single itself', () => {
  assert.ok(appFn('quickStart').includes("switchMode('single');"), 'instant-try links');
  const pick = appFn('pickRoute');
  const def = pick.slice(pick.indexOf('default:'));
  assert.ok(def.includes("switchMode('single');"), '"I just need one lookup for now"');
});

test('the quick-start cards open bulk; single tries are a secondary line', () => {
  const qs = app.slice(app.indexOf('id="quickstartSection"'), app.indexOf('<div class="config-form">'));
  const grid = qs.slice(qs.indexOf('class="quickstart-grid"'), qs.indexOf('class="qs-single-line"'));
  assert.equal((grid.match(/quickStartBulk\(/g) || []).length, 4, 'four bulk cards');
  assert.ok(!grid.includes('quickStart('), 'no single lookup in the card grid');
  const line = qs.slice(qs.indexOf('class="qs-single-line"'));
  assert.equal((line.match(/quickStart\('/g) || []).length, 4, 'the four single tries survive as links');
});

console.log(`${passed} passed`);
