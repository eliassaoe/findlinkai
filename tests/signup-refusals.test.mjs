// Signup refusals. The signup Worker refuses some requests on purpose: 403 for
// a restricted country, 429 for the 3-accounts-per-network-per-day limit. Both
// used to be reported as 'server_error' and shown as "please try again", and on
// the Google path every failure was headed "Account Already Exists" and never
// reported at all. These tests pin the classification, the copy, and the
// tracking on both doors. See docs/signup-refusals.md.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const signup = read('sign-up.html');
const confirm = read('confirmation-signup.html');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('signup refusals');

await test('email form classifies 403 as geo_restricted and 429 as rate_limited, after the specific codes', () => {
  const block = signup.match(/let reason = 'server_error';[\s\S]*?try \{ posthog\.capture\('signup_failed'/);
  assert.ok(block, 'classification block not found in sign-up.html');
  const src = block[0];
  assert.match(src, /response\.status === 403\)\s*reason = 'geo_restricted'/);
  assert.match(src, /response\.status === 429\)\s*reason = 'rate_limited'/);
  // A Worker 400 with a known code must still win over the status checks.
  assert.ok(src.indexOf('use_google_signin') < src.indexOf('geo_restricted'));
});

await test('email form tells a geo-refused visitor that Google sign-up is refused too, and where to go', () => {
  const branch = signup.match(/reason === 'geo_restricted'\) \{[\s\S]*?\} else if/);
  assert.ok(branch, 'geo_restricted branch not found');
  assert.match(branch[0], /Google sign-up too/);
  assert.match(branch[0], /\/log-in/);
  assert.match(branch[0], /support@linkfinderai\.com/);
  assert.doesNotMatch(branch[0], /try again/i);
});

await test('email form gives a rate-limited visitor a way out instead of a bare refusal', () => {
  const branch = signup.match(/reason === 'rate_limited'\) \{[\s\S]*?\} else \{/);
  assert.ok(branch, 'rate_limited branch not found');
  assert.match(branch[0], /retryAfter/);
  assert.match(branch[0], /\/log-in/);
  assert.match(branch[0], /support@linkfinderai\.com/);
});

// Run the real sendEmailToServer from confirmation-signup.html against a fake
// fetch, so the test exercises the shipped code rather than a copy of it.
const fnSrc = confirm.match(/async function sendEmailToServer\(email\) \{[\s\S]*?\n        \}\n\n        function getCookie/);
assert.ok(fnSrc, 'sendEmailToServer not found in confirmation-signup.html');
const body = fnSrc[0].replace(/\n\n        function getCookie$/, '');
function load(status, text) {
  const fetch = async () => ({
    status, ok: status >= 200 && status < 300,
    text: async () => text,
    json: async () => JSON.parse(text),
  });
  const localStorage = { getItem: () => null };
  const window = { LF_API_KEY: 'k' };
  const console = { log() {} };
  const getCookie = () => null;
  return new Function('fetch', 'localStorage', 'window', 'console', 'getCookie', 'WORKER_URL',
    body + '\nreturn sendEmailToServer;')(fetch, localStorage, window, console, getCookie, 'https://worker.test/');
}

await test('Google path: 403 is reported as geo_restricted with its own heading', async () => {
  const r = await load(403, '{"error":"Forbidden"}')('a@b.co');
  assert.equal(r.success, false);
  assert.equal(r.reason, 'geo_restricted');
  assert.equal(r.status, 403);
  assert.match(r.title, /region/);
  assert.doesNotMatch(r.title, /Already Exists/);
});

await test('Google path: 429 is reported as rate_limited and reads retryAfter', async () => {
  const r = await load(429, '{"error":"Too many","retryAfter":5}')('a@b.co');
  assert.equal(r.reason, 'rate_limited');
  assert.match(r.error, /5 hours/);
});

await test('Google path: 409 keeps the "Account Already Exists" heading', async () => {
  const r = await load(409, '{}')('a@b.co');
  assert.equal(r.reason, 'already_registered');
  assert.equal(r.title, 'Account Already Exists');
});

await test('Google path: the error heading is no longer hardcoded to "Account Already Exists"', () => {
  assert.match(confirm, /<h1 class="error" id="errorTitle">We couldn't create your account<\/h1>/);
  assert.match(confirm, /function showError\(message, title\)/);
  assert.match(confirm, /showError\(result\.error, result\.title\)/);
});

await test('Google path: every failure is reported to PostHog as signup_failed with method google', () => {
  const captures = confirm.match(/posthog\.capture\('signup_failed', \{ method: 'google'/g) || [];
  assert.ok(captures.length >= 3, `expected worker, session and timeout failures to be captured, found ${captures.length}`);
});

console.log(`${passed} passed`);
