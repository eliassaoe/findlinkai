// The cancellation flow: one offer per reason, no survey between the offer and
// the cancel button, and a cancel button that can never leave someone
// subscribed. Background: workers/cancel-subscription/README.md.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const account = read('account.html');
const { classify } = await import('../workers/cancel-subscription/worker.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('cancel flow');

test('every reason on the grid has exactly one offer', () => {
  const reasons = [...account.matchAll(/selectReason\('(\w+)'/g)].map(m => m[1]);
  assert.equal(reasons.length, 6);
  const block = account.match(/const RETENTION_OFFERS = \{[\s\S]*?\n\};/)[0];
  for (const r of reasons) {
    const entry = block.match(new RegExp('\\n  ' + r + ': \\{[\\s\\S]*?\\n  \\},'));
    assert.ok(entry, 'no offer for ' + r);
    assert.equal((entry[0].match(/class="solution-card"/g) || []).length, 1, r + ' must show one offer');
  }
});

test('no survey between declining the offer and the cancel button', () => {
  assert.equal(/EXIT_SURVEY|startExitSurvey|id="step4"|id="step3"/.test(account), false);
  assert.match(account, /function declineAllSolutions\(\) \{[\s\S]*?goToFlowStep\('step5'\)/);
});

test('offers are tracked when shown and when accepted', () => {
  assert.match(account, /surveyTrack\('retention_offer_shown'/);
  assert.match(account, /surveyTrack\('retention_offer_accepted'/);
});

test('a rejected cancel falls back, then files a manual request', () => {
  const fn = account.match(/async function confirmCancel\(\) \{[\s\S]*?\n\}\n/)[0];
  assert.ok(fn.indexOf('CANCEL_WORKER') < fn.indexOf('CANCEL_FALLBACK_WORKER'));
  assert.match(fn, /type:\s+'cancellation_request'/);
  assert.equal(/Please try again/.test(fn), false, 'retrying cannot fix a rejected id');
});

test('the fallback worker recognises every id format in linkfinderai_users', () => {
  assert.equal(classify('sub_01krxmxap9yyat0gnf3javy4n3'), 'paddle_subscription');
  assert.equal(classify('sub_0NabcdefghijklmnopqRS'), 'dodo_subscription');
  assert.equal(classify('cus_0NabcdefghijklmnopqRS'), 'dodo_customer');
  assert.equal(classify('test'), 'unknown');
  assert.equal(classify(null), 'missing');
});

console.log(`\n${passed} passed`);
