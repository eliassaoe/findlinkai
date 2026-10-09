// The earn-credits tasks are reached only through the corner "Get Free
// Credits" button. The always-on rail beside the form was removed because it
// was too intrusive. Background: docs/earn-credits-rail.md.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('earn-credits: button only');

test('no rail beside the form', () => {
  assert.ok(!app.includes('tasksRail'), 'no rail element');
  assert.ok(!app.includes('tasks-rail'), 'no rail styles');
  assert.ok(!app.includes('renderTasksRail'), 'no rail renderer');
  assert.ok(!app.includes('lf-rail-on'), 'nothing hides the button');
});

test('the corner button stays and opens the tasks modal', () => {
  assert.ok(app.includes('id="reopenTasksBtn" onclick="openOnboardingTasksPopupManually()"'));
  assert.ok(/reopenBtn\.style\.display = '';/.test(app), 'shown once task status has loaded');
});

console.log(`${passed} passed`);
