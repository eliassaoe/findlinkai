// The CSV / Google Sheets / API / CRM routes are offered INSIDE a result, after
// the value, and never as an interrupt. These tests pin that: the retired
// prompts stay retired, the panel is wired into every success path, the API
// snippet carries a real request, and the tool-page offer is spreadsheet-shaped
// and hands its ?intent= through sign-up and log-in to the app.
//
// Background and numbers: docs/next-step-routing.md.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('app.html');
const gate = read('js/lf-gate.js');
const signUp = read('sign-up.html');
const logIn = read('log-in.html');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('next-step routing');

// ---------------------------------------------------------------- retired
test('the interrupt-style prompts are gone from app.html', () => {
  for (const gone of [
    'function maybeShowBulkNudge',     // second-success top bar, 102 shown / 4 clicked
    'maybeShowBulkNudge(n)',
    'bulk_nudge_shown',
    'function maybeShowBulkTutorialPopup', // second-visit video popup, 170 / 3
    'maybeShowBulkTutorialPopup(lfVisitCount)',
    'bulk_tutorial_popup_shown',
    'id="bulkTutorialModal"',
    'id="bulkNudgeBanner"',
    "showOnboardingTasksPopup('second_enrichment')", // credits tasks auto-open, 154 shown / 145 dismissed
    "variant: 'next_step'",           // first-enrichment "Upload a CSV / See plans" bar
    'lf_third_enrichment_nudge_fired',
    "activation_nudge_shown', { step: 1",
    "activation_nudge_shown', { step: 3",
    'id="automationNudge"',
  ]) {
    assert.equal(app.includes(gone), false, gone + ' should no longer be in app.html');
  }
});

test('the credits-tasks panel is still reachable by hand and by link', () => {
  assert.ok(app.includes('openOnboardingTasksPopupManually'));
  assert.ok(app.includes("action==='tasks'"));
});

test('the surfaces that convert are untouched', () => {
  assert.ok(app.includes('bulk_results_gated_shown'));
  assert.ok(app.includes('credits_wall_rescue_shown'));
  assert.ok(app.includes('function renderGatedResults'));
});

