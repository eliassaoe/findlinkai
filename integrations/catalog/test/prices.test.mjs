/**
 * Every price quoted to a customer, against the catalog that bills them.
 *
 * There are four independent credit tables in this product, written by hand at
 * four different times:
 *
 *   app.html            creditCosts       the authoritative one, used to charge
 *   js/lf-crm-audit.js  CREDIT_COST       the CSV audit — starts from a profile
 *   crm-sync.html       CLEAN_COST        the HubSpot sync — starts from a name
 *   worker.js           a header comment  said 1 / 1 / 1-2 and was wrong by 50x
 *
 * The audit table and the sync table quote different numbers for "email" — 10
 * against 7 — and both are correct, because they run different operations:
 * linkedin_profile_to_email costs 10, lead_full_name_to_email costs 7. That is
 * exactly why hand-maintained tables survive review: a wrong number and a right
 * one look identical without the operation beside them.
 *
 * So each table names its operations here, and each is checked against the
 * catalog. A price change in openapi.json now fails this test until every place
 * that quotes it is updated.
 *
 * Run: node --test test/prices.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = join(HERE, '..', '..');

const catalog = JSON.parse(readFileSync(join(HERE, 'operations.json'), 'utf8'));
const priceOf = (type) => {
  const op = catalog.operations.find((o) => o.type === type);
  assert.ok(op, `${type} is not in the catalog`);
  return op.credits;
};

/** Pulls `key: 123` out of a hand-written object literal in a source file. */
function quoted(source, block, key) {
  const at = source.indexOf(block);
  assert.ok(at > 0, `could not find ${block}`);
  const m = source.slice(at, at + 800).match(new RegExp(`\\b${key}\\s*:\\s*(\\d+)`));
  assert.ok(m, `${block} does not quote a price for ${key}`);
  return Number(m[1]);
}

test('app.html charges what the catalog says', () => {
  const app = readFileSync(join(REPO, 'app.html'), 'utf8');
  const block = app.slice(app.indexOf('creditCosts'));

  let checked = 0;
  for (const op of catalog.operations) {
    const m = block.match(new RegExp(`\\b${op.type}['\"]?\\s*:\\s*(\\d+)`));
    if (!m) continue;
    assert.strictEqual(Number(m[1]), op.credits, `app.html charges ${m[1]} for ${op.type}, catalog says ${op.credits}`);
    checked++;
  }
  assert.ok(checked >= 8, `only ${checked} operations found in app.html — has creditCosts moved?`);
});

test('the CSV audit quotes the profile-based prices correctly', () => {
  const js = readFileSync(join(REPO, 'js', 'lf-crm-audit.js'), 'utf8');

  // The audit starts from a LinkedIn URL or an email already in the file, so it
  // runs the profile lookups — the expensive ones.
  assert.strictEqual(quoted(js, 'var CREDIT_COST', 'email'), priceOf('linkedin_profile_to_email'));
  assert.strictEqual(quoted(js, 'var CREDIT_COST', 'phone'), priceOf('linkedin_profile_to_phone'));
  assert.strictEqual(quoted(js, 'var CREDIT_COST', 'linkedin'), priceOf('email_to_linkedin_url'));
  assert.strictEqual(quoted(js, 'var CREDIT_COST', 'title'), priceOf('linkedin_profile_to_linkedin_info'));
  assert.strictEqual(quoted(js, 'var CREDIT_COST', 'company'), priceOf('company_name_to_website'));
});

test('the HubSpot sync quotes the name-based prices correctly', () => {
  const page = readFileSync(join(REPO, 'crm-sync.html'), 'utf8');

  // The sync starts from a name on a HubSpot contact, so it runs the cheaper
  // name lookups for email and LinkedIn — and the same expensive one for phone,
  // because a phone number only ever comes from a profile URL.
  assert.strictEqual(quoted(page, 'const CLEAN_COST', 'email'), priceOf('lead_full_name_to_email'));
  assert.strictEqual(quoted(page, 'const CLEAN_COST', 'linkedin_url'), priceOf('lead_full_name_to_linkedin_url'));
  assert.strictEqual(quoted(page, 'const CLEAN_COST', 'phone'), priceOf('linkedin_profile_to_phone'));
});

test('the sync worker no longer understates a run by 25x', () => {
  const worker = readFileSync(join(REPO, 'workers', 'nango-connect-session', 'worker.js'), 'utf8');
  const header = worker.slice(0, worker.indexOf('*/'));

  assert.match(header, new RegExp(`email\\s+${priceOf('lead_full_name_to_email')} credits`));
  assert.match(header, new RegExp(`phone\\s+${priceOf('linkedin_profile_to_phone')} credits`));
});

test('the two tables disagree on email only because they run different lookups', () => {
  // If these ever become the same operation, the difference is a bug rather than
  // a fact, and this test should be deleted along with one of the tables.
  assert.notStrictEqual(
    priceOf('linkedin_profile_to_email'),
    priceOf('lead_full_name_to_email'),
    'the two email lookups now cost the same — the audit and sync tables can be merged',
  );
});
