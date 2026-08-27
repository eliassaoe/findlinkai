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

// ---------------------------------------------------------------------------
// The Google Sheets add-on is reachable from the places people actually are
// ---------------------------------------------------------------------------

/*
 * The add-on is one of the three surfaces this product is meant to be used
 * through, alongside the API and the CRM sync — and it was linked from exactly
 * one page nobody visits. These assert the routes into it, because a feature
 * that has to be searched for is a feature that does not get adopted.
 */

const MARKETPLACE = 'workspace.google.com/marketplace/app/linkfinder_ai/1096371450007';
const read = (name) => readFileSync(join(REPO, name), 'utf8');

test('the app menu has an Integrations tab, between CRM Sync and History', () => {
  const app = read('app.html');
  const nav = app.slice(app.indexOf('<nav class="nav-menu">'), app.indexOf('</nav>'));
  const order = [...nav.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]);

  assert.ok(order.includes('integrations'), 'no Integrations tab');
  assert.strictEqual(
    order.indexOf('integrations'),
    order.indexOf('crmSync') + 1,
    'Integrations should sit straight after CRM Sync',
  );
  assert.ok(order.indexOf('integrations') < order.indexOf('history'), 'Integrations should come before History');

  // A tab that does not route anywhere is a dead tab. It must reach the app
  // page — the destination test below pins which one, and why.
  assert.match(app, /case 'integrations':[^\n]*linkfinderai\.com\/app-integrations/);
});