// ---------------------------------------------------------------- panel wiring
test('every single-lookup success path renders the next-step panel', () => {
  const fn = app.slice(app.indexOf('async function enrichData(event)'), app.indexOf('function cipFounded('));
  const calls = fn.match(/renderNextStepPanel\('single'/g) || [];
  assert.equal(calls.length, 4, 'reactions, employee_count, employees, and the generic path');
  // and never on a miss
  assert.ok(!/Not found'\);\s*renderNextStepPanel/.test(fn));
});

test('the panel is rendered before the HubSpot action so the CRM slot exists', () => {
  const a = app.indexOf("renderNextStepPanel('single', { apiInput: effectiveInputValue");
  const b = app.indexOf('captureAndRenderHubspotAction(inputValue, data);');
  assert.ok(a > 0 && b > a);
  assert.ok(app.includes(`'<div id="hubspotActionContainer" class="hidden"></div>'`), 'the slot lives inside the panel');
  assert.equal((app.match(/id="hubspotActionContainer"/g) || []).length, 1, 'and only there');
});

test('a bulk run renders the panel only when credits did not run out', () => {
  const tail = app.slice(app.indexOf('isBulkProcessing = false;'), app.indexOf('function renderGatedResults'));
  assert.ok(tail.includes("renderNextStepPanel('bulk'"));
  assert.ok(/if \(!creditsExhausted\) \{[\s\S]*renderNextStepPanel\('bulk'/.test(tail), 'must not compete with the gated table');
});

test('the panel offers all four routes in single mode', () => {
  const fn = app.slice(app.indexOf('function renderNextStepPanel('), app.indexOf('function nextStepClicked('));
  for (const route of ["nextStepClicked('csv','single')", "nextStepClicked('sheets','single')", "nextStepClicked('api','single')", 'hubspotActionContainer']) {
    assert.ok(fn.includes(route.replace(/'/g, "\\'")) || fn.includes(route), 'missing ' + route);
  }
  assert.ok(fn.includes("nextStepClicked('download_row','single')".replace(/'/g, "\\'")), 'CSV export of the single row');
  assert.ok(fn.includes('BULK_WALKTHROUGH_URL'), 'the retired popup video survives as a link');
});

test('the bulk panel offers the three ways to never upload again', () => {
  const fn = app.slice(app.indexOf('function renderNextStepPanel('), app.indexOf('function nextStepClicked('));
  for (const route of ['sheets', 'api', 'crm']) {
    assert.ok(fn.includes(`nextStepClicked(\\'${route}\\',\\'bulk\\')`), 'missing bulk route ' + route);
  }
});

test('the Sheets route always points at the published Marketplace add-on', () => {
  const url = 'https://workspace.google.com/marketplace/app/linkfinder_ai/1096371450007';
  assert.ok(app.includes(`const SHEETS_ADDON_URL = '${url}'`));
  // the bulk-upload card already used this exact listing; nothing may drift to the unpublished copy
  assert.ok(!app.includes('integrations/google-sheets/'));
});

// ---------------------------------------------------------------- the API snippet
function appFn(name) {
  const start = app.indexOf('function ' + name + '(');
  assert.ok(start > 0, name + ' exists');
  const body = app.slice(start);
  const end = body.indexOf('\n}\n') + 3;
  return body.slice(0, end);
}

test('the API key derivation matches api-access.html byte for byte', () => {
  const ctx = { userToken: 'abc123', out: null };
  vm.createContext(ctx);
  vm.runInContext(appFn('lfApiKey') + '; out = lfApiKey();', ctx);
  // api-access.html: transformerToken — chars + 7, hex, joined by Z
  const expected = [...'abc123'].map((c) => (c.charCodeAt(0) + 7).toString(16).padStart(2, '0')).join('Z');
  assert.equal(ctx.out, expected);
});

test('the snippet is a runnable request against the public API for this exact lookup', () => {
  const ctx = {
    userToken: 'tok', currentInputType: 'lead_full_name', currentOutputType: 'email', out: null,
    generateCombinationType: (i, o) => `${i}_to_${o}`,
  };
  vm.createContext(ctx);
  vm.runInContext(
    "const PUBLIC_API_URL = 'https://api.linkfinderai.com/';\n" + appFn('lfApiKey') + appFn('nextStepApiSnippet') + "; out = nextStepApiSnippet(\"Bill O'Brien Microsoft\");",
    ctx
  );
  assert.ok(ctx.out.startsWith('curl -X POST https://api.linkfinderai.com/'));
  assert.ok(ctx.out.includes('"Authorization: Bearer ' + [...'tok'].map((c) => (c.charCodeAt(0) + 7).toString(16)).join('Z')));
  assert.ok(ctx.out.includes('"type":"lead_full_name_to_email"'));
  assert.ok(ctx.out.includes(`Bill O'\\''Brien Microsoft`), 'single quotes survive the shell');
});

test('copying the snippet counts as copying the key, with its own source', () => {
  const fn = appFn('copyNextStepSnippet');
  assert.ok(fn.includes("posthog.capture('api_key_copied', { source: 'next_step_' + context })"));
  assert.ok(fn.includes("posthog.capture('api_snippet_copied'"));
});

// ---------------------------------------------------------------- route chooser + intent
test('the first-visit route chooser is inline, once, and never after use', () => {
  assert.ok(app.includes('id="routeChooser" class="route-chooser hidden"'), 'starts hidden; JS decides');
  const fn = appFn('maybeShowRouteChooser');
  assert.ok(fn.includes("localStorage.getItem(ROUTE_PICKED_KEY)"));
  assert.ok(fn.includes("localStorage.getItem('lf_csv_uploaded_ever')"));
  assert.ok(fn.includes("localStorage.getItem('lf_enrich_count')"));
  assert.ok(app.includes('hideRouteChooser(); // they have found their own way in'));
});

test('?intent= and lf_intent skip the question and land on the route', () => {
  const fn = appFn('maybeShowRouteChooser');
  assert.ok(fn.includes("get('intent')"));
  assert.ok(fn.includes("localStorage.getItem('lf_intent')"));
  assert.ok(fn.includes("localStorage.removeItem('lf_intent')"), 'one-shot');
  assert.ok(fn.includes("pickRoute(intent, 'intent')"));
  const pick = appFn('pickRoute');
  assert.ok(pick.includes("case 'csv'") && pick.includes("switchMode('bulk')"), 'csv sets bulk mode before the types are picked');
  assert.ok(pick.includes("case 'api'") && pick.includes("navigateToPage('api')"));
  assert.ok(pick.includes("case 'crm'") && pick.includes("navigateToPage('crmSync')"));
  assert.ok(pick.includes("case 'sheets'") && pick.includes('SHEETS_ADDON_URL'));
});

test('sign-up and log-in store the intent so it survives OAuth and email confirmation', () => {
  for (const [name, src] of [['sign-up', signUp], ['log-in', logIn]]) {
    assert.ok(src.includes("urlParams.get('intent')"), name + ' reads ?intent');
    assert.ok(src.includes("localStorage.setItem('lf_intent', intent)"), name + ' stores it');
    assert.ok(src.includes('/^[a-z_]{1,20}$/.test(intent)'), name + ' validates it');
  }
});

// ---------------------------------------------------------------- tool-page offer
test('the first-result offer is spreadsheet-shaped and routes by intent', () => {
  assert.ok(!gate.includes('Want 50 more lookups?'), 'the feature pitch is gone');
  assert.ok(gate.includes('lfo-filled') && gate.includes('lfo-ghost'), 'one filled row, empty rows under it');
  assert.ok(gate.includes('?intent=csv'), 'the primary CTA is the CSV route');
  for (const intent of ['sheets', 'api', 'crm']) {
    assert.ok(gate.includes(`route('${intent}'`), 'route ' + intent);
  }
  assert.ok(gate.includes(`'?intent=' + intent`));
  assert.ok(gate.includes(`capture('first_result_offer_shown', { variant: 'spreadsheet' })`));
  assert.ok(gate.includes("props.route = el.getAttribute('data-lf-route')"));
  assert.ok(gate.includes('function hideOwnResultCta'), 'no two asks under one answer');
});

test('the offer still renders in the tool-page DOM the gate tests use', () => {
  // Same minimal DOM shape as free-tool-gate.test.mjs: no querySelector,
  // no innerText. The offer must degrade, not throw.
  const captured = [];
  const results = { id: 'resultsSection', style: {}, _c: new Set(), classList: { contains: (c) => false, add() {}, remove() {}, toggle() {} }, observers: [], parentNode: { insertBefore(node) { captured.push(node); } }, nextSibling: null };
  const nodes = { resultsSection: results };
  const doc = {
    readyState: 'complete', head: { appendChild() {} }, body: { appendChild() {} },
    getElementById: (id) => nodes[id] || null,
    createElement: (t) => ({ tagName: t.toUpperCase(), style: {}, setAttribute() {}, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } }),
    addEventListener() {},
  };
  const sandbox = { document: doc, window: { location: { pathname: '/x', href: 'https://linkfinderai.com/x' }, addEventListener() {}, posthog: { capture() {} } }, localStorage: { length: 0, getItem: () => null, key: () => null, setItem() {} }, MutationObserver: class { observe() {} } };
  sandbox.window.document = doc;
  vm.createContext(sandbox);
  vm.runInContext(gate, sandbox);
  assert.equal(captured.length, 1, 'offer inserted');
  assert.ok(captured[0]._html.includes('your lookup'), 'falls back when it cannot read the input');
  assert.ok(captured[0]._html.includes('Enrich my list free'));
});

console.log(`\n${passed} passed`);
