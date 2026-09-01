'use strict';

/**
 * Structural checks on the exported workflow plus a real execution of every Code
 * node against representative payloads. n8n will happily import a workflow whose
 * Code nodes throw on the first signal, so the parsing and routing logic is
 * exercised here rather than discovered in production.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');

const WORKFLOW = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'n8n', 'gtm-signal-engine.json'), 'utf8')
);

const byName = new Map(WORKFLOW.nodes.map((n) => [n.name, n]));
const codeNodeSource = (name) => byName.get(name).parameters.jsCode;

/** Minimal stand-in for the n8n Code-node sandbox. */
function runCodeNode(name, { input, env = {}, upstream = {} }) {
  const wrap = (items) => ({
    first: () => items[0],
    all: () => items,
    item: items[0],
  });
  const context = {
    $input: wrap([{ json: input }]),
    $env: env,
    $: (nodeName) => {
      if (!(nodeName in upstream)) throw new Error(`test harness: no stub for $('${nodeName}')`);
      return wrap([{ json: upstream[nodeName] }]);
    },
    $now: new Date(),
    console,
    JSON,
    Number,
    String,
    Array,
    Object,
    Date,
    Boolean,
    Set,
    Map,
    isNaN,
  };
  const fn = vm.runInNewContext(`(function () {\n${codeNodeSource(name)}\n})`, context);
  return fn();
}

/* ───────────────────────── structure ───────────────────────── */

test('every node has a unique name and an id', () => {
  const names = WORKFLOW.nodes.map((n) => n.name);
  assert.equal(new Set(names).size, names.length, 'duplicate node names');
  for (const node of WORKFLOW.nodes) {
    assert.ok(node.id, `${node.name} has no id`);
    assert.ok(node.type, `${node.name} has no type`);
    assert.ok(Array.isArray(node.position) && node.position.length === 2, `${node.name} has no position`);
  }
});

test('every connection points at a node that exists', () => {
  for (const [source, outputs] of Object.entries(WORKFLOW.connections)) {
    assert.ok(byName.has(source), `connection source "${source}" is not a node`);
    for (const targets of Object.values(outputs)) {
      for (const branch of targets) {
        for (const target of branch) {
          assert.ok(byName.has(target.node), `"${source}" points at missing node "${target.node}"`);
        }
      }
    }
  }
});

test('every non-trigger, non-sticky node is reachable', () => {
  const reachable = new Set(['Node 1 · Trigify Signal Webhook', 'Node 6 · Deliveryman Reply Webhook']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [source, outputs] of Object.entries(WORKFLOW.connections)) {
      for (const targets of Object.values(outputs)) {
        for (const branch of targets) {
          for (const target of branch) {
            // Sub-nodes (model, parser) connect *into* the agent, so the source
            // is reachable once its target is.
            if (reachable.has(source) && !reachable.has(target.node)) { reachable.add(target.node); changed = true; }
            if (reachable.has(target.node) && !reachable.has(source)) { reachable.add(source); changed = true; }
          }
        }
      }
    }
  }
  const orphans = WORKFLOW.nodes
    .filter((n) => n.type !== 'n8n-nodes-base.stickyNote' && !n.disabled && !reachable.has(n.name))
    .map((n) => n.name);
  assert.deepEqual(orphans, [], `unreachable nodes: ${orphans.join(', ')}`);
});

test('the agent has exactly one language model and one output parser', () => {
  const intoAgent = (type) => Object.entries(WORKFLOW.connections)
    .filter(([, outputs]) => outputs[type])
    .map(([source]) => source);
  assert.deepEqual(intoAgent('ai_languageModel'), ['Claude Opus 5']);
  assert.deepEqual(intoAgent('ai_outputParser'), ['Strict JSON Output']);
});

