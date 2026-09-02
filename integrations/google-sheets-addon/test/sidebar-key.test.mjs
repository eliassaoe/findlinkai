/**
 * The API key, entered in the panel itself.
 *
 * Reported from real use: the key had to be set in a separate Settings dialog,
 * and after saving it the panel stayed disabled until the whole page was
 * reloaded. Both halves of that are the same cause — a dialog is a different
 * window, so it cannot tell the sidebar anything. The sidebar's own
 * `isApiKeyConfigured()` ran once at load and nothing ever asked again.
 *
 * These pin the fix: the panel takes the key itself, and enables the run in the
 * success handler rather than waiting for a reload.
 *
 * Run: node --test test/sidebar-key.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADDON = dirname(dirname(fileURLToPath(import.meta.url)));
const sidebar = readFileSync(join(ADDON, 'Sidebar.html'), 'utf8');
const script = sidebar.match(/<script>([\s\S]*)<\/script>/)[1];

/** Just enough DOM for the key section: nodes that remember what was set. */
function fakeDom() {
  const nodes = {};
  const make = (id) => ({
    id,
    innerHTML: '',
    value: '',
    disabled: false,
    textContent: '',
    onclick: null,
    addEventListener(type, fn) { (this.listeners ??= {})[type] = fn; },
    focus() {},
    // The key section re-renders by writing innerHTML; whatever ids appear in it
    // have to become findable, the way a browser would.
    get children() { return this.innerHTML; },
  });
  return {
    nodes,
    getElementById(id) {
      // An element only exists if some rendered markup mentions its id.
      if (!nodes[id]) {
        const rendered = Object.values(nodes).some((n) => n.innerHTML.includes(`id="${id}"`));
        if (!rendered && !['key', 'go', 'status'].includes(id)) return null;
        nodes[id] = make(id);
      }
      return nodes[id];
    },
    querySelector(sel) {
      const cls = sel.replace('.', '');
      const hit = Object.values(nodes).some((n) => n.innerHTML.includes(`class="${cls}"`));
      return hit ? make(sel) : null;
    },
    querySelectorAll() { return []; },
  };
}

/** Loads the key-handling part of the sidebar against that DOM. */
function panel({ configured = false, saveFails = null } = {}) {
  const calls = [];
  const dom = fakeDom();

  const runApi = {
    withSuccessHandler(fn) { runApi._ok = fn; return runApi; },
    withFailureHandler(fn) { runApi._fail = fn; return runApi; },
    isApiKeyConfigured() { calls.push('isApiKeyConfigured'); runApi._ok(configured); },
    saveApiKey(key) {
      calls.push(['saveApiKey', key]);
      if (saveFails) runApi._fail(new Error(saveFails));
      else runApi._ok({ success: true, message: 'saved' });
    },
    getOperations() {}, getSheetInfo() {}, runEnrichment() {},
  };

  const ctx = { document: dom, google: { script: { run: runApi } }, setTimeout, calls };
  vm.createContext(ctx);

  // Only the key section — the rest needs a real sheet and a real select element.
  const lifted = ['esc', 'el', 'renderKey', 'saveKey', 'setRunnable'].map((name) => {
    const start = script.indexOf(`function ${name}(`);
    assert.ok(start > 0, `Sidebar.html no longer defines ${name}`);
    let i = script.indexOf('(', start), parens = 0;
    for (; i < script.length; i++) {
      if (script[i] === '(') parens++;
      else if (script[i] === ')' && --parens === 0) break;
    }
    let depth = 0;
    for (i = script.indexOf('{', i); i < script.length; i++) {
      if (script[i] === '{') depth++;
      else if (script[i] === '}' && --depth === 0) break;
    }
    return script.slice(start, i + 1);
  }).join('\n');

  vm.runInContext(`var hasKey = ${configured};\n${lifted}`, ctx);
  return { ctx, dom, calls };
}

test('with no key the panel asks for one itself, rather than pointing at a menu', () => {
  const { ctx, dom } = panel({ configured: false });
  ctx.renderKey();

  const html = dom.getElementById('key').innerHTML;
  assert.match(html, /id="keyInput"/, 'no field to paste a key into');
  assert.match(html, /id="keySave"/, 'no way to save it');
  assert.match(html, /Add your API key/i);
  // The old copy sent people to Extensions > Settings. That is the bug.
  assert.ok(!/Settings/i.test(html), 'the panel still sends people to another window');
});

test('saving the key enables the run immediately — no reload', () => {
  const { ctx, dom, calls } = panel({ configured: false });
  ctx.renderKey();
  ctx.setRunnable(false);
  assert.strictEqual(dom.getElementById('go').disabled, true);

  dom.getElementById('keyInput').value = 'lf_live_key';
  ctx.saveKey();

  assert.deepStrictEqual(calls.at(-1), ['saveApiKey', 'lf_live_key'], 'the key never reached the server');
  assert.strictEqual(dom.getElementById('go').disabled, false,
    'the run is still disabled after saving — this is the reload bug');
  assert.strictEqual(ctx.hasKey, true);
});

test('a key already saved shows as saved, with a way to change it', () => {
  const { ctx, dom } = panel({ configured: true });
  ctx.renderKey();

  const html = dom.getElementById('key').innerHTML;
  assert.match(html, /API key saved/);
  assert.match(html, /id="keyChange"/, 'no way to replace a key that stopped working');
  assert.ok(!/id="keyInput"/.test(html), 'the key field should be out of the way once set');
});

test('an empty key is refused before it reaches the server', () => {
  const { ctx, dom, calls } = panel({ configured: false });
  ctx.renderKey();
  dom.getElementById('keyInput').value = '   ';
  ctx.saveKey();

  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === 'saveApiKey'), 'blank key was sent');
  assert.match(dom.getElementById('key').innerHTML, /Paste your key first/);
});

test('a rejected key says so and leaves the field up', () => {
  const { ctx, dom } = panel({ configured: false, saveFails: 'Invalid API key.' });
  ctx.renderKey();
  dom.getElementById('keyInput').value = 'wrong';
  ctx.saveKey();

  const html = dom.getElementById('key').innerHTML;
  assert.match(html, /Invalid API key/);
  assert.match(html, /id="keyInput"/, 'the field must stay so it can be corrected');
});

test('the run button never re-enables itself while there is no key', () => {
  // A finished run used to set `go.disabled = false` unconditionally, which would
  // hand back a usable button to someone whose key had just been rejected.
  assert.ok(!/el\('go'\)\.disabled = false/.test(script),
    'something still enables the run button without checking for a key');
  assert.match(script, /setRunnable\(hasKey\)/);
});
