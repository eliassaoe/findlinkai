// The earn-credits tasks sit in a rail beside the form on wide screens instead
// of behind a corner button. The rail only lists and links; the modal stays
// the one place a task is done. Background: docs/earn-credits-rail.md.

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

console.log('earn-credits rail');

test('the rail exists and is drawn once task status has loaded', () => {
  assert.ok(app.includes('<aside id="tasksRail" class="tasks-rail"'));
  assert.ok(/reopenBtn\.style\.display = '';\n\s*renderTasksRail\(\);/.test(app), 'drawn on load');
  assert.ok(appFn('renderOnboardingTasksPopup').includes('renderTasksRail();'), 'redrawn whenever the modal re-renders (completions)');
  assert.ok(appFn('renderTasksRail').includes('if (!rail || !otpStatusLoaded) return;'));
});

test('it lists the same tasks as the modal and opens the modal, never a form of its own', () => {
  const r = appFn('renderTasksRail');
  assert.ok(r.includes('OTP_TASKS'));
  assert.ok(!/<input|<textarea/.test(r), 'no inputs in the rail');
  assert.ok(appFn('openTaskFromRail').includes("openOnboardingTasksPopupManually('rail')"));
});

test('wide screens only, and the corner button steps aside there', () => {
  assert.ok(app.includes('@media (min-width:1200px){\n  body.lf-rail-on .tasks-rail{display:block;'));
  assert.ok(app.includes('body.lf-rail-on #reopenTasksBtn{display:none !important;}'));
  assert.ok(app.includes('.tasks-rail{display:none;}'), 'hidden by default (narrow screens keep the button)');
});

test('it can be closed for good, and the corner button comes back', () => {
  assert.ok(app.includes('class="tasks-rail-close" onclick="closeTasksRail()"'));
  const close = appFn('closeTasksRail');
  assert.ok(close.includes("localStorage.setItem('lf_tasks_rail_closed', '1')"));
  assert.ok(close.includes("document.body.classList.remove('lf-rail-on')"), 'removing the class un-hides the button');
  assert.ok(close.includes("posthog.capture('tasks_rail_closed')"));
  assert.ok(appFn('renderTasksRail').includes("if (tasksRailClosed()) { document.body.classList.remove('lf-rail-on'); return; }"), 'stays closed on the next visit');
});

test('it sits at the far left edge, out of the way of the form', () => {
  assert.ok(/body\.lf-rail-on \.tasks-rail\{[^}]*left:16px;width:196px;/.test(app));
});

test('rail traffic is told apart from the button', () => {
  assert.ok(appFn('renderTasksRail').includes("posthog.capture('tasks_rail_shown'"));
  assert.ok(appFn('openTaskFromRail').includes("posthog.capture('tasks_rail_clicked'"));
  assert.ok(appFn('openOnboardingTasksPopupManually').includes("trigger === 'rail' ? 'rail' : 'manual_reopen'"));
});

test('LinkedIn share replaced the YouTube subscribe, and only a post link counts', () => {
  const tasks = app.slice(app.indexOf('const OTP_TASKS_ALL = ['), app.indexOf('const AFFILIATE_LIVE'));
  assert.ok(!tasks.includes("name: 'youtube_subscribe'"), 'YouTube row is gone');
  assert.ok(tasks.includes("name: 'linkedin_share', kind: 'url'"), 'LinkedIn share is a url task');
  assert.ok(/name: 'linkedin_share'[\s\S]*?credits: 150,/.test(tasks), '150, matching the worker');
  assert.ok(appFn('otpSubmitUrlTask').includes("taskName === 'linkedin_share' && !LI_POST_URL.test(url)"));
  const m = app.match(/const LI_POST_URL = (\/.*\/i);/);
  const re = eval(m[1]);
  assert.ok(re.test('https://www.linkedin.com/posts/someone_linkfinder-activity-7123-ab'));
  assert.ok(re.test('https://www.linkedin.com/feed/update/urn:li:activity:7123456789/'));
  assert.ok(!re.test('https://www.linkedin.com/in/someone'), 'a profile is not a post');
  assert.ok(!re.test('https://www.linkedin.com/company/linkfinder-ai'), 'a company page is not a post');
});

console.log(`${passed} passed`);