test('both webhooks respond through a Respond to Webhook node', () => {
  for (const webhook of WORKFLOW.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook')) {
    assert.equal(webhook.parameters.responseMode, 'responseNode', `${webhook.name} would answer immediately`);
  }
  const responders = WORKFLOW.nodes.filter((n) => n.type === 'n8n-nodes-base.respondToWebhook');
  assert.ok(responders.length >= 3, 'expected a responder on the queued, skipped and reply paths');
});

test('no secret is baked into the exported workflow', () => {
  const raw = JSON.stringify(WORKFLOW);
  for (const pattern of [/sk-ant-[A-Za-z0-9_-]{8}/, /Bearer [A-Za-z0-9]{16}/, /"api[_-]?key"\s*:\s*"[^"{]{8}/i]) {
    assert.equal(pattern.test(raw), false, `workflow contains something matching ${pattern}`);
  }
  // Every credential must come from the environment or the n8n credential store.
  assert.match(raw, /\$env\.FINDYMAIL_API_KEY/);
  assert.match(raw, /\$env\.DELIVERYMAN_API_KEY/);
});

test('the output parser schema requires qualified and reason', () => {
  const schema = JSON.parse(byName.get('Strict JSON Output').parameters.inputSchema);
  assert.deepEqual(schema.required, ['qualified', 'reason']);
  for (const key of ['qualified', 'reason', 'subject_line', 'email_body', 'lookalike_match']) {
    assert.ok(schema.properties[key], `schema is missing ${key}`);
  }
});

/* ───────────────────────── behaviour ───────────────────────── */

const TRIGIFY_SIGNAL = {
  headers: { 'x-webhook-secret': 'shh' },
  body: {
    id: 'sig_1029',
    signal: {
      type: 'competitor_post_comment',
      competitor: 'Apollo.io',
      comment: 'We pay per credit across three vendors and it still misses half our list.',
      source_url: 'https://linkedin.com/feed/update/123',
      timestamp: '2026-09-01T09:12:00Z',
    },
    prospect: {
      first_name: 'Dana', last_name: 'Okafor',
      title: 'Head of Growth',
      linkedin_url: 'https://linkedin.com/in/danaokafor',
    },
    company: {
      name: 'Northbeam Labs',
      website: 'https://WWW.Northbeamlabs.io/pricing',
      description: 'Product analytics for ecommerce teams.',
      industry: 'B2B SaaS',
      employees: 48,
      technologies: ['HubSpot', 'Clay'],
    },
  },
};

test('normaliser flattens a nested Trigify payload', () => {
  const [{ json }] = runCodeNode('Node 1b · Normalise Signal', {
    input: TRIGIFY_SIGNAL, env: { TRIGIFY_WEBHOOK_SECRET: 'shh' },
  });
  assert.equal(json.valid, true);
  assert.equal(json.full_name, 'Dana Okafor');
  assert.equal(json.first_name, 'Dana');
  assert.equal(json.job_title, 'Head of Growth');
  assert.equal(json.company_domain, 'northbeamlabs.io', 'protocol, www and path must be stripped');
  assert.equal(json.employee_count, 48);
  assert.deepEqual(json.tech_stack, ['HubSpot', 'Clay']);
  assert.equal(json.signal_type, 'competitor_post_comment');
  assert.match(json.signal_context, /Apollo\.io/);
  assert.match(json.signal_context, /three vendors/);
});

test('normaliser reads a flat payload with no nesting at all', () => {
  const [{ json }] = runCodeNode('Node 1b · Normalise Signal', {
    input: { body: { name: 'Sam Reyes', title: 'RevOps Lead', company_name: 'Relly', domain: 'rellyops.com', signal_type: 'role_change' } },
    env: {},
  });
  assert.equal(json.valid, true);
  assert.equal(json.full_name, 'Sam Reyes');
  assert.equal(json.company_domain, 'rellyops.com');
});

