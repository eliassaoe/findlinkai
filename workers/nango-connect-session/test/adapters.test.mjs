/**
 * The adapters, exercised against a stubbed proxy.
 *
 * The point of these is the HubSpot ones: HubSpot is the only CRM with a live
 * connection, so the requests this worker builds for it must not have changed
 * when the adapter layer went in. The rest assert each CRM's own request shape,
 * which is all an adapter actually encodes.
 *
 * Run: node --test test/adapters.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(dirname(fileURLToPath(import.meta.url))), 'worker.js');

// The worker is a Cloudflare module worker — importing it would need a workers
// runtime. The adapters are self-contained, so lift that section out and
// evaluate it on its own.
const src = readFileSync(WORKER, 'utf8');
const start = src.indexOf('const CRM_ADAPTERS = {');
const end = src.indexOf('function adapterFor(');
assert.ok(start > 0 && end > start, 'could not locate the adapter section');

const { CRM_ADAPTERS } = await import(
  'data:text/javascript,' + encodeURIComponent(src.slice(start, end) + '\nexport { CRM_ADAPTERS };')
);

/** Records every request an adapter makes and replays a scripted response. */
function stubProxy(responses = []) {
  const calls = [];
  const proxy = async (path, options = {}) => {
    calls.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
    const next = responses.shift() ?? { ok: true, json: {} };
    return { ok: next.ok !== false, status: next.status ?? 200, json: async () => next.json ?? {} };
  };
  return { proxy, calls };
}

test('every adapter implements the full contract', () => {
  for (const [id, crm] of Object.entries(CRM_ADAPTERS)) {
    assert.strictEqual(crm.id, id, `${id} disagrees with its own id`);
    assert.ok(crm.label, `${id} has no label`);
    for (const fn of ['listProperties', 'listContacts', 'findByEmail', 'patch', 'create']) {
      assert.strictEqual(typeof crm[fn], 'function', `${id} is missing ${fn}`);
    }
    for (const key of ['email', 'linkedin_url', 'phone']) {
      assert.ok(crm.defaultFields[key], `${id} has no default for ${key}`);
    }
  }
});

test('only HubSpot claims weekly-sync support', () => {
  // The unattended job needs name + company domain on the contact. Anything
  // else claiming support would silently start spending credits on bad inputs.
  const supported = Object.values(CRM_ADAPTERS).filter((c) => c.syncReadMap).map((c) => c.id);
  assert.deepStrictEqual(supported, ['hubspot-9mj3']);
});

// ── HubSpot: unchanged behaviour ────────────────────────────────────────────

test('HubSpot search is the same request it always was', async () => {
  const { proxy, calls } = stubProxy([{ json: { results: [{ id: '1', properties: { email: 'a@b.com' } }] } }]);
  const hit = await CRM_ADAPTERS['hubspot-9mj3'].findByEmail(proxy, 'a@b.com', ['email', 'firstname']);

  assert.strictEqual(calls[0].path, '/crm/v3/objects/contacts/search');
  assert.strictEqual(calls[0].method, 'POST');
  assert.deepStrictEqual(calls[0].body, {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: 'a@b.com' }] }],
    properties: ['email', 'firstname'],
    limit: 1,
  });
  assert.deepStrictEqual(hit, { id: '1', props: { email: 'a@b.com' } });
});

test('HubSpot patch still wraps fields in properties', async () => {
  const { proxy, calls } = stubProxy([{ ok: true }]);
  await CRM_ADAPTERS['hubspot-9mj3'].patch(proxy, '42', { email: 'a@b.com' });
  assert.strictEqual(calls[0].path, '/crm/v3/objects/contacts/42');
  assert.strictEqual(calls[0].method, 'PATCH');
  assert.deepStrictEqual(calls[0].body, { properties: { email: 'a@b.com' } });
});

test('HubSpot paginates on the after cursor', async () => {
  const { proxy, calls } = stubProxy([{ json: { results: [], paging: { next: { after: 'c2' } } } }]);
  const page = await CRM_ADAPTERS['hubspot-9mj3'].listContacts(proxy, { limit: 25, properties: ['email'], cursor: 'c1' });
  assert.match(calls[0].path, /^\/crm\/v3\/objects\/contacts\?/);
  assert.match(calls[0].path, /after=c1/);
  assert.strictEqual(page.cursor, 'c2');
});

