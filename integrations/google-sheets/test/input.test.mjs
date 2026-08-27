/**
 * The lookup input, checked against the string app.html builds.
 *
 * This is the behaviour a real user reported missing: the app joins name,
 * company, location and job title for the two name-based lookups, and every
 * integration exposed a single field. If these drift again, the add-on quietly
 * sends worse inputs than the app for the most-used operation in the product.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (f) => readFileSync(join(HERE, '..', f), 'utf8');

// The .gs files are plain globals; evaluate the two we need together.
const ctx = {};
new (await import('node:vm')).Script(load('Operations.gs') + '\n' + load('Code.gs'))
  .runInNewContext(ctx, { timeout: 5000 });

const { buildInput, flipName, lfOperation, requiredPartName } = ctx;
const NAME_OP = lfOperation('lead_full_name_to_email');
const PLAIN_OP = lfOperation('company_name_to_website');

test('the composite lookups are the two name-based ones', () => {
  assert.ok(NAME_OP.compositeInput, 'lead_full_name_to_email should take several parts');
  assert.strictEqual(PLAIN_OP.compositeInput, null, 'a company lookup takes one value');
  // Array.from rebuilds it in this realm: the .gs files are evaluated in a vm
  // context, and deepStrictEqual compares prototypes across realms.
  assert.deepStrictEqual(
    Array.from(NAME_OP.compositeInput.parts, (p) => p.name),
    ['name', 'company', 'location', 'job_title'],
  );
});

test('all four parts join in order, exactly as app.html builds them', () => {
  assert.strictEqual(
    buildInput(NAME_OP, { name: 'Bill Gates', company: 'Microsoft', location: 'Seattle', job_title: 'Co-chair' }),
    'Bill Gates Microsoft Seattle Co-chair',
  );
});

test('blank parts are dropped rather than leaving double spaces', () => {
  assert.strictEqual(
    buildInput(NAME_OP, { name: 'Bill Gates', company: '', location: 'Seattle', job_title: null }),
    'Bill Gates Seattle',
  );
  assert.strictEqual(buildInput(NAME_OP, { name: 'Bill Gates' }), 'Bill Gates');
});

test('a CRM-style "Last, First" name is flipped', () => {
  assert.strictEqual(flipName('Gates, Bill'), 'Bill Gates');
  assert.strictEqual(buildInput(NAME_OP, { name: 'Gates, Bill', company: 'Microsoft' }), 'Bill Gates Microsoft');
});

test('only the name is flipped — a company with a comma is left alone', () => {
  assert.strictEqual(
    buildInput(NAME_OP, { name: 'Bill Gates', company: 'Gates, Foundation' }),
    'Bill Gates Gates, Foundation',
  );
});

test('a name that is not "Last, First" is untouched', () => {
  assert.strictEqual(flipName('Bill Gates'), 'Bill Gates');
  assert.strictEqual(flipName('Jean-Luc de la Fontaine'), 'Jean-Luc de la Fontaine');
  // Two commas is a list, not a flip.
  assert.strictEqual(flipName('Gates, Bill, Jr'), 'Gates, Bill, Jr');
});

test('surrounding whitespace never reaches the lookup', () => {
  assert.strictEqual(buildInput(NAME_OP, { name: '  Bill Gates  ', company: ' Microsoft ' }), 'Bill Gates Microsoft');
});

test('a single-input lookup still takes one value', () => {
  assert.strictEqual(buildInput(PLAIN_OP, { input: '  Tesla ' }), 'Tesla');
  assert.strictEqual(requiredPartName(PLAIN_OP), 'input');
  assert.strictEqual(requiredPartName(NAME_OP), 'name');
});

test('no name means no lookup, whatever else is filled in', () => {
  // The bulk run gates on the required part, so this row is skipped unspent
  // rather than posting "Microsoft Seattle" as if it were a person.
  assert.strictEqual(buildInput(NAME_OP, { company: 'Microsoft', location: 'Seattle' }), 'Microsoft Seattle');
  assert.strictEqual(requiredPartName(NAME_OP), 'name');
});
