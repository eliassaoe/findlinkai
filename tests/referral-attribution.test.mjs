// Affiliate attribution must survive both signup paths (23 Nov 2026).
// Before this, confirmation-signup.html deleted lf_ref before the app could
// send it to the referral worker, and the email path never stored it:
// referral_attributions was empty, so no affiliate could ever be paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the Google confirmation page no longer deletes the referral code', () => {
  assert.doesNotMatch(read('confirmation-signup.html'), /localStorage\.removeItem\('lf_ref'\)/);
});

test('the sign-up page stores ?ref (or the cookie) on load, for every signup path', () => {
  const s = read('sign-up.html');
  const i = s.indexOf("const urlParams = new URLSearchParams(window.location.search);");
  const block = s.slice(i, i + 1600);
  assert.match(block, /urlParams\.get\('ref'\) \|\| \(document\.cookie\.match/);
  assert.match(block, /localStorage\.setItem\('lf_ref', ref\)/);
});

test('the app falls back to the lf_ref cookie and attributes once', () => {
  const a = read('app.html');
  const fn = a.slice(a.indexOf('function lfCaptureRef()'), a.indexOf('async function lfAttributeReferral'));
  assert.match(fn, /document\.cookie\.match\(\/\(\?:\^\|;\\s\*\)lf_ref=/);
  assert.match(fn, /lf_ref_done/);
  assert.match(a, /localStorage\.setItem\('lf_ref_done', '1'\)/);
  assert.match(a, /referral\.hamoureliasse\.workers\.dev\/attribute/);
});

test('the affiliate program is visible: app tab, public page, site-wide link, click logging', () => {
  const a = read('app.html'), aff = read('affiliate.html'), js = read('js/lf-attribution.js'), home = read('index.html');
  assert.match(a, /data-page="affiliates"/);
  assert.match(a, /case 'affiliates':/);
  assert.match(a, /lf_after_auth/);
  assert.match(aff, /id="public"/);
  assert.doesNotMatch(aff, /Please open this from inside your LinkFinder account/);
  assert.doesNotMatch(aff, /name="robots" content="noindex"/);
  assert.match(js, /referral\.hamoureliasse\.workers\.dev\/r\//);
  assert.match(js, /data-lf-affiliate-link/);
  assert.match(home, /href="https:\/\/linkfinderai\.com\/affiliate" data-lf-affiliate-link="nav"/);
});
