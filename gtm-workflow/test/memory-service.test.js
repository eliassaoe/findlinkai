'use strict';

/**
 * End-to-end exercise of the memory service over real HTTP — the same calls the
 * workflow's HTTP Request nodes make.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtm-memory-'));
process.env.CAMPAIGN_MEMORY_DB = path.join(workdir, 'campaign_memory.db');
process.env.GTM_CONFIG_PATH = path.join(__dirname, '..', 'config.json');
process.env.MEMORY_SERVICE_TOKEN = 'test-token';

const { server } = require('../src/server.js');

let base;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(workdir, { recursive: true, force: true }); });

const call = (method, route, body) =>
  fetch(`${base}${route}`, {
    method,
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const LEAD = {
  lead_email: 'dana@northbeamlabs.io',
  full_name: 'Dana Okafor',
  job_title: 'Head of Growth',
  company_name: 'Northbeam Labs',
  company_domain: 'northbeamlabs.io',
  industry: 'B2B SaaS',
  employee_count: 48,
};

test('rejects an unauthenticated call but always answers /health', async () => {
  const denied = await fetch(`${base}/memory/context`, { method: 'POST', body: '{}' });
  assert.equal(denied.status, 401);

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
});

test('serves config.json straight off disk', async () => {
  const config = await (await call('GET', '/config')).json();
  const onDisk = JSON.parse(fs.readFileSync(process.env.GTM_CONFIG_PATH, 'utf8'));
  assert.deepEqual(config.offer, onDisk.offer);
  assert.deepEqual(config.disqualifiers.hard.blocked_domains, onDisk.disqualifiers.hard.blocked_domains);
});

test('context starts cold: empty corpus, advisory gate, clean guardrails', async () => {
  const ctx = await (await call('POST', '/memory/context', LEAD)).json();
  assert.equal(ctx.past_positive_replies_list, '', 'empty table must yield an empty string, not null');
  assert.equal(ctx.conversion_count, 0);
  assert.equal(ctx.lookalike_gate_enforced, false);
  assert.equal(ctx.already_contacted, false);
  assert.equal(ctx.hard_disqualifier.hit, false);
  assert.equal(ctx.config.offer.product, 'LinkFinder AI');
});

test('hard guardrails fire on a disqualified lead', async () => {
  const ctx = await (await call('POST', '/memory/context', {
    lead_email: 'info@gmail.com', full_name: 'Sam Doe', job_title: 'Technical Recruiter',
    company_name: 'Statewide University', company_domain: 'gmail.com', employee_count: 2,
  })).json();
  assert.equal(ctx.hard_disqualifier.hit, true);
  assert.ok(ctx.hard_disqualifier.rules.some((r) => /recruiter/.test(r)));
  assert.ok(ctx.hard_disqualifier.rules.some((r) => /university/.test(r)));
  assert.ok(ctx.hard_disqualifier.rules.some((r) => /below the floor/.test(r)));
});

test('logging outreach makes the lead suppressed on the next signal', async () => {
  const logged = await (await call('POST', '/memory/outreach', {
    ...LEAD,
    company_description: 'Series A product analytics for ecommerce teams; buys enrichment per lead from three vendors.',
    tech_stack: ['HubSpot', 'Clay'],
    signal_type: 'competitor_post_comment',
    subject_line: 'three vendors',
    email_body: 'One. Two. Three?',
  })).json();
  assert.equal(logged.ok, true);
  assert.equal(logged.outreach.tech_stack, 'HubSpot, Clay', 'arrays are flattened for the prompt');

  const ctx = await (await call('POST', '/memory/context', LEAD)).json();
  assert.equal(ctx.already_contacted, true);
});

test('a bare reply backfills its profile from the outreach log', async () => {
  // This is the whole point of the outreach log: Deliveryman is not guaranteed
  // to echo custom metadata back on the reply webhook.
  const recorded = await (await call('POST', '/memory/conversions', {
    lead_email: 'dana@northbeamlabs.io', reply_sentiment: 'positive', reply_snippet: 'Send the file.',
  })).json();

  assert.equal(recorded.ok, true);
  assert.equal(recorded.backfilled_from_outreach_log, true);
  assert.match(recorded.conversion.company_description, /three vendors/);
  assert.equal(recorded.conversion.job_title, 'Head of Growth');
  assert.equal(recorded.conversion_count, 1);
});

test('a conversion with no description and nothing to backfill from is a 422, not a bad row', async () => {
  const res = await call('POST', '/memory/conversions', { lead_email: 'nobody@example.com' });
  assert.equal(res.status, 422);
  assert.match((await res.json()).message, /company_description/);
});

test('a redelivered reply webhook updates the profile instead of duplicating it', async () => {
  const again = await (await call('POST', '/memory/conversions', {
    lead_email: 'dana@northbeamlabs.io',
    company_description: 'Updated description after a second reply.',
  })).json();
  assert.equal(again.conversion_count, 1, 'the same person must count once');
  assert.match(again.conversion.company_description, /Updated description/);
});

test('the corpus turns into the prompt block Node 3 hands the agent', async () => {
  for (const [i, domain] of ['rellyops.com', 'shipfast.dev'].entries()) {
    await call('POST', '/memory/conversions', {
      lead_email: `person${i}@${domain}`,
      job_title: 'RevOps Lead',
      company_name: domain,
      company_domain: domain,
      company_description: `Description for ${domain}.`,
      tech_stack: ['Clay', 'Smartlead'],
      employee_count: 14,
      signal_type: 'group_join',
    });
  }

  const ctx = await (await call('POST', '/memory/context', LEAD)).json();
  assert.equal(ctx.conversion_count, 3);
  assert.equal(ctx.lookalike_gate_enforced, true, 'three conversions crosses the configured threshold');
  assert.match(ctx.past_positive_replies_list, /^1\. \[/, 'the list is numbered for the prompt');
  assert.match(ctx.past_positive_replies_list, /Tech stack: Clay, Smartlead\./);
  assert.equal(ctx.past_positive_replies_list.split('\n').length, 3);

  const listed = await (await call('GET', '/memory/conversions?limit=2')).json();
  assert.equal(listed.count, 2);
  assert.equal(listed.total, 3);
});

test('an edit to config.json is picked up without a restart', async () => {
  const original = fs.readFileSync(process.env.GTM_CONFIG_PATH, 'utf8');
  const edited = JSON.parse(original);
  edited.offer.cta = 'want the teardown clip?';
  edited.disqualifiers.hard.job_title_contains = ['head of growth'];

  const scratch = path.join(workdir, 'config.json');
  fs.writeFileSync(scratch, JSON.stringify(edited, null, 2));
  process.env.GTM_CONFIG_PATH = scratch;
  try {
    const ctx = await (await call('POST', '/memory/context', LEAD)).json();
    assert.equal(ctx.config.offer.cta, 'want the teardown clip?');
    assert.equal(ctx.hard_disqualifier.hit, true, 'the new guardrail applies immediately');
  } finally {
    process.env.GTM_CONFIG_PATH = path.join(__dirname, '..', 'config.json');
  }
});

test('rejects malformed JSON with a 400 rather than a crash', async () => {
  const res = await fetch(`${base}/memory/context`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
});
