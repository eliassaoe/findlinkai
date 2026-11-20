// Meta pixel conversion events (docs/paid-visibility-rule.md, "Meta pixel").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
console.log('Meta pixel events');
test('lfMeta is defined once, in lf-attribution.js, and is a no-op without fbq', () => {
  const a = read('js/lf-attribution.js');
  assert.ok(a.includes('window.lfMeta = function'));
  assert.ok(a.includes("if (typeof window.fbq !== 'function') return;"));
});
test('CompleteRegistration on every signup path', () => {
  assert.equal((read('sign-up.html').match(/lfMeta\('CompleteRegistration'/g) || []).length, 2);
  assert.ok(read('confirmation-signup.html').includes("lfMeta('CompleteRegistration'"));
});
test('InitiateCheckout, Purchase (with value and currency) and UploadList in the app', () => {
  const app = read('app.html');
  assert.ok(app.includes("lfMeta('InitiateCheckout', { value:"));
  assert.ok(/lfMeta\('Purchase', \{ value: Number\(pending\?\.value\) \|\| 0, currency: 'USD'/.test(app));
  assert.ok(app.includes("lfMeta('UploadList'"));
  assert.ok(read('account.html').includes("lfMeta('Purchase', { value: 0, currency: 'USD' }"));
});
console.log(`\n${passed} passed`);
