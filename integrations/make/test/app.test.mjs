import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(ROOT, '..', 'catalog', 'operations.json'), 'utf8'));
const read = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

const moduleDirs = readdirSync(join(ROOT, 'modules'));

test('every catalog operation has a module', () => {
  assert.strictEqual(moduleDirs.length, catalog.operations.length);
  for (const op of catalog.operations) {
    assert.ok(moduleDirs.includes(op.key), `no Make module for ${op.type}`);
  }
});

test('every module has the files Make requires, and they are valid JSON', () => {
  for (const dir of moduleDirs) {
    for (const file of ['metadata.json', 'api.imljson', 'parameters.imljson', 'interface.imljson', 'samples.imljson']) {
      assert.ok(existsSync(join(ROOT, 'modules', dir, file)), `${dir} is missing ${file}`);
      assert.doesNotThrow(() => read('modules', dir, file), `${dir}/${file} is not valid JSON`);
    }
  }
});

test('every module posts the right operation type and binds its parameters', () => {
  for (const op of catalog.operations) {
    const api = read('modules', op.key, 'api.imljson');
    assert.strictEqual(api[0].body.type, op.type);
    assert.strictEqual(api[0].body.input_data, '{{parameters.input_data}}');

    const paramNames = read('modules', op.key, 'parameters.imljson').map((p) => p.name);
    for (const param of op.params) {
      assert.ok(paramNames.includes(param.name), `${op.key} does not expose ${param.name}`);
      assert.strictEqual(api[0].body[param.name], `{{parameters.${param.name}}}`);
    }
  }
});

test('every module polls the job endpoint, since any operation can return a job', () => {
  for (const op of catalog.operations) {
    const api = read('modules', op.key, 'api.imljson');
    const poll = api.find((step) => step.url && step.url.includes('/status/'));
    assert.ok(poll, `${op.key} has no polling step`);
    assert.strictEqual(poll.condition, '{{temp.pending}}');
    assert.ok(poll.repeat.limit > 0, `${op.key} polls without a limit`);
  }
});

test('list operations emit one bundle per item, scalars are given a field name', () => {
  for (const op of catalog.operations) {
    const output = read('modules', op.key, 'api.imljson').at(-1).response;
    if (op.output.kind === 'list') {
      assert.strictEqual(output.iterate, '{{temp.result}}', `${op.key} should iterate`);
    } else if (op.output.kind === 'scalar') {
      assert.strictEqual(output.output[op.output.field], '{{temp.result}}', `${op.key} should name its scalar`);
    }
  }
});

test('every module states its real credit cost', () => {
  const byKey = Object.fromEntries(catalog.operations.map((o) => [o.key, o]));
  for (const dir of moduleDirs) {
    const { description } = read('modules', dir, 'metadata.json');
    const op = byKey[dir];
    const expected = op.perEmployeeBilling ? '0.5 credits per employee' : `${op.credits} credit`;
    assert.ok(description.includes(expected), `${dir} description omits its cost (${expected})`);
  }
});

test('modules declare the connection, and the connection test costs no credits', () => {
  for (const dir of moduleDirs) {
    assert.strictEqual(read('modules', dir, 'metadata.json').connection, 'linkfinderai');
  }
  const api = read('connections', 'linkfinderai', 'api.imljson');
  assert.strictEqual(api.method, 'GET', 'the connection test must not POST an enrichment');
  assert.ok(api.url.startsWith('/status/'));
});

test('the base handles the documented error codes once, for all modules', () => {
  const errors = read('general', 'base.imljson').response.error;
  for (const code of ['401', '402', '422', '429']) {
    assert.ok(errors[code], `base.imljson does not handle ${code}`);
  }
});
