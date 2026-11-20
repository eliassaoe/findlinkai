// Microsoft Ads UET tag: loaded only for visitors who came from a Microsoft ad,
// and the signup / purchase conversions fire where PostHog's do.
// Background: docs/paid-visibility-rule.md, "Microsoft Ads account".

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const attribution = read('js/lf-attribution.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

// Run only the UET block of lf-attribution.js in a fake browser.
const block = attribution.slice(attribution.indexOf('// Microsoft Ads UET tag'));
function run(search, stored) {
  const store = new Map(stored ? [['lf_ms_ad_until', String(stored)]] : []);
  const inserted = [];
  const fakeScript = { parentNode: { insertBefore: (n) => inserted.push(n.src) } };
  const window = {
    location: { search },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  };
  const document = {
    createElement: () => ({}),
    getElementsByTagName: () => [fakeScript],
  };
  vm.runInNewContext(block, { window, document, URLSearchParams, Date, Number, String });
  return { window, inserted, store };
}

console.log('Microsoft Ads UET');

test('an organic visitor loads the tag too (remarketing lists need every visitor, 20 Nov 2026)', () => {
  const r = run('?utm_source=google');
  assert.deepEqual(r.inserted, ['https://bat.bing.com/bat.js']);
  assert.equal(r.store.get('lf_ms_ad_until'), undefined);
  r.window.lfAdConversion('signup');
  assert.equal(JSON.stringify(r.window.uetq_lf.slice(-3)), JSON.stringify(['event', 'signup', {}]));
});

test('a visitor from a Microsoft ad loads the tag and is remembered', () => {
  const r = run('?utm_source=bing&utm_medium=cpc');
  assert.deepEqual(r.inserted, ['https://bat.bing.com/bat.js']);
  assert.ok(Number(r.store.get('lf_ms_ad_until')) > Date.now());
  r.window.lfAdConversion('purchase', 49);
  assert.equal(JSON.stringify(r.window.uetq_lf.slice(-3)),
    JSON.stringify(['event', 'purchase', { revenue_value: 49, currency: 'USD' }]));
});

test('msclkid alone marks a Microsoft ad arrival for 90 days', () => {
  const r = run('?msclkid=abc');
  assert.equal(r.inserted.length, 1);
  assert.ok(Number(r.store.get('lf_ms_ad_until')) > Date.now());
  assert.equal(run('', Date.now() - 1000).inserted.length, 1);
});

test('signup and purchase call sites fire the Microsoft conversion', () => {
  assert.equal((read('sign-up.html').match(/lfAdConversion\('signup'\)/g) || []).length, 2);
  assert.ok(read('confirmation-signup.html').includes("lfAdConversion('signup')"));
  assert.ok(read('app.html').includes("lfAdConversion('purchase'"));
  assert.ok(read('account.html').includes("lfAdConversion('purchase')"));
});

test('our tag never shares the default uetq queue with the older hard-coded tag', () => {
  assert.ok(block.includes("'uetq_lf');"));
  assert.ok(!/window\.uetq\b(?!_lf)/.test(block));
});

console.log(`\n${passed} passed`);
