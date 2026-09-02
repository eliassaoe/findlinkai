/**
 * The "What you've found" section under Billing on account.html.
 *
 * This is the section a subscriber reads just before deciding whether to renew,
 * so the ways it can be wrong are the expensive kind:
 *
 *   1. Showing lookups instead of finds. Hit rates run from ~93% (company
 *      websites) to ~10% (mobile numbers), so counting attempts would claim
 *      several times the value that was actually delivered.
 *   2. A hero number that does not equal the tiles printed under it — the RPC
 *      also returns an `other` bucket, which has no tile.
 *   3. A brand-new account greeted by a wall of zeroes on its billing page.
 *
 * The page is one large inline script against a live DOM, so as elsewhere in
 * this repo the render functions are lifted out and run against stubs.
 *
 * Run: node --test tests/account-value.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(join(REPO, 'account.html'), 'utf8');

/** Lifts a named top-level function out of the page's script, braces balanced. */
function lift(name) {
  let start = page.indexOf(`function ${name}(`);
  assert.ok(start > 0, `account.html no longer defines ${name}`);
  if (page.slice(start - 6, start) === 'async ') start -= 6;
  let i = page.indexOf('{', page.indexOf(')', start));
  for (let depth = 0; i < page.length; i++) {
    if (page[i] === '{') depth++;
    else if (page[i] === '}' && --depth === 0) break;
  }
  return page.slice(start, i + 1);
}

/** A declaration verbatim from the page, up to its terminating line. */
function declaration(prefix, endsWith) {
  const at = page.indexOf(prefix);
  assert.ok(at > 0, `account.html no longer declares ${prefix}`);
  const end = page.indexOf(endsWith, at);
  assert.ok(end > at, `${prefix} no longer ends with ${endsWith}`);
  return page.slice(at, end + endsWith.length);
}

/** Just enough DOM for the section: the ids it writes into. */
function makeDom() {
  const ids = ['valueHero', 'valueHeroSub', 'valueHeroMeta', 'valueGrid',
               'valueRange30', 'valueRangeAll', 'valueSection'];
  const nodes = {};
  for (const id of ids) {
    nodes[id] = {
      textContent: '', innerHTML: '', style: {},
      _classes: new Set(id === 'valueRange30' ? ['active'] : []),
      classList: {
        toggle(c, on) { on ? nodes[id]._classes.add(c) : nodes[id]._classes.delete(c); },
        contains: (c) => nodes[id]._classes.has(c),
      },
    };
  }
  return { nodes, document: { getElementById: (id) => nodes[id] || null } };
}

function context(extra = {}) {
  const dom = makeDom();
  const ctx = {
    document: dom.document,
    posthog: { capture() {} },
    Number, String, Object, Array, Date, JSON, Math,
    ...extra,
  };
  vm.createContext(ctx);
  // `var`, not the page's `const`/`let`: a lexical declaration inside a vm
  // context is not reachable as a property of it, and these tests set and read
  // the state directly. The literals themselves are the page's, verbatim.
  const asVar = (s) => s.replace(/^const /, 'var ');
  vm.runInContext(
    [
      asVar(declaration('const VALUE_SUPABASE_URL =', ';')),
      asVar(declaration('const VALUE_SUPABASE_ANON_KEY =', ';')),
      asVar(declaration('const VALUE_TILES = [', '];')),
      asVar(declaration('const valueNum =', ';')),
      'var valueSummary = null;',
      "var valueRange = 'last_30';",
      lift('renderValueSummary'),
      lift('setValueRange'),
      lift('loadValueSummary'),
    ].join('\n'),
    ctx,
  );
  ctx.nodes = dom.nodes;
  return ctx;
}

/** The owner's real figures, as the RPC returns them. */
const REAL = {
  total: 4983,
  lookups: 5319,
  first_at: '2025-11-04T09:12:00+00:00',
  last_at: '2026-08-27T18:40:00+00:00',
  all_time: { emails: 721, people: 1054, phones: 244, profiles: 753,
              websites: 1534, companies: 550, profiles_full: 127 },
  last_30: { emails: 251, people: 345, phones: 80, profiles: 446,
             websites: 998, companies: 89, profiles_full: 25 },
};