test('normaliser rejects a bad secret and an incomplete signal without throwing', () => {
  const [bad] = runCodeNode('Node 1b · Normalise Signal', {
    input: TRIGIFY_SIGNAL, env: { TRIGIFY_WEBHOOK_SECRET: 'different' },
  });
  assert.equal(bad.json.valid, false);
  assert.match(bad.json.reason, /x-webhook-secret/);

  const [thin] = runCodeNode('Node 1b · Normalise Signal', { input: { body: { company: { domain: 'acme.com' } } }, env: {} });
  assert.equal(thin.json.valid, false);
  assert.match(thin.json.reason, /full_name/);
});

const NORMALISED = {
  full_name: 'Dana Okafor', first_name: 'Dana', job_title: 'Head of Growth',
  company_name: 'Northbeam Labs', company_domain: 'northbeamlabs.io',
  provided_email: null, linkedin_url: null,
};

test('candidate selection prefers Findymail and falls back to the payload', () => {
  const [hit] = runCodeNode('Node 2b · Select Candidate Email', {
    input: { contact: { email: 'Dana@Northbeamlabs.io', position: 'Head of Growth' } },
    upstream: { 'Node 1b · Normalise Signal': NORMALISED },
  });
  assert.equal(hit.json.email_found, true);
  assert.equal(hit.json.candidate_email, 'dana@northbeamlabs.io');
  assert.equal(hit.json.email_source, 'findymail');

  const [fallback] = runCodeNode('Node 2b · Select Candidate Email', {
    input: { error: 'Not found' },
    upstream: { 'Node 1b · Normalise Signal': { ...NORMALISED, provided_email: 'dana@northbeamlabs.io' } },
  });
  assert.equal(fallback.json.email_source, 'trigify_payload');

  const [miss] = runCodeNode('Node 2b · Select Candidate Email', {
    input: { error: 'Not found' }, upstream: { 'Node 1b · Normalise Signal': NORMALISED },
  });
  assert.equal(miss.json.email_found, false);
  assert.match(miss.json.reason, /Not found/);
});

test('risky-email filter passes a verified mailbox and blocks everything else', () => {
  const upstream = { 'Node 2b · Select Candidate Email': { ...NORMALISED, candidate_email: 'dana@northbeamlabs.io' } };

  const [ok] = runCodeNode('Node 2c · Filter Risky Emails', {
    input: { email: 'dana@northbeamlabs.io', verified: true, provider: 'Google' }, upstream,
  });
  assert.equal(ok.json.deliverable, true);
  assert.equal(ok.json.lead_email, 'dana@northbeamlabs.io');

  const cases = [
    [{ email: 'dana@northbeamlabs.io', verified: false }, /did not verify/],
    [{ email: 'dana@northbeamlabs.io' }, /did not verify/],
    [{ email: 'dana@northbeamlabs.io', verified: true, catch_all: true }, /catch-all/],
    [{ email: 'dana@northbeamlabs.io', verified: true, risky: true }, /risky/],
    [{ email: 'info@northbeamlabs.io', verified: true }, /role address/],
    [{ email: 'dana@gmail.com', verified: true }, /free consumer mailbox/],
  ];
  for (const [result, expected] of cases) {
    const [row] = runCodeNode('Node 2c · Filter Risky Emails', {
      input: result,
      upstream: { 'Node 2b · Select Candidate Email': { ...NORMALISED, candidate_email: result.email } },
    });
    assert.equal(row.json.deliverable, false, `${JSON.stringify(result)} should have been suppressed`);
    assert.match(row.json.reason, expected);
  }
});

