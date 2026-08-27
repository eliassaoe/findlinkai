/**
 * The three things crm-sync.html now tells a HubSpot user that it did not before.
 *
 * Each of these is a real failure the page used to hide:
 *
 *   1. Clicking "Clean my HubSpot now" spent up to 1,450 credits with no figure
 *      shown anywhere first.
 *   2. The worker returned counts for every contact it skipped and every search
 *      that found nothing, and the page rendered only "looked at 25, filled 3" —
 *      so "22 contacts have no website property" was indistinguishable from
 *      "22 people could not be found".
 *   3. The LinkedIn property was hardcoded to `linkedinbio`. A portal that uses
 *      anything else ran the sync, paid for the lookups, wrote into a property
 *      that does not exist, and reported success.
 *
 * The page is one large inline script against a live DOM, so rather than boot it,
 * these lift the pure render functions out and run them against stubs — the same
 * approach the worker's own tests use.
 *
 * Run: node --test tests/crm-sync-ui.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(join(REPO, 'crm-sync.html'), 'utf8');

/** Lifts named top-level functions out of the page's script. */
function lift(names) {
  let code = '';
  for (const name of names) {
    const start = page.indexOf(`function ${name}(`);
    assert.ok(start > 0, `crm-sync.html no longer defines ${name}`);
    let i = page.indexOf('(', start), parens = 0;
    for (; i < page.length; i++) {
      if (page[i] === '(') parens++;
      else if (page[i] === ')' && --parens === 0) break;
    }
    let depth = 0;
    for (i = page.indexOf('{', i); i < page.length; i++) {
      if (page[i] === '{') depth++;
      else if (page[i] === '}' && --depth === 0) break;
    }
    code += `${page.slice(start, i + 1)}\n`;
  }
  return code;
}

/** The page's own CLEAN_COST / CLEAN_LABEL literals, not a copy of them. */
function literal(declaration) {
  const at = page.indexOf(declaration);
  assert.ok(at > 0, `crm-sync.html no longer declares ${declaration}`);
  return page.slice(at, page.indexOf(';', at) + 1);
}

function context(extra = {}) {
  const ctx = {
    LFCrmAudit: { fmt: (n) => Number(n).toLocaleString('en-US') },
    document: { getElementById: () => null },
    ...extra,
  };
  vm.createContext(ctx);
  vm.runInContext(
    `${literal('const CLEAN_COST')}\n${literal('const CLEAN_LABEL')}\n` +
      lift(['esc', 'cleanCostCeiling', 'cleanCostNote', 'cleanOutcome', 'propertyRow']),
    ctx,
  );
  return ctx;
}

// ---------------------------------------------------------------------------
// 1. What a pass can cost, before it runs
// ---------------------------------------------------------------------------

test('the cost of a pass is quoted before the button that spends it', () => {
  const ctx = context({ cleanFields: ['linkedin_url', 'email'] });
  vm.runInContext(`const CLEAN_BATCH = ${page.match(/const CLEAN_BATCH = (\d+)/)[1]};`, ctx);

  // 1 credit for a LinkedIn URL + 7 for an email, across 25 contacts.
  assert.strictEqual(ctx.cleanCostCeiling(), (1 + 7) * 25);

  const html = ctx.cleanCostNote();
  assert.match(html, /Up to 200 credits/);
  assert.match(html, /8 per contact across 25/);
  assert.match(html, /still charged/, 'a miss costs the same and must be said');
});

test('turning phone on says how much that actually costs', () => {
  const ctx = context({ cleanFields: ['linkedin_url', 'email', 'phone'] });
  vm.runInContext(`const CLEAN_BATCH = ${page.match(/const CLEAN_BATCH = (\d+)/)[1]};`, ctx);

  assert.strictEqual(ctx.cleanCostCeiling(), (1 + 7 + 50) * 25);   // 1,450
  const html = ctx.cleanCostNote();
  assert.match(html, /Up to 1,450 credits/);
  assert.match(html, /clean-cost-warn/, 'a 1,450-credit pass should not look routine');
  assert.match(html, /50 credits each/);
});