const tileCount = (ctx) => (ctx.nodes.valueGrid.innerHTML.match(/class="value-tile"/g) || []).length;
const tileValues = (ctx) =>
  [...ctx.nodes.valueGrid.innerHTML.matchAll(/value-tile-value">([\d,]+)</g)].map((m) => m[1]);
const tileLabels = (ctx) =>
  [...ctx.nodes.valueGrid.innerHTML.matchAll(/value-tile-label">([^<]+)</g)].map((m) => m[1]);

// ---------------------------------------------------------------------------
// 1. The number is what was found, not what was tried
// ---------------------------------------------------------------------------

test('the hero counts finds, not lookups', () => {
  const ctx = context();
  ctx.valueSummary = REAL;
  ctx.renderValueSummary();

  // 5,319 lookups produced 2,234 finds in the last 30 days. Printing the
  // lookup count here would claim more than twice the value delivered.
  assert.strictEqual(ctx.nodes.valueHero.textContent, '2,234');
  assert.notStrictEqual(ctx.nodes.valueHero.textContent, '5,319');
});

test('the hero equals the tiles printed under it', () => {
  const ctx = context();
  // `other` is a real bucket in the RPC's output and has no tile. If the hero
  // took the RPC's own `total`, the page would print a number the rows below
  // it do not add up to.
  ctx.valueSummary = {
    ...REAL,
    total: 99999,
    last_30: { ...REAL.last_30, other: 4000 },
  };
  ctx.renderValueSummary();

  const shown = tileValues(ctx).reduce((s, v) => s + Number(v.replace(/,/g, '')), 0);
  assert.strictEqual(ctx.nodes.valueHero.textContent, shown.toLocaleString('en-US'));
  assert.strictEqual(shown, 2234, 'the untiled bucket must not inflate the hero');
  assert.doesNotMatch(ctx.nodes.valueGrid.innerHTML, /Other/i);
});

// ---------------------------------------------------------------------------
// 2. The tiles
// ---------------------------------------------------------------------------

test('a category with nothing in it is left out, not shown as a zero', () => {
  const ctx = context();
  ctx.valueSummary = { ...REAL, last_30: { emails: 12, phones: 0, websites: 3 } };
  ctx.renderValueSummary();

  assert.strictEqual(tileCount(ctx), 2);
  assert.deepStrictEqual(tileLabels(ctx), ['Email addresses', 'Websites']);
});

test('tiles keep a fixed order, so the row does not reshuffle as numbers move', () => {
  const a = context();
  a.valueSummary = { ...REAL, last_30: { websites: 5, emails: 900 } };
  a.renderValueSummary();

  const b = context();
  b.valueSummary = { ...REAL, last_30: { websites: 900, emails: 5 } };
  b.renderValueSummary();

  assert.deepStrictEqual(tileLabels(a), tileLabels(b));
});

test('every tile the RPC can fill has a label, and every label is short', () => {
  const ctx = context();
  const keys = ctx.VALUE_TILES.map((t) => t.key);
  // The categories user_value_summary() emits, minus `other` by design.
  for (const key of ['emails', 'phones', 'profiles', 'profiles_full', 'websites', 'companies', 'people']) {
    assert.ok(keys.includes(key), `no tile renders the RPC's ${key} bucket`);
  }
  for (const t of ctx.VALUE_TILES) {
    assert.ok(t.label.length <= 17, `"${t.label}" is long enough to wrap and leave the row ragged`);
  }
});

// ---------------------------------------------------------------------------
// 3. The range toggle
// ---------------------------------------------------------------------------

test('switching to all time changes the figures and says what they cover', () => {
  const ctx = context();
  ctx.valueSummary = REAL;
  ctx.renderValueSummary();
  assert.match(ctx.nodes.valueHeroSub.textContent, /last 30 days/);
  assert.strictEqual(ctx.nodes.valueHeroMeta.textContent, '', 'no since-line on the 30-day view');

  ctx.setValueRange('all_time');

  assert.strictEqual(ctx.nodes.valueHero.textContent, '4,983');
  assert.match(ctx.nodes.valueHeroSub.textContent, /since you started/);
  assert.match(ctx.nodes.valueHeroMeta.textContent, /5,319 lookups/);
  assert.match(ctx.nodes.valueHeroMeta.textContent, /2025/);
  assert.ok(ctx.nodes.valueRangeAll.classList.contains('active'));
  assert.ok(!ctx.nodes.valueRange30.classList.contains('active'));
});

test('a quiet 30 days points at the next run instead of printing a bare zero', () => {
  const ctx = context();
  ctx.valueSummary = { ...REAL, last_30: {} };
  ctx.renderValueSummary();

  assert.strictEqual(tileCount(ctx), 0);
  assert.match(ctx.nodes.valueGrid.innerHTML, /run an enrichment/);
});

// ---------------------------------------------------------------------------
// 4. Loading — and not loading
// ---------------------------------------------------------------------------

async function load(ctx, { token = 'tok_1', body, ok = true, throws = false } = {}) {
  ctx.userToken = token;
  ctx.fetch = async () => {
    if (throws) throw new Error('offline');
    return { ok, json: async () => body };
  };
  await ctx.loadValueSummary();
}

test('an account that has never run anything gets no section at all', async () => {
  const ctx = context();
  ctx.nodes.valueSection.style.display = 'none';
  await load(ctx, { body: { total: 0, lookups: 0, all_time: {}, last_30: {} } });

  assert.strictEqual(ctx.nodes.valueSection.style.display, 'none',
    'a wall of zeroes on the billing page is worse than nothing');
});

test('an account with results gets the section, filled in', async () => {
  const ctx = context();
  ctx.nodes.valueSection.style.display = 'none';
  await load(ctx, { body: REAL });

  assert.strictEqual(ctx.nodes.valueSection.style.display, '');
  assert.strictEqual(ctx.nodes.valueHero.textContent, '2,234');
  assert.strictEqual(tileCount(ctx), 7);
});

test('a failed or refused request leaves the page as it was', async () => {
  for (const opts of [{ ok: false, body: null }, { throws: true }, { token: '' }]) {
    const ctx = context();
    ctx.nodes.valueSection.style.display = 'none';
    await load(ctx, opts);
    assert.strictEqual(ctx.nodes.valueSection.style.display, 'none');
    assert.strictEqual(ctx.nodes.valueHero.textContent, '');
  }
});

test('the section reads its own account, and only over the published RPC', () => {
  const src = lift('loadValueSummary');
  assert.match(src, /rpc\/user_value_summary/);
  assert.match(src, /p_user_id: userToken/,
    'the summary must be scoped to the signed-in token, not fetched unfiltered');
  assert.doesNotMatch(src, /enrichment_history/,
    'counting belongs in the RPC — a page-side count is capped by the fetch limit');
});
