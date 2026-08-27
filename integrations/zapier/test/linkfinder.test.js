'use strict';

const test = require('node:test');
const assert = require('node:assert');

const searches = require('../searches');
const { runEnrichment } = require('../lib/linkfinder');
const catalog = require('../../catalog/operations.json');

/**
 * A stand-in for Zapier's `z`. Each queued response is returned by one request, so a
 * test can script an async job as "202, then processing, then done" and assert that
 * the search polls it through.
 */
function fakeZ(responses) {
  const calls = [];
  return {
    calls,
    z: {
      request: async (options) => {
        calls.push(options);
        const next = responses.shift();
        if (!next) throw new Error(`unexpected extra request to ${options.url}`);
        return { status: next.status, json: next.json ?? {} };
      },
      errors: { Error: class ZapierError extends Error {} },
    },
  };
}

const bundleFor = (inputData, extra = {}) => ({ inputData: { input_data: inputData, ...extra } });

const OP = { type: 'company_name_to_website', inputLabel: 'Company Name', params: [], outputField: 'website' };

test('every catalog operation has a generated search', () => {
  assert.strictEqual(Object.keys(searches).length, catalog.operations.length);
  for (const op of catalog.operations) {
    assert.ok(searches[op.key], `missing search for ${op.type}`);
  }
});

test('every search declares a sample, which Zapier requires', () => {
  for (const [key, search] of Object.entries(searches)) {
    assert.ok(search.operation.sample, `${key} has no sample`);
    assert.ok(search.operation.sample.id, `${key} sample has no id`);
    assert.ok(search.display.label && search.display.description, `${key} is missing display copy`);
  }
});

test('the real credit cost appears in the description', () => {
  assert.match(searches.findPhoneFromLinkedinProfile.display.description, /50 credits/);
  assert.match(searches.findEmailFromLinkedinProfile.display.description, /10 credits/);
  assert.match(searches.findLinkedinUrlFromName.display.description, /1 credit\b/);
});

test('a scalar result is named after the operation and wrapped in an array', async () => {
  const { z } = fakeZ([{ status: 200, json: { status: 'success', result: 'tesla.com' } }]);
  const out = await runEnrichment(z, bundleFor('Tesla'), OP);

  assert.deepStrictEqual(out, [{ id: 'tesla.com', value: 'tesla.com', website: 'tesla.com' }]);
});

test('a lookup that found nothing returns an empty array, not an error', async () => {
  const { z } = fakeZ([{ status: 200, json: { status: 'success', result: null } }]);
  assert.deepStrictEqual(await runEnrichment(z, bundleFor('Nope'), OP), []);
});

test('a 202 is polled until the job resolves', async () => {
  const { z, calls } = fakeZ([
    { status: 202, json: { status: 'processing', job_id: 'job-1', poll_url: 'https://api.linkfinderai.com/status/job-1' } },
    { status: 200, json: { status: 'processing' } },
    { status: 200, json: { status: 'done', result: [{ name: 'Ada', linkedinUrl: 'https://linkedin.com/in/ada' }] } },
  ]);

  const op = { ...OP, type: 'company_name_to_employees', outputField: null };
  const out = await runEnrichment(z, bundleFor('Tesla'), op);

  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[1].url, 'https://api.linkfinderai.com/status/job-1');
  assert.deepStrictEqual(out, [{ id: 'https://linkedin.com/in/ada', name: 'Ada', linkedinUrl: 'https://linkedin.com/in/ada' }]);
});

test('a job result wrapped in `data` is unwrapped', async () => {
  const { z } = fakeZ([
    { status: 202, json: { job_id: 'job-2' } },
    { status: 200, json: { status: 'done', data: { status: 'success', result: 'tesla.com' } } },
  ]);

  assert.deepStrictEqual(await runEnrichment(z, bundleFor('Tesla'), OP), [
    { id: 'tesla.com', value: 'tesla.com', website: 'tesla.com' },
  ]);
});

