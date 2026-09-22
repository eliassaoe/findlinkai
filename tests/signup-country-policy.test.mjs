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

await test('the retired gift code no longer mints 1,000 credits', async () => {
  const { env } = makeEnv();
  const n8n = stubN8n();
  try {
    // GIFT_CREDITS is empty since the Sep 2026 farm. Old /100free links must
    // still work - they just fall back to the normal grant.
    const res = await worker.fetch(
      makeRequest({ country: 'US', body: { ...BODY, gift: 'coldemail_1000' } }), env, {});
    assert.equal(res.status, 200, 'an old campaign link must not break');
    assert.equal(n8n.calls[0].startingCredits, 50, 'it must fall back to the standard grant, not 1000');
  } finally { n8n.restore(); }
});

await test('a gift code is no longer a way around the country block', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(
    makeRequest({ country: 'IN', body: { ...BODY, gift: 'coldemail_1000' } }), env, {});
  assert.equal(res.status, 403, 'the exemption went with the code that justified it');
});

// ---- allowlist -------------------------------------------------------------

console.log('\nallowlist');

await test('a country that is simply not on the list is refused', async () => {
  // The point of the allowlist over the blocklist: BR and MX were never on any
  // blocked tier, and under 'block' they signed up freely. A new market now has
  // to be let in on purpose.
  for (const country of ['BR', 'MX', 'TR', 'ZA', 'VN']) {
    const { env } = makeEnv();
    const res = await worker.fetch(makeRequest({ country, body: BODY }), env, {});
    assert.equal(res.status, 403, `${country} is not on the allowlist`);
  }
});

await test('every country that has produced a paying customer is allowed', async () => {
  // US 11 | FR 3 | GB 2 | UA 2 | CA 1 | NL 1 | SG 1 | JP 1 over 180 days.
  // If a change to the list ever refuses one of these, it is refusing revenue
  // that already exists.
  for (const country of ['US', 'FR', 'GB', 'UA', 'CA', 'NL', 'SG', 'JP']) {
    const { env } = makeEnv();
    const n8n = stubN8n();
    try {
      const res = await worker.fetch(makeRequest({ country, body: BODY }), env, {});
      assert.equal(res.status, 200, `${country} has paying customers and must stay allowed`);
    } finally { n8n.restore(); }
  }
});

await test('an unknown country still fails OPEN under the allowlist', async () => {
  // This matters more here than it did on the blocklist: "not in the allowed
  // set" is trivially true of null, so a strict reading refuses everyone on
  // earth the moment request.cf breaks.
  const { env } = makeEnv();
  const n8n = stubN8n();
  try {
    const res = await worker.fetch(makeRequest({ country: undefined, body: BODY }), env, {});
    assert.equal(res.status, 200, 'a geo lookup failure must not read as a global outage');
  } finally { n8n.restore(); }
});

// ---- signup farm -----------------------------------------------------------

console.log('\nsignup farm');

await test("the farm's 23 domains are refused", async () => {
  for (const domain of ['acmecorp.com', 'mycompany.org', 'summitpartners.com', 'silverline.co']) {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeRequest({ country: 'US', body: { ...BODY, email: `someone@${domain}` } }), env, {});
    assert.equal(res.status, 400, `${domain} should be refused`);
  }
});

await test("the farm's email shape is refused on any domain", async () => {
  // The point of the shape rule: the next farm buys different domains.
  const { env } = makeEnv();
  const res = await worker.fetch(
    makeRequest({ country: 'US', body: { ...BODY, email: 'lf-1n5qjc43@some-new-domain.com' } }), env, {});
  assert.equal(res.status, 400);
  const json = JSON.parse(await res.text());
  assert.equal(json.code, 'business_email_required',
    'it must not tell a script which rule it tripped');
});

await test('a real lf- address is not caught by the shape rule', async () => {
  // These are the false positives the rule is tuned to avoid. 'lf-outreach' is
  // exactly eight characters, so length alone would have refused a real team
  // alias; requiring a digit is what keeps it out.
  for (const email of ['lf-marketing@realcompany.com', 'lf-outreach@realcompany.com',
                       'lf.team@realcompany.com', 'lfdata@realcompany.com']) {
    const { env } = makeEnv();
    const n8n = stubN8n();
    try {
      const res = await worker.fetch(makeRequest({ country: 'US', body: { ...BODY, email } }), env, {});
      assert.equal(res.status, 200, `${email} is a person, not a farm`);
    } finally { n8n.restore(); }
  }
});

await test('a farm signup is refused before any KV read', async () => {
  const { env, reads } = makeEnv();
  await worker.fetch(
    makeRequest({ country: 'US', body: { ...BODY, email: 'lf-jlb5rsjp@acmecorp.com' } }), env, {});
  assert.deepEqual(reads, [], 'thousands of scripted attempts must not cost a read each');
});

// ---- per-domain cap --------------------------------------------------------

console.log('\nper-domain daily cap');

// KV that actually remembers, so the cap can be exercised rather than asserted.
function statefulEnv(seed = {}) {
  const store = new Map(Object.entries(seed));
  const kv = {
    get: async (k) => (store.has(k) ? store.get(k) : null),
    put: async (k, v) => { store.set(k, v); },
  };
  return { env: { DISPOSABLE_DOMAINS: { get: async () => null }, RATE_LIMITS: kv }, store };
}

await test('a business domain is capped at 5 new accounts a day', async () => {
  const { env } = statefulEnv({
    dom_burstco: JSON.stringify({ count: 5, firstAttempt: Date.now() }),
  });
  // key is dom_<domain>, so seed under the real name
  const seeded = statefulEnv({
    'dom_burstco.com': JSON.stringify({ count: 5, firstAttempt: Date.now() }),
  });
  const res = await worker.fetch(
    makeRequest({ country: 'US', body: { ...BODY, email: 'sixth@burstco.com' } }), seeded.env, {});
  assert.equal(res.status, 429);
  const json = JSON.parse(await res.text());
  assert.equal(json.code, 'domain_signup_cap');
});

await test('the cap does not apply to gmail', async () => {
  const seeded = statefulEnv({
    'dom_gmail.com': JSON.stringify({ count: 9999, firstAttempt: Date.now() }),
  });
  const n8n = stubN8n();
  try {
    // gmail is 75.5% of signups and is a shared mailbox provider - capping it
    // would refuse real people all day. Google's own login is the check there.
    const res = await worker.fetch(
      makeRequest({ country: 'US', body: { email: 'someone@gmail.com', provider: 'google' } }),
      seeded.env, {});
    assert.equal(res.status, 200);
  } finally { n8n.restore(); }
});

await test('a stale 24h window resets the cap', async () => {
  const seeded = statefulEnv({
    'dom_oldco.com': JSON.stringify({ count: 99, firstAttempt: Date.now() - 25 * 60 * 60 * 1000 }),
  });
  const n8n = stubN8n();
  try {
    const res = await worker.fetch(
      makeRequest({ country: 'US', body: { ...BODY, email: 'fresh@oldco.com' } }), seeded.env, {});
    assert.equal(res.status, 200, 'yesterday must not block today');
  } finally { n8n.restore(); }
});

await test('the cap fails OPEN when KV is missing', async () => {
  const n8n = stubN8n();
  try {
    const res = await worker.fetch(
      makeRequest({ country: 'US', body: { ...BODY, email: 'a@nokv.com' } }), {}, {});
    assert.equal(res.status, 200, 'no KV binding must never mean no signups');
  } finally { n8n.restore(); }
});

unquiet();
console.log(`\n${passed} passed`);