test('agent context renders config and the learning corpus into prompt blocks', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const lead = {
    ...NORMALISED, lead_email: 'dana@northbeamlabs.io', email_provider: 'Google',
    tech_stack: ['HubSpot', 'Clay'], employee_count: 48, industry: 'B2B SaaS',
    signal_type: 'competitor_post_comment', signal_context: 'Commented on an Apollo post.',
    company_description: 'Product analytics for ecommerce teams.',
  };

  const [enforced] = runCodeNode('Node 4a · Build Agent Context', {
    input: {
      config,
      past_positive_replies_list: '1. [Head of Growth @ Northbeam] Buys enrichment from three vendors.',
      conversion_count: 5, conversions_returned: 1, lookalike_gate_enforced: true,
    },
    upstream: { 'Node 2c · Filter Risky Emails': lead },
  });
  assert.equal(enforced.json.product_name, config.offer.product);
  assert.match(enforced.json.offer_block, new RegExp(config.offer.cta.slice(0, 20)));
  assert.match(enforced.json.copy_rules_block, /hope this email finds you well/);
  assert.match(enforced.json.disqualifier_block, /Judgement-call disqualifiers/);
  assert.match(enforced.json.agent_input, /ENFORCED/);
  assert.match(enforced.json.agent_input, /three vendors/);

  const [cold] = runCodeNode('Node 4a · Build Agent Context', {
    input: { config, past_positive_replies_list: '', conversion_count: 0, conversions_returned: 0, lookalike_gate_enforced: false },
    upstream: { 'Node 2c · Filter Risky Emails': lead },
  });
  assert.match(cold.json.agent_input, /no recorded positive replies yet/);
  assert.equal(cold.json.lookalike_gate_enforced, false);
});

test('reply classifier records only explicit positives', () => {
  const env = { DELIVERYMAN_WEBHOOK_SECRET: 'shh' };
  const headers = { 'x-webhook-secret': 'shh' };

  const [positive] = runCodeNode('Node 6a · Classify Reply', {
    input: {
      headers,
      body: {
        event: 'reply_received', sentiment: 'interested', email: 'Dana@Northbeamlabs.io',
        reply_text: 'Yes  — send   the file.',
        metadata: { company_description: 'Product analytics.', job_title: 'Head of Growth', signal_type: 'competitor_post_comment' },
      },
    }, env,
  });
  assert.equal(positive.json.positive, true);
  assert.equal(positive.json.lead_email, 'dana@northbeamlabs.io');
  assert.equal(positive.json.reply_snippet, 'Yes — send the file.');
  assert.equal(positive.json.job_title, 'Head of Growth');

  const negatives = [
    { event: 'hard_bounce', email: 'a@b.com' },
    { event: 'unsubscribed', email: 'a@b.com' },
    { event: 'out_of_office', email: 'a@b.com', reply_text: 'I am away until Monday' },
    { event: 'reply_received', sentiment: 'negative', email: 'a@b.com', reply_text: 'Please remove me' },
    { event: 'reply_received', email: 'a@b.com', reply_text: 'take me off this list' },
    { event: 'opened', email: 'a@b.com' },
  ];
  for (const body of negatives) {
    const [row] = runCodeNode('Node 6a · Classify Reply', { input: { headers, body }, env });
    assert.equal(row.json.positive, false, `${JSON.stringify(body)} must not become a conversion`);
  }

  const [spoofed] = runCodeNode('Node 6a · Classify Reply', {
    input: { headers: { 'x-webhook-secret': 'nope' }, body: { event: 'positive_reply', email: 'a@b.com' } }, env,
  });
  assert.equal(spoofed.json.positive, false);
});

test('skip reasons normalise into one shape whichever gate rejected', () => {
  const cases = [
    [{ valid: false, stage: 'normalise', reason: 'missing full_name' }, /missing full_name/],
    [{ hard_disqualifier: { hit: true, rules: ['job_title contains "recruiter"'] }, full_name: 'X' }, /recruiter/],
    [{ already_contacted: true, hard_disqualifier: { hit: false, rules: [] } }, /Already contacted/],
    [{ qualified: false, reason: 'no resemblance to any recorded win' }, /no resemblance/],
  ];
  for (const [input, expected] of cases) {
    const [row] = runCodeNode('Collect Skip Reason', { input });
    assert.equal(row.json.status, 'skipped');
    assert.match(row.json.reason, expected);
    assert.ok('lead' in row.json);
  }
});