// ── The CRMs whose shapes differ ────────────────────────────────────────────

test('Salesforce escapes a quote in the email before putting it in SOQL', async () => {
  const { proxy, calls } = stubProxy([{ json: { records: [] } }]);
  await CRM_ADAPTERS.salesforce.findByEmail(proxy, "o'brien@b.com", ['Email']);
  const q = decodeURIComponent(calls[0].path.split('q=')[1]);
  assert.ok(q.includes("o\\'brien@b.com"), `unescaped quote in SOQL: ${q}`);
});

test('Salesforce patches with a bare body and strips the attributes envelope', async () => {
  const { proxy, calls } = stubProxy([{ ok: true }]);
  await CRM_ADAPTERS.salesforce.patch(proxy, '003x', { Email: 'a@b.com' });
  assert.deepStrictEqual(calls[0].body, { Email: 'a@b.com' }, 'Salesforce takes the field map directly');

  const s2 = stubProxy([{ json: { records: [{ Id: '003x', attributes: { type: 'Contact' }, Email: 'a@b.com' } ] } }]);
  const hit = await CRM_ADAPTERS.salesforce.findByEmail(s2.proxy, 'a@b.com', ['Email']);
  assert.deepStrictEqual(hit, { id: '003x', props: { Email: 'a@b.com' } }, 'attributes must not leak into props');
});

test('Pipedrive reads the primary email and writes the array shape back', async () => {
  const s = stubProxy([{ json: { data: { items: [{ item: { id: 7, email: [
    { value: 'old@b.com', primary: false }, { value: 'primary@b.com', primary: true },
  ] } }] } } }]);
  const hit = await CRM_ADAPTERS.pipedrive.findByEmail(s.proxy, 'primary@b.com');
  assert.strictEqual(hit.props.email, 'primary@b.com', 'should read the primary, not the first');

  const w = stubProxy([{ ok: true }]);
  await CRM_ADAPTERS.pipedrive.patch(w.proxy, 7, { email: 'new@b.com', job_title: 'VP' });
  assert.deepStrictEqual(w.calls[0].body, { email: [{ value: 'new@b.com', primary: true }], job_title: 'VP' });
});

test('Zoho wraps a single record in a data array on write', async () => {
  const { proxy, calls } = stubProxy([{ ok: true }]);
  await CRM_ADAPTERS.zoho.patch(proxy, '55', { Email: 'a@b.com' });
  assert.strictEqual(calls[0].method, 'PUT');
  assert.deepStrictEqual(calls[0].body, { data: [{ Email: 'a@b.com' }] });
});

test('Close keeps its trailing slash and its email/phone objects', async () => {
  const { proxy, calls } = stubProxy([{ ok: true }]);
  await CRM_ADAPTERS.close.patch(proxy, 'cont_1', { email: 'a@b.com', title: 'VP' });
  assert.ok(calls[0].path.endsWith('/'), `Close redirects without the trailing slash: ${calls[0].path}`);
  assert.deepStrictEqual(calls[0].body, { emails: [{ email: 'a@b.com', type: 'office' }], title: 'VP' });

  const r = stubProxy([{ json: { data: [{ id: 'cont_1', emails: [{ email: 'a@b.com' }], phones: [{ phone: '+1' }] }] } }]);
  const hit = await CRM_ADAPTERS.close.findByEmail(r.proxy, 'a@b.com');
  assert.strictEqual(hit.props.email, 'a@b.com');
  assert.strictEqual(hit.props.phone, '+1');
});

test('a failed create reports the status rather than a bare id', async () => {
  for (const id of Object.keys(CRM_ADAPTERS)) {
    const { proxy } = stubProxy([{ ok: false, status: 403 }]);
    const out = await CRM_ADAPTERS[id].create(proxy, { x: 1 });
    assert.deepStrictEqual(out, { ok: false, status: 403 }, `${id} swallowed a failed create`);
  }
});