test('Google Sheets leads the integrations hub', () => {
  const hub = read('integrations.html');
  const first = [...hub.matchAll(/int-name">([^<]+)</g)][0][1];
  assert.strictEqual(first, 'Google Sheets', `the hub leads with ${first}`);
  assert.ok(hub.includes(MARKETPLACE), 'the hub does not link the add-on itself');
});

test('the CSV uploader offers the Sheets route, before and after a run', () => {
  // This is the moment the add-on is worth most: someone exporting a sheet,
  // uploading it, and about to paste the results back.
  const app = read('app.html');

  const upload = app.slice(app.indexOf('<div id="bulkSearch"'), app.indexOf('<div id="csvPreview"'));
  assert.ok(upload.includes(MARKETPLACE), 'nothing offers Sheets at the upload step');
  assert.match(upload, /already in Google Sheets/i);

  const results = app.slice(app.indexOf('<div id="bulkResults"'), app.indexOf('<div id="bulkResultsTable"'));
  assert.ok(results.includes(MARKETPLACE), 'nothing offers Sheets once results are in');

  // Both are measurable, or there is no way to know whether they work.
  const events = [...app.matchAll(/sheets_addon_clicked',\{source:'(\w+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(events.sort(), ['bulk_results', 'bulk_upload']);
});

test('the Sheets page links the add-on rather than only describing it', () => {
  const page = read('linkedIn-enrichment-google-sheets.html');
  assert.ok(page.includes(MARKETPLACE));
});

test('the lifecycle email that leads on bulk has a Sheets variant, not yet live', () => {
  const variants = JSON.parse(read(join('workers', 'lifecycle-email', 'variants.json')));
  const bulk = variants.steps.bulk_intro.variants;

  const sheets = bulk.find((v) => v.id === 'bulk-in-your-sheet');
  assert.ok(sheets, 'no Sheets variant in the bulk email');
  assert.ok(sheets.url.includes(MARKETPLACE), 'the variant does not link the add-on');

  // Queued, not champion: adding copy must never start sending it.
  assert.strictEqual(sheets.status, 'queued');
  assert.strictEqual(
    bulk.filter((v) => v.status === 'champion').length, 1,
    'a step must have exactly one champion',
  );
});

// ---------------------------------------------------------------------------
// The in-app integrations page
// ---------------------------------------------------------------------------

/*
 * The tab first pointed at /integrations, which is the signed-out landing page.
 * A logged-in user sent there sees marketing copy and "Live" badges that say
 * nothing about their own account. app-integrations.html is the app version: it
 * reads what THIS account has connected.
 */

test('the app tab goes to the app page, not the marketing one', () => {
  const app = read('app.html');
  const route = app.slice(app.indexOf("case 'integrations'"), app.indexOf("case 'integrations'") + 220);

  assert.match(route, /app-integrations/, 'the tab still points at the landing page');
  assert.ok(
    !/linkfinderai\.com\/integrations\?token/.test(app),
    'something still sends a signed-in user to the signed-out page',
  );
});

test('the page is an app page: token-gated and kept out of search', () => {
  const page = read('app-integrations.html');
  assert.match(page, /<meta name="robots" content="noindex"/, 'an app page must not be indexed');

  // Built from account.html's chrome, which carried its own title and canonical.
  // The canonical is the one that matters: left in, it tells Google this page IS
  // /account, and a wrong canonical on a noindex page is a wrong signal about a
  // page that does rank.
  assert.strictEqual((page.match(/<title>/g) || []).length, 1, 'more than one title');
  assert.match(page, /<title>Integrations/);
  assert.ok(!/rel="canonical"/.test(page), 'a noindexed app page should claim no canonical');

  assert.match(page, /function checkAuth\(\)/);
  assert.match(page, /linkFinderToken/);
  // No token means no page — the same rule account.html follows.
  assert.match(page, /if \(!token\) \{ window\.location\.href = 'https:\/\/linkfinderai\.com\/'/);
});

test('it wears the app chrome, with Integrations marked active', () => {
  const page = read('app-integrations.html');
  const nav = page.slice(page.indexOf('<nav class="nav-menu">'), page.indexOf('</nav>'));

  for (const tab of ['Data Enrichment', 'API &amp; MCP', 'CRM Sync', 'Integrations', 'History', 'Account']) {
    assert.ok(nav.includes(tab), `the nav is missing ${tab}`);
  }
  assert.match(nav, /nav-tab active"><i class="fas fa-puzzle-piece"><\/i> Integrations/);
  // The credits header and logout, like every other app page.
  assert.match(page, /id="creditsCount"/);
  assert.match(page, /onclick="logout\(\)"/);
});

test('it reads this account state rather than showing everyone the same badges', () => {
  // This is the whole reason for an app page over the marketing one.
  const page = read('app-integrations.html');
  assert.match(page, /nango-connect-session[^']*'\s*;/, 'it never asks whether HubSpot is connected');
  assert.match(page, /loadHubspotState/);
  assert.match(page, /loadApiState/);
  assert.match(page, /setState\('hubspotState', 'connected', 'on'\)/);
});

test('Google Sheets is first and singled out', () => {
  const page = read('app-integrations.html');
  const body = page.slice(page.indexOf('<div class="integrations-grid">'));
  const first = body.slice(0, body.indexOf('</div>\n        </div>'));

  assert.match(first, /Google Sheets/);
  assert.match(first, /int-featured/, 'it is not visually singled out');
  assert.ok(first.includes(MARKETPLACE), 'the add-on is not linked from the card');
});

test('the three states mean three different things', () => {
  // "in review" is somebody else's queue; "ask for it" is ours. Collapsing them
  // makes the interest signal meaningless.
  const page = read('app-integrations.html');
  const states = page.slice(page.indexOf('const STATE = {'), page.indexOf('function cardFor'));

  assert.match(states, /live:\s*\{ label:'live'/);
  assert.match(states, /review:\s*\{ label:'in review'/);
  assert.match(states, /ready:\s*\{ label:'ask for it'/);
});

test('every app page can reach the tab', () => {
  for (const file of ['app.html', 'account.html', 'crm-sync.html']) {
    const page = read(file);
    assert.ok(page.includes('app-integrations'), `${file} cannot route to the integrations page`);
    assert.match(page, /Integrations<\/button>|Integrations<\/a>/, `${file} has no Integrations tab`);
  }
});

test('no app page hides nav tabs behind a horizontal scroll', () => {
  // Every app page shared `.nav-tabs{overflow-x:auto}`, so a sixth tab pushed
  // Account off the right edge with only a scrollbar to find it. Wrapping is
  // the fix: at any width every tab is on screen.
  const pages = ['app.html', 'account.html', 'crm-sync.html', 'history.html',
                 'api-access.html', 'app-integrations.html'];

  for (const file of pages) {
    const css = read(file).match(/\.nav-tabs\{[^}]*\}/);
    assert.ok(css, `${file} has no .nav-tabs rule`);
    assert.ok(!/overflow-x/.test(css[0]), `${file} still scrolls its nav instead of wrapping`);
    assert.match(css[0], /flex-wrap:\s*wrap/, `${file} does not wrap its nav`);
  }
});

test('the nav bar is wider than the reading column, so six tabs fit one row', () => {
  // Content is deliberately 680px — one readable column. The nav has no reason
  // to be, and constraining it there is what forced the wrap in the first place.
  for (const file of ['app.html', 'account.html', 'app-integrations.html']) {
    const page = read(file);
    assert.match(page, /\.container\{max-width:680px/, `${file} changed its content width`);
    assert.match(page, /\.nav-menu \.container\{max-width:1100px;\}/, `${file} still constrains its nav to the reading column`);
    // And gives it back on a narrow screen, rather than overflowing.
    assert.match(page, /@media\(max-width:1140px\)\{ \.nav-menu \.container\{max-width:100%;\} \}/, `${file} would overflow below 1140px`);
  }
});
