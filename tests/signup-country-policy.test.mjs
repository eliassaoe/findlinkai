// The signup worker now refuses the low-conversion countries outright
// (COUNTRY_POLICY = 'block' in workers/signup/worker.js). These tests pin the
// four things that decision depends on:
//
//   1. a blocked country really is refused, with a code the pages can render;
//   2. it is refused BEFORE any KV read, which is the whole point - a blocked
//      attempt has to cost nothing;
//   3. it fails OPEN on an unknown country, because a Cloudflare change that
//      empties request.cf must not refuse every signup on earth;
//   4. a campaign gift code still gets through, as the grant logic assumes.
//
// Test 3 is the one that matters most. Everything else here is a business
// decision that can be reversed by editing one line; a geo check that fails
// closed takes the whole funnel down and looks like an outage, not a policy.

import assert from 'node:assert/strict';
import worker from '../workers/signup/worker.js';

let passed = 0;
function test(name, fn) {
  return fn().then(
    () => { passed++; console.log('  ok   ' + name); },
    (e) => { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
  );
}

// ---- mocks -----------------------------------------------------------------

function makeRequest({ country, body }) {
  return {
    method: 'POST',
    url: 'https://linkfinderai-sign-up.hamoureliasse.workers.dev/',
    cf: country === undefined ? undefined : { country },
    headers: {
      get: (name) => (name === 'CF-Connecting-IP' ? '203.0.113.9' : null),
    },
    json: async () => body,
  };
}

// Counts every KV touch so the "costs nothing" claim is actually checked
// rather than asserted in a comment.
function makeEnv() {
  const reads = [];
  const kv = (name) => ({
    get: async (key) => { reads.push(`${name}:${key}`); return null; },
    put: async () => {},
  });
  return { env: { DISPOSABLE_DOMAINS: kv('disposable'), RATE_LIMITS: kv('rate') }, reads };
}

// The worker forwards to n8n on the allowed path. Stub it so the tests never
// touch the network, and so "did it get through?" is observable.
function stubN8n() {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ token: 'tok_test' }) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const quiet = () => {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  return () => { console.log = log; console.warn = warn; };
};

const BODY = { email: 'priya@acme-corp.com', password: 'x'.repeat(12) };

// ---- tests -----------------------------------------------------------------

console.log('signup country policy');

const unquiet = quiet();

await test('a blocked country is refused with a renderable code', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(makeRequest({ country: 'IN', body: BODY }), env, {});
  assert.equal(res.status, 403);
  const json = JSON.parse(await res.text());
  assert.equal(json.code, 'country_not_supported',
    'sign-up.html and confirmation-signup.html both branch on this exact string');
});

await test('every country on the list is refused', async () => {
  for (const country of ['IN', 'PK', 'NG', 'BD', 'EG']) {
    const { env } = makeEnv();
    const res = await worker.fetch(makeRequest({ country, body: BODY }), env, {});
    assert.equal(res.status, 403, `${country} should be refused`);
  }
});

await test('a blocked attempt reads no KV at all', async () => {
  const { env, reads } = makeEnv();
  await worker.fetch(makeRequest({ country: 'IN', body: BODY }), env, {});
  assert.deepEqual(reads, [],
    'the refusal must land before isDisposable() and the rate limiter, or it still costs us reads');
});

await test('a standard country still gets through to n8n', async () => {
  const { env } = makeEnv();
  const n8n = stubN8n();
  try {
    const res = await worker.fetch(makeRequest({ country: 'US', body: BODY }), env, {});
    assert.equal(res.status, 200);
    assert.equal(n8n.calls.length, 1);
    assert.equal(n8n.calls[0].geoTier, 'standard');
    assert.equal(n8n.calls[0].startingCredits, 50);
  } finally { n8n.restore(); }
});

await test('an unknown country fails OPEN, not closed', async () => {
  const { env } = makeEnv();
  const n8n = stubN8n();
  try {
    // request.cf absent and no CF-IPCountry header - what a preview environment
    // or a Cloudflare regression looks like. Refusing here would read as a
    // total signup outage.
    const res = await worker.fetch(makeRequest({ country: undefined, body: BODY }), env, {});
    assert.equal(res.status, 200, 'an unknown country must never be treated as blocked');
    assert.equal(n8n.calls[0].geoTier, 'standard');
  } finally { n8n.restore(); }
});

await test('a campaign gift code is exempt from the block', async () => {
  const { env } = makeEnv();
  const n8n = stubN8n();
  try {
    const res = await worker.fetch(
      makeRequest({ country: 'IN', body: { ...BODY, gift: 'coldemail_1000' } }), env, {});
    assert.equal(res.status, 200, 'hand-picked campaign recipients were invited on purpose');
    assert.equal(n8n.calls[0].startingCredits, 1000);
  } finally { n8n.restore(); }
});

await test('an unknown gift code does not buy a way past the block', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(
    makeRequest({ country: 'IN', body: { ...BODY, gift: 'nice_try_1000000' } }), env, {});
  assert.equal(res.status, 403, 'only codes listed in GIFT_CREDITS are exempt');
});

unquiet();
console.log(`\n${passed} passed`);
