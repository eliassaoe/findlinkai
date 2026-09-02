/**
 * What the weekly sync actually sends to the enrichment API.
 *
 * A user working in Google Sheets reported that they could not get a location or
 * a job title into a name lookup. The same gap was here, unattended and on a
 * weekly cron: this worker sent a name and a company, while app.html sends the
 * name, the company, the location and the job title as one joined string. Same
 * credit cost — 7 for an email, charged whether the row matches the person you
 * meant or a stranger with the same name — and a materially worse hit rate.
 *
 * These pin the joined input, so a tidy-up cannot quietly narrow it again.
 *
 * Run: node --test test/matching.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(HERE, 'worker.js'), 'utf8');

// The worker is a Cloudflare module worker, so it cannot simply be imported.
// These four helpers are pure functions with no bindings — lift them out.
function lift(names) {
  let code = '';
  for (const name of names) {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start > 0, `could not find ${name} in worker.js`);
    // Skip the parameter list first — a destructured one has braces of its own —
    // then walk from the body's opening brace so a nested block cannot end it early.
    let i = src.indexOf('(', start), parens = 0;
    for (; i < src.length; i++) {
      if (src[i] === '(') parens++;
      else if (src[i] === ')' && --parens === 0) break;
    }
    let depth = 0;
    for (i = src.indexOf('{', i); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    code += `${src.slice(start, i + 1)}\n`;
  }
  return code + `export { ${names.join(', ')} };`;
}

const { flipName, splitName, buildPersonInput, locationOf } = await import(
  'data:text/javascript,' + encodeURIComponent(lift(['flipName', 'splitName', 'buildPersonInput', 'locationOf']))
);

const { CRM_ADAPTERS } = await import(
  'data:text/javascript,' +
    encodeURIComponent(
      src.slice(src.indexOf('const CRM_ADAPTERS = {'), src.indexOf('function adapterFor(')) +
        '\nexport { CRM_ADAPTERS };',
    )
);

const READ = CRM_ADAPTERS['hubspot-9mj3'].syncReadMap;

test('HubSpot reads the job title and the location, not just name and company', () => {
  // Every one of these is a standard HubSpot contact property, so reading them
  // costs nothing and portals that leave them empty are unaffected.
  for (const key of ['firstName', 'lastName', 'company', 'website', 'jobTitle', 'city', 'state', 'country']) {
    assert.ok(READ[key], `syncReadMap is missing ${key}`);
  }
  assert.strictEqual(READ.jobTitle, 'jobtitle');
  assert.strictEqual(READ.city, 'city');
});

test('the lookup input joins all four parts, the way app.html builds it', () => {
  assert.strictEqual(
    buildPersonInput({ fullName: 'Bill Gates', company: 'Microsoft', location: 'Seattle', jobTitle: 'Co-chair' }),
    'Bill Gates Microsoft Seattle Co-chair',
  );
});

test('parts a portal has not filled in are dropped, not sent as blanks', () => {
  assert.strictEqual(
    buildPersonInput({ fullName: 'Bill Gates', company: 'Microsoft', location: '', jobTitle: null }),
    'Bill Gates Microsoft',
  );
  assert.strictEqual(buildPersonInput({ fullName: 'Bill Gates' }), 'Bill Gates');
});

test('a location is however much of city, region and country the portal has', () => {
  assert.strictEqual(locationOf({ city: 'Seattle', state: 'WA', country: 'US' }, READ), 'Seattle WA US');
  assert.strictEqual(locationOf({ city: 'Seattle' }, READ), 'Seattle');
  assert.strictEqual(locationOf({}, READ), '');
});

test('a name imported as "Doe, John" is looked up as "John Doe"', () => {
  assert.strictEqual(flipName('Gates, Bill'), 'Bill Gates');
  assert.strictEqual(
    buildPersonInput({ fullName: 'Gates, Bill', company: 'Microsoft' }),
    'Bill Gates Microsoft',
  );
  assert.deepStrictEqual(Object.assign({}, splitName('Gates, Bill')), { first: 'Bill', last: 'Gates' });
});

test('a name that is not "Last, First" is left exactly as it is', () => {
  assert.strictEqual(flipName('Bill Gates'), 'Bill Gates');
  assert.strictEqual(flipName('Jean-Luc de la Fontaine'), 'Jean-Luc de la Fontaine');
  // Two commas is a list, not a flip.
  assert.strictEqual(flipName('Gates, Bill, Jr'), 'Gates, Bill, Jr');
  assert.deepStrictEqual(Object.assign({}, splitName('Bill Gates')), { first: 'Bill', last: 'Gates' });
});

test('the company is not flipped even when it contains a comma', () => {
  assert.strictEqual(
    buildPersonInput({ fullName: 'Bill Gates', company: 'Gates, Foundation' }),
    'Bill Gates Gates, Foundation',
  );
});

test('the sync still sends the composite input for every name lookup', () => {
  // Both the email lookup and the LinkedIn one, including the second LinkedIn
  // call the phone chain makes when it has to derive a URL first.
  const calls = src.match(/type: 'lead_full_name_to_(?:email|linkedin_url)', input_data: ([^,]+),/g) ?? [];
  assert.strictEqual(calls.length, 3, 'expected three name lookups in the sync');
  for (const call of calls) {
    assert.match(call, /input_data: personInput,/, `a name lookup is not using the joined input: ${call}`);
  }
});

test('a transient HubSpot response is retried rather than dropped', () => {
  // A dropped 429 meant a contact was enriched, charged, and never written back.
  assert.match(src, /PROXY_RETRY_STATUSES = new Set\(\[429, 502, 503, 504\]\)/);
  assert.match(src, /Retry-After/);
  assert.match(src, /attempt === PROXY_MAX_ATTEMPTS\) return r/);
});

test('the write-back names its provider, so it cannot land in the wrong CRM', () => {
  const patch = src.slice(src.indexOf('/crm/v3/objects/contacts/${contact.id}`, {'));
  assert.match(patch.slice(0, 400), /\}, record\.providerConfigKey\)/);
});

test('the header no longer understates what a run costs', () => {
  const header = src.slice(0, src.indexOf('*/'));
  assert.match(header, /email\s+7 credits/);
  assert.match(header, /phone\s+50 credits/);
  assert.ok(!/phone\s+1-2 credits/.test(header), 'the old 1-2 credit claim is back');
});
