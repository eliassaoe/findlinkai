'use strict';

const test = require('node:test');
const assert = require('node:assert');

/**
 * Zapier's own schema validation — the same check `zapier validate` runs, and the one
 * their marketplace review runs. Kept as a test so a generator change cannot produce an
 * app that only fails at submission time.
 *
 * Note it validates the COMPILED app. Running the validator against the raw definition
 * reports ~22 false errors, because `perform`, `beforeRequest` and `authentication.test`
 * are still live functions at that point and only become schema-shaped once compiled.
 * Validating the raw form and "fixing" what it reports would break a working app.
 */
test('the app passes Zapier schema validation', () => {
  let schema;
  try {
    schema = require('zapier-platform-core/src/tools/schema');
  } catch {
    // Dependencies are only needed for this check; the rest of the suite runs without them.
    return void console.log('skipped — run `npm install` in integrations/zapier first');
  }

  const app = require('../index.js');
  const errors = schema.validateApp(schema.compileApp(app));

  assert.deepStrictEqual(
    errors.map((e) => `${e.property}: ${e.message}`),
    [],
    'Zapier would reject this app at submission',
  );
});

test('the app definition exposes what Zapier expects of it', () => {
  let app;
  try {
    app = require('../index.js');
  } catch {
    return void console.log('skipped — run `npm install` in integrations/zapier first');
  }

  assert.ok(app.platformVersion, 'no platformVersion');
  assert.ok(app.version, 'no version');
  assert.strictEqual(app.authentication.type, 'custom');
  assert.strictEqual(app.beforeRequest.length, 1, 'the bearer-token middleware is not attached');
  assert.strictEqual(Object.keys(app.searches).length, 20);
});
