// The promise on every tool page is now "one free search, then the gate".
// These tests pin the three things that promise depends on: the limit is 1 and
// lives in one place, the gate opens without navigating away, and the result
// the visitor already has is what gets blurred behind it.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const gateSource = readFileSync(new URL('../js/lf-gate.js', import.meta.url), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

// ---- a DOM small enough to reason about, shaped like the real tool pages ----
function makeDom() {
  const listeners = {};
  const captured = [];

  function el(id, tag) {
    const node = {
      id, tagName: tag || 'DIV', style: {}, parentNode: null, nextSibling: null,
      _classes: new Set(),
      classList: {
        add: (c) => node._classes.add(c),
        remove: (c) => node._classes.delete(c),
        contains: (c) => node._classes.has(c),
        toggle: (c, on) => (on ? node._classes.add(c) : node._classes.delete(c)),
      },
      appendChild() {}, setAttribute() {}, getAttribute: () => null,
      insertBefore() {}, closest: () => null, textContent: '',
      observers: [],
    };
    return node;
  }

  const nodes = {};
  const parent = { insertBefore() {}, appendChild() {} };
  const doc = {
    readyState: 'complete',
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null,
    createElement: (t) => el(null, t.toUpperCase()),
    addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
  };

  const sandbox = {
    document: doc,
    window: {
      location: { pathname: '/linkedin-url-finder', href: 'https://linkfinderai.com/linkedin-url-finder' },
      addEventListener() {},
      posthog: { capture: (e, p) => captured.push({ event: e, props: p }) },
    },
    localStorage: { length: 0, getItem: () => null, key: () => null, setItem() {} },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe(target) { target.observers.push(this.cb); }
    },
  };
  sandbox.window.document = doc;
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.MutationObserver = sandbox.MutationObserver;

  return { sandbox, nodes, captured, parent,
    el(id, tag) { const n = el(id, tag); n.parentNode = parent; return n; },
    mutate(node) { node.observers.forEach((cb) => cb()); } };
}

function load(dom) {
  vm.createContext(dom.sandbox);
  vm.runInContext(gateSource, dom.sandbox);
  return dom.sandbox.window;
}

console.log('free tool gate');

test('the free-lookup limit is 1', () => {
  const dom = makeDom();
  assert.equal(load(dom).LF_FREE_LOOKUPS, 1);
});

test('lfOpenGate shows the modal instead of navigating away', () => {
  const dom = makeDom();
  const modal = dom.el('limitModal');
  dom.nodes.limitModal = modal;
  const win = load(dom);
  const before = win.location.href;

  assert.equal(win.lfOpenGate(), true);
  assert.equal(modal.style.display, 'flex');
  assert.equal(win.location.href, before, 'must not navigate');
});

test('lfOpenGate reports false when the page has no modal, so callers can fall back', () => {
  const dom = makeDom();
  const win = load(dom);
  assert.equal(win.lfOpenGate(), false);
});

test('opening the gate blurs the result already on screen', () => {
  const dom = makeDom();
  const modal = dom.el('limitModal');
  const results = dom.el('resultsSection');
  dom.nodes.limitModal = modal;
  dom.nodes.resultsSection = results;

  const win = load(dom);
  assert.equal(results.classList.contains('lf-gated-blur'), false);

  win.lfOpenGate();
  dom.mutate(modal);
  assert.equal(results.classList.contains('lf-gated-blur'), true);
});

test('closing the gate un-blurs the result', () => {
  const dom = makeDom();
  const modal = dom.el('limitModal');
  const results = dom.el('resultsSection');
  dom.nodes.limitModal = modal;
  dom.nodes.resultsSection = results;

  const win = load(dom);
  win.lfOpenGate();
  dom.mutate(modal);
  modal.style.display = 'none';
  dom.mutate(modal);
  assert.equal(results.classList.contains('lf-gated-blur'), false);
});

test('nothing is blurred when no result was ever rendered', () => {
  const dom = makeDom();
  const modal = dom.el('limitModal');
  const results = dom.el('resultsSection');
  results.classList.add('hidden');
  dom.nodes.limitModal = modal;
  dom.nodes.resultsSection = results;

  const win = load(dom);
  win.lfOpenGate();
  dom.mutate(modal);
  assert.equal(results.classList.contains('lf-gated-blur'), false);
});

test('the gate reports itself to PostHog exactly once per opening', () => {
  const dom = makeDom();
  const modal = dom.el('limitModal');
  dom.nodes.limitModal = modal;
  const win = load(dom);

  win.lfOpenGate();
  dom.mutate(modal);
  dom.mutate(modal);   // a second, unrelated attribute change

  const shown = dom.captured.filter((c) => c.event === 'free_limit_modal_shown');
  assert.equal(shown.length, 1);
  assert.equal(shown[0].props.free_lookups, 1);
  assert.equal(shown[0].props.tool, 'linkedin-url-finder');
});

// ---- the pages themselves ---------------------------------------------------

const pages = readdirSync(new URL('..', import.meta.url))
  .filter((f) => f.endsWith('.html'));

const toolPages = pages.filter((f) =>
  readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes('id="limitModal"'));

test('every tool page loads the shared gate', () => {
  assert.ok(toolPages.length >= 26, 'expected the full set of tool pages, saw ' + toolPages.length);
  for (const f of toolPages) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(s.includes('lf-gate.js'), f + ' does not load js/lf-gate.js');
  }
});

test('no tool page hardcodes its own free-lookup limit any more', () => {
  for (const f of toolPages) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(
      s.includes('LF_FREE_LOOKUPS'),
      f + ' never reads window.LF_FREE_LOOKUPS, so it enforces its own limit');
  }
});

test('a spent free lookup opens the gate rather than navigating away', () => {
  for (const f of toolPages) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');

    // Every place the page decides the visitor is out of free lookups.
    const guards = [
      ...s.matchAll(/if\s*\(\s*!check(?:Search)?Limit\(\)\s*\)/g),
      ...s.matchAll(/if\s*\(\s*searchCount\s*>=\s*(?:FREE_LIMIT|getSearchLimit\(\)|\(window\.LF_FREE_LOOKUPS)/g),
    ];
    assert.ok(guards.length > 0, f + ' has no free-lookup guard at all');

    for (const g of guards) {
      const branch = s.slice(g.index, g.index + 320);

      // A branch that delegates to showModal('signup') is gating in place only
      // if that function opens the modal rather than redirecting.
      const viaShowModal = /showModal\(\s*['"]signup['"]\s*\)/.test(branch)
        && s.slice(s.indexOf('function showModal'), s.indexOf('function showModal') + 900)
             .includes('lfOpenGate');

      const opensGate = branch.includes('limitModal') || branch.includes('lfOpenGate') || viaShowModal;
      const navigatesAway = /location\.href/.test(branch) && !opensGate;
      assert.ok(!navigatesAway,
        f + ': a spent free lookup navigates to sign-up instead of gating in place');
      assert.ok(opensGate,
        f + ': a spent free lookup neither opens #limitModal nor calls lfOpenGate');
    }
  }
});

test('no page still advertises more than one free search', () => {
  const stale = /\b(?:3|5|10|20)\s+free\s+searches\b/i;
  for (const f of toolPages) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const m = s.match(stale);
    assert.ok(!m, f + ' still promises "' + (m && m[0]) + '"');
  }
});

console.log('\n' + passed + ' passed');
