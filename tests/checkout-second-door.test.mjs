// The second door to payment. A buyer who clicks Buy must reach a Dodo payment
// page even when the worker-created session cannot be had, and every failure
// path a buyer can land on must offer the static payment link and a human.
// These tests pin that wiring, the product ids it relies on, and the canary
// that proves the doors open every hour.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('app.html');
const canary = read('workers/dodo-checkout/canary.mjs');
const workflow = read('.github/workflows/checkout-canary.yml');
const productDoc = read('workers/discount-code/README.md');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('checkout second door');

const mapSrc = app.match(/const DODO_DIRECT_PRODUCTS = \{[\s\S]*?\};/);

test('the direct-link product map exists and holds the four documented live products', () => {
  assert.ok(mapSrc, 'DODO_DIRECT_PRODUCTS not found in app.html');
  for (const [key, id] of [
    ['starter_monthly', 'pdt_0Nfl5LZfppnjJBM2mvons'],
    ['pro_monthly', 'pdt_0Nfl5YPolhxfkTEMxOJYp'],
    ['payg_small', 'pdt_0Nj62gByZ53OzYoz3bCBr'],
    ['payg_medium', 'pdt_0Nj62kQhG7EzZWogTmjfE'],
  ]) {
    assert.match(mapSrc[0], new RegExp(`${key}:\\s*'${id}'`), `${key} must map to ${id}`);
    assert.ok(productDoc.includes(id), `${id} must be one of the documented worker products`);
  }
});

test('the direct link carries the attribution the payment webhook needs', () => {
  const fn = app.match(/function buildDirectPaymentLink\([\s\S]*?\n\}/);
  assert.ok(fn, 'buildDirectPaymentLink not found');
  assert.match(fn[0], /checkout\.dodopayments\.com\/buy\//, 'must be a Dodo static payment link');
  assert.match(fn[0], /'redirect_url', DODO_DIRECT_RETURN_URL/, 'must send the buyer back to /app');
  assert.match(fn[0], /'metadata_user_token', userToken/, 'webhook attribution is by metadata.user_token');
  assert.match(fn[0], /searchParams\.set\('email'/, 'email pre-fills the Dodo form and is the webhook fallback');
  assert.match(fn[0], /return null/, 'a plan without an id must yield no link, never a broken one');
});

test('every failure path a buyer can hit offers the direct link', () => {
  const launch = app.slice(app.indexOf('async function launchCheckout('), app.indexOf('function handleDodoReturnStatus'));
  assert.match(launch, /checkout_stuck_watchdog[\s\S]*?directUrl: buildDirectPaymentLink\(planKey, null, watchdogAttemptId\)/,
    'the 20s watchdog must offer it');
  assert.match(launch, /checkout_redirect_stalled[\s\S]*?directUrl: buildDirectPaymentLink\(planKey, email, lastCheckoutAttemptId\)/,
    'the 5s stalled-redirect notice must offer it');
  assert.match(launch, /catch \(e\) \{[\s\S]*?const direct = buildDirectPaymentLink\(planKey, email, lastCheckoutAttemptId\);[\s\S]*?window\.location\.href = direct;/,
    'a failed session must navigate through the second door, not stop at an error');
  assert.match(launch, /let email = null;\s*try \{/, 'email must be visible to the catch block');
});

test('the rescue banner offers the direct link and a human on both variants', () => {
  const rescue = app.slice(app.indexOf('async function maybeShowCheckoutRescue'), app.indexOf('function resumeCheckout'));
  assert.match(rescue, /const directRescue = /, 'direct link computed for the banner');
  assert.match(rescue, /mailto:support@linkfinderai\.com/, 'a human is offered');
  assert.equal((rescue.match(/bar\.innerHTML = `/g) || []).length, 2, 'two banner variants');
  assert.equal((rescue.match(/\$\{directRescue\}/g) || []).length, 2, 'each variant must include the direct link');
  assert.equal((rescue.match(/\$\{contactRescue\}/g) || []).length, 2, 'each variant must include the contact link');
  assert.equal(/didn't quite finish signing up/.test(rescue), false,
    'the abandoned copy must not blame a buyer whose payment page may have failed');
});

test('the error toast renders the direct link and a contact line', () => {
  const toast = app.slice(app.indexOf('function showCheckoutError'), app.indexOf('async function launchCheckout('));
  assert.match(toast, /opts\.directUrl/, 'directUrl option');
  assert.match(toast, /Pay with a direct payment link/, 'visible label');
  assert.match(toast, /mailto:support@linkfinderai\.com/, 'a human is offered');
});

test('the canary tests the same worker, the same product, and both doors', () => {
  assert.match(canary, /dodo-checkout\.hamoureliasse\.workers\.dev/, 'same worker app.html calls');
  assert.match(canary, /pdt_0Nj62gByZ53OzYoz3bCBr/, 'second door uses the payg_small product from the app map');
  assert.match(canary, /process\.exit\(1\)/, 'must fail loudly');
  assert.match(workflow, /cron: '17 \* \* \* \*'/, 'hourly');
  assert.match(workflow, /node workers\/dodo-checkout\/canary\.mjs/, 'runs the canary');
  assert.match(workflow, /LF_CANARY_USER_TOKEN/, 'armed by the secret');
  assert.match(workflow, /gh issue create/, 'a failure opens an issue');
});

console.log(`\n${passed} passed`);
