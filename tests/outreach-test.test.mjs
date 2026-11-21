// Outreach demand test (21 Nov 2026): nav tab + route after a finished list,
// both counted (outreach_clicked) and both open the partner link. docs/outreach-test.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
test('Outreach tab exists and routes through openOutreach', () => {
  assert.match(app, /data-page="outreach"/);
  assert.match(app, /case 'outreach': openOutreach\('nav'\)/);
});
test('the finished-list panel offers outreach, labelled as a partner', () => {
  assert.match(app, /openOutreach\(\\'bulk_panel\\'\)/);
  assert.match(app, /HeyReach, our partner/);
});
test('every click is counted before the partner opens', () => {
  const fn = app.slice(app.indexOf('function openOutreach'), app.indexOf('function openOutreach') + 400);
  assert.ok(fn.indexOf("posthog.capture('outreach_clicked'") < fn.indexOf('window.open(OUTREACH_URL'));
});