test('a 429 is retried, then succeeds', async () => {
  const { z, calls } = fakeZ([
    { status: 429, json: {} },
    { status: 200, json: { status: 'success', result: 'tesla.com' } },
  ]);

  const out = await runEnrichment(z, bundleFor('Tesla'), OP);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(out[0].website, 'tesla.com');
});

test('out of credits says so in words a Zap user can act on', async () => {
  const { z } = fakeZ([{ status: 402, json: {} }]);
  await assert.rejects(() => runEnrichment(z, bundleFor('Tesla'), OP), /out of credits/i);
});

test('a bad key points at reconnecting the account', async () => {
  const { z } = fakeZ([{ status: 401, json: {} }]);
  await assert.rejects(() => runEnrichment(z, bundleFor('Tesla'), OP), /invalid or expired/i);
});

test('a 422 surfaces the API message rather than a generic failure', async () => {
  const { z } = fakeZ([{ status: 422, json: { message: 'input_data must be a LinkedIn URL' } }]);
  await assert.rejects(() => runEnrichment(z, bundleFor('nope'), OP), /must be a LinkedIn URL/);
});

test('optional params are only sent when filled in', async () => {
  const op = { type: 'company_domain_to_employees', inputLabel: 'Domain', params: ['employee_count'], outputField: null };

  const filled = fakeZ([{ status: 200, json: { result: [] } }]);
  await runEnrichment(filled.z, bundleFor('tesla.com', { employee_count: 25 }), op);
  assert.deepStrictEqual(filled.calls[0].body, { type: 'company_domain_to_employees', input_data: 'tesla.com', employee_count: 25 });

  const empty = fakeZ([{ status: 200, json: { result: [] } }]);
  await runEnrichment(empty.z, bundleFor('tesla.com', { employee_count: '' }), op);
  assert.deepStrictEqual(empty.calls[0].body, { type: 'company_domain_to_employees', input_data: 'tesla.com' });
});

test('a blank input is rejected before it costs a credit', async () => {
  const { z, calls } = fakeZ([]);
  await assert.rejects(() => runEnrichment(z, bundleFor('   '), OP), /Company Name is required/);
  assert.strictEqual(calls.length, 0);
});

test('a provider error dressed as a successful result is rejected, not returned', async () => {
    // Observed live: a lookup answered 200 / "success" with a provider permissions
    // error as its only result. A Zap would otherwise map that into a CRM as a lead.
    // The operation it happened on has been withdrawn; the failure mode has not.
    const { z } = fakeZ([
        { status: 200, json: { status: 'success', result: [{ error: { message: '403 - full-permission-actor-not-approved' } }] } },
    ]);

    await assert.rejects(
        () => runEnrichment(z, bundleFor('tesla.com'), { ...OP, type: 'company_domain_to_employees', outputField: null }),
        /provider error.*credits were still spent/s,
    );
});

test('a 422 on the Instagram type is retried with the documented alternative', async () => {
    const { z, calls } = fakeZ([
        { status: 422, json: { message: 'unknown type' } },
        { status: 200, json: { status: 'success', result: 'nasa' } },
    ]);

    const op = { type: 'instagram_lookup', inputLabel: 'Handle', params: [], outputField: 'username',
                 altType: 'instagram_profile_to_instagram_info' };

    const out = await runEnrichment(z, bundleFor('@nasa'), op);

    assert.strictEqual(calls[0].body.type, 'instagram_lookup');
    assert.strictEqual(calls[1].body.type, 'instagram_profile_to_instagram_info');
    assert.strictEqual(out[0].username, 'nasa');
});

test('an operation with no alternative name is not retried on a 422', async () => {
    const { z, calls } = fakeZ([{ status: 422, json: { message: 'bad input' } }]);
    await assert.rejects(() => runEnrichment(z, bundleFor('nope'), OP), /bad input/);
    assert.strictEqual(calls.length, 1);
});