// ---------------------------------------------------------------------------
// 2. Why the other contacts got nothing
// ---------------------------------------------------------------------------

test('a skipped contact is distinguished from one that was searched and missed', () => {
  const ctx = context();
  const html = ctx.cleanOutcome({
    processed: 25,
    noMatch: { email: 4, linkedin_url: 2, phone: 0 },
    skipped: { noName: 1, noDomainForEmail: 12, noCompanyForLinkedin: 3, alreadyComplete: 2 },
  });

  assert.match(html, /6 searched, nothing found/);
  assert.match(html, /charged/, 'a search that finds nothing is charged and must say so');

  assert.match(html, /12 skipped for email/);
  assert.match(html, /website/, 'the fixable reason must name the property to fill in');
  assert.match(html, /Not charged/);

  assert.match(html, /3 skipped for LinkedIn/);
  assert.match(html, /1 skipped:/);
  assert.match(html, /2 already had every field/);
});

test('a clean pass with nothing to explain says nothing', () => {
  const ctx = context();
  assert.strictEqual(
    ctx.cleanOutcome({ processed: 3, noMatch: { email: 0 }, skipped: {} }),
    '',
  );
  assert.strictEqual(ctx.cleanOutcome({}), '');
});

// ---------------------------------------------------------------------------
// 3. The property a portal does not have
// ---------------------------------------------------------------------------

const PORTAL = [
  { name: 'email', label: 'Email' },
  { name: 'phone', label: 'Phone Number' },
  { name: 'hs_linkedin_url', label: 'LinkedIn URL' },
];

test('a property this portal does not have is called out, not silently used', () => {
  const ctx = context({
    syncProperties: { email: 'email', linkedin_url: 'linkedinbio', phone: 'phone' },
    crmProperties: PORTAL,
  });

  const html = ctx.propertyRow('linkedin_url');
  assert.match(html, /linkedinbio — not in this portal/);
  assert.match(html, /Nothing will be written/);
  // The properties the portal does have are still offered, so it is fixable here.
  assert.match(html, /hs_linkedin_url/);
});

test('a property the portal does have is selected and raises no warning', () => {
  const ctx = context({
    syncProperties: { email: 'email', linkedin_url: 'hs_linkedin_url', phone: 'phone' },
    crmProperties: PORTAL,
  });

  const html = ctx.propertyRow('linkedin_url');
  assert.match(html, /value="hs_linkedin_url" selected/);
  assert.ok(!/not in this portal/.test(html));
  assert.ok(!/prop-warn/.test(html));
});

test('before the portal answers, the current property is shown rather than a blank', () => {
  const ctx = context({
    syncProperties: { email: 'email', linkedin_url: 'linkedinbio', phone: 'phone' },
    crmProperties: null,
  });
  const html = ctx.propertyRow('linkedin_url');
  assert.match(html, /linkedinbio/);
  assert.ok(!/not in this portal/.test(html), 'an unfetched list is not evidence the property is missing');
});

test('a property name is escaped, not interpolated raw', () => {
  const ctx = context({
    syncProperties: { email: 'email', linkedin_url: '"><script>x</script>', phone: 'phone' },
    crmProperties: PORTAL,
  });
  const html = ctx.propertyRow('linkedin_url');
  assert.ok(!html.includes('<script>x</script>'));
  assert.match(html, /&lt;script&gt;/);
});

// ---------------------------------------------------------------------------
// The settings the page sends
// ---------------------------------------------------------------------------

test('settings carry both the new key and the one older records used', () => {
  // The worker reads `property` first and falls back to `hubspotProperty`.
  // Sending both means a rollback of the worker still finds a property name.
  const source = page.slice(page.indexOf('function fieldsPayload('));
  assert.match(source.slice(0, 600), /property: syncProperties\[key\]/);
  assert.match(source.slice(0, 600), /hubspotProperty: syncProperties\[key\]/);
});
