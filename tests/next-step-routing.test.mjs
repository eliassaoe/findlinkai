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
  assert.ok(fn.includes('lfHasUsedProduct()'));
  const used = appFn('lfHasUsedProduct');
  assert.ok(used.includes("localStorage.getItem('lf_csv_uploaded_ever')"));
  assert.ok(used.includes("localStorage.getItem('lf_enrich_count')"));
  assert.ok(app.includes('hideRouteChooser(); // they have found their own way in'));
  // a pick collapses it to the strip rather than removing every route
  assert.ok(app.includes('id="routeStrip" class="route-strip hidden"'));
  assert.ok(fn.includes("params.get('route_test') === '1'"), 'a way to see it again on a used account');
});

test('?intent= and lf_intent skip the question and land on the route', () => {
  const fn = appFn('maybeShowRouteChooser');
  assert.ok(fn.includes("get('intent')"));
  assert.ok(fn.includes("localStorage.getItem('lf_intent')"));
  assert.ok(fn.includes("localStorage.removeItem('lf_intent')"), 'one-shot');
  assert.ok(fn.includes("pickRoute(intent, 'intent')"));
  const pick = appFn('pickRoute');
  assert.ok(pick.includes("case 'csv'") && pick.includes("switchMode('bulk')"), 'csv opens bulk mode whether or not the types are picked');
  assert.ok(pick.includes('lfAskForPair('), 'and points at the dropdowns when they are empty');
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

// ---------------------------------------------------------------- bulk before a pair is picked
test('bulk mode exists before any dropdown is set, with the drop zone locked', () => {
  assert.ok(app.includes('<div id="modeToggle" class="mode-toggle">'), 'the toggle is visible from load');
  assert.ok(!app.includes("document.getElementById('modeToggle').classList.add('hidden')"), 'and nothing hides it again');
  const sw = appFn('switchMode');
  assert.ok(!sw.includes('if (currentInputType && currentOutputType)'), 'switchMode no longer needs a pair');
  const show = appFn('showInputSections');
  assert.ok(show.includes('setBulkLocked(!configured)'));
  assert.ok(appFn('handleFile').includes('if(!lfConfigured()){ lfAskForPair(); return; }'), 'no file is parsed without a pair');
  assert.ok(appFn('openCsvPicker').includes('if (!lfConfigured()) { lfAskForPair(); return; }'), 'the picker does not open without a pair');
  assert.ok(app.includes("ua.addEventListener('drop',(e)=>{if(!lfConfigured()){lfAskForPair();return;}"), 'nor does a drop');
  assert.ok(app.includes('id="bulkLockNotice"'), 'the locked state says what to do');
});

// ---------------------------------------------------------------- round two
const apiAccess = read('api-access.html');
const apiDocs = read('api-documentation.html');
const pricing = read('pricing.html');

test('Run it now exists under results and in the docs and fires the first-call event once', () => {
  assert.ok(appFn('runNextStepApiTest').includes("posthog.capture('api_first_call_succeeded', { source: 'in_app_test'"));
  assert.ok(appFn('runNextStepApiTest').includes("localStorage.getItem(API_FIRST_CALL_KEY)"), 'once per browser');
  assert.ok(apiDocs.includes("cap('api_first_call_succeeded', { source: 'api_docs_test'"));
  assert.ok(!apiAccess.includes('apiTestBox'), 'the API key page shows the key only; the runnable call lives under results and in the docs');
  for (const src of [app, apiDocs]) assert.ok(src.includes('could not reach the API directly'), 'a CORS/network failure degrades to the terminal, never to silence');
});

test('the bulk credit gate is sized to the list and opens the modal on that plan', () => {
  const fn = appFn('sizePlanForRows');
  assert.ok(fn.includes('Math.round(p.credits / 12) >= needed'), 'monthly credits are annual / 12, per CLAUDE.md');
  assert.ok(app.includes('still to enrich &middot; ${sized.needed.toLocaleString()} credit'));
  assert.ok(app.includes("showPricingModal('bulk_credits_gated', gate)"));
  assert.ok(app.includes("trigger === 'bulk_credits_gated' && extra"));
  assert.ok(app.includes('recommendedIndex = window.__lfSizedPlanIndex'));
  const branch = app.slice(app.indexOf("trigger === 'bulk_credits_gated' && extra"), app.indexOf("trigger === 'export_gated'"));
  assert.ok(!/payg|pay as you go|pack/i.test(branch), 'the sized gate never mentions PAYG or packs');
});

test('integration-intent pages carry ?intent= on their sign-up links', () => {
  const expect = { 'linkedIn-enrichment-google-sheets.html': 'sheets', 'hubspot-crm-enrichment.html': 'crm', 'n8n-linkedin-automation.html': 'api', 'bulk-linkedin-enrichment.html': 'csv', 'crm-audit.html': 'crm' };
  for (const [file, intent] of Object.entries(expect)) {
    const src = read(file);
    assert.ok(src.includes('intent=' + intent), file + ' → ' + intent);
    assert.ok(!/linkfinderai\.com\/sign-up["'#\s>]/.test(src), file + ' has no bare sign-up link left');
  }
  assert.ok(!read('linkedin-email-finder.html').includes('?intent='), 'tool pages keep their own offer');
});

test('the docs open with a runnable first call and three one-click routes', () => {
  assert.ok(apiDocs.includes('id="docsFirstCall"'));
  assert.ok(apiDocs.includes('sign-up?intent=api'));
  for (const s of ['n8n-nodes-linkfinderai', 'zapier.com/developer/public-invite', 'app-integrations']) assert.ok(apiDocs.includes(s), s);
  assert.ok(apiDocs.includes("localStorage.getItem('LinkFinderToken') || localStorage.getItem('linkFinderToken')"), 'either token spelling signs the reader in');
});

test('pricing leads with the routes and lists them first on every plan', () => {
  assert.ok(pricing.includes('class="pricing-routes"'));
  for (const i of ['csv', 'sheets', 'api', 'crm']) assert.ok(pricing.includes('sign-up?intent=' + i), i);
  assert.equal((pricing.match(/Google Sheets add-on<\/li>/g) || []).length, 3);
});

test('the route and idle-credit campaigns are in the variants library with their workflow ids', () => {
  const lib = JSON.parse(read('workers/lifecycle-email/variants.json'));
  for (const k of ['route_csv_1', 'route_csv_2', 'route_sheets_1', 'route_sheets_2', 'route_api_1', 'route_api_2', 'route_crm_1', 'route_crm_2', 'idle_credits']) {
    const step = lib.steps[k];
    assert.ok(step, k);
    assert.ok(/^01a0/.test(step.workflow_id), k + ' has a workflow id');
    const champions = step.variants.filter((v) => v.status === 'champion');
    assert.equal(champions.length, 1, k + ' has exactly one champion');
    for (const v of step.variants) {
      assert.ok(!/&[a-z]+;/.test(v.subject), k + ' subject is plain text');
      assert.ok(!/PAYG|pay as you go/i.test(JSON.stringify(v)) || k !== 'route_crm_1' && k !== 'route_crm_2', 'CRM mail never mentions PAYG');
    }
  }
});

// ---------------------------------------------------------------- round three
const tasksWorker = read('workers/onboarding-tasks/worker.js');
const receiptWorker = read('workers/monthly-receipt/worker.js');
const account = read('account.html');

test('credits for integrating: the three tasks exist in the app and the worker, and two pay on their own', () => {
  for (const t of ['first_api_call', 'sheets_addon', 'hubspot_connected']) {
    assert.ok(app.includes("name: '" + t + "'"), 'app row ' + t);
    assert.ok(new RegExp('^\\s*' + t + ':\\s*\\{', 'm').test(tasksWorker), 'worker config ' + t);
  }
  assert.ok(tasksWorker.includes("hubspot_connected: { credits: 300,  kind: 'verified_crm' }"), 'HubSpot is verified, not honour');
  assert.ok(tasksWorker.includes("if (config.kind === 'verified_crm')") && tasksWorker.includes('await crmConnected(env, user_token)'), 'the worker asks the CRM worker before paying');
  const runTest = app.slice(app.indexOf('async function runNextStepApiTest('), app.indexOf('function nextStepClicked('));
  assert.ok(runTest.includes("otpAutoCompleteTask('first_api_call', 'run_it_now')"), 'a working call credits itself');
  const hs = app.slice(app.indexOf('async function checkHubspotConnection('), app.indexOf('function extractContactFromResult('));
  assert.ok(hs.includes("if (hubspotConnected) otpAutoCompleteTask('hubspot_connected'"), 'a live HubSpot connection credits itself');
  const auto = app.slice(app.indexOf('async function otpAutoCompleteTask('), app.indexOf('function otpCreditToast('));
  assert.ok(auto.includes('if (res.status === 409) { remember(); return; }') && auto.includes('if (!res.ok) return;'), 'auto-completion is silent on every failure');
  assert.ok(!auto.includes('otpShowFieldError'), 'it never shows an error for something the person did not ask for');
});

test('auto top-up is offered where an integration just worked, and only there', () => {
  const runTest = app.slice(app.indexOf('async function runNextStepApiTest('), app.indexOf('function nextStepClicked('));
  assert.ok(runTest.includes('ns-atu-offer') && runTest.includes("autoTopupOfferClicked(\\'api_test_'"), 'under a successful Run it now');
  const bulkPanel = app.slice(app.indexOf('function renderNextStepPanel('), app.indexOf('async function runNextStepApiTest('));
  assert.ok(bulkPanel.includes("autoTopupOfferClicked(\\'bulk_api_note\\')"), 'in the bulk API note');
  assert.ok(app.includes("return addGclid('https://linkfinderai.com/account?token=' + userToken) + '#auto-topup';"), 'lands on the open panel');
  assert.equal((app.match(/autoTopupOfferClicked\(/g) || []).length, 3, 'the definition and two call sites - no new interrupt');
  const lib = JSON.parse(read('workers/lifecycle-email/variants.json'));
  const apiMail = lib.steps.route_api_1.variants.find((v) => v.status === 'champion');
  assert.ok(apiMail.after.some((l) => /auto top-up/.test(l)), 'the API route email says it too');
});

test('the monthly value receipt: worker, event, email and landing', () => {
  assert.ok(read('workers/monthly-receipt/wrangler.toml').includes('crons = ["0 8 1 * *"]'), 'first of the month');
  assert.ok(receiptWorker.includes("const EVENT = 'monthly_value_receipt'"));
  assert.ok(receiptWorker.includes('if (r.found_total < minFound) { skipped += 1; continue; }'), 'nobody gets a receipt for zero');
  assert.ok(receiptWorker.includes("'monthly_value_receipts'") && read('workers/monthly-receipt/README.md').includes('public.user_value_summary(u.token)'), 'same counting as the account page');
  assert.ok(receiptWorker.includes('#what-you-found') && account.includes("window.location.hash === '#what-you-found'"), 'the button lands on the section');
  const lib = JSON.parse(read('workers/lifecycle-email/variants.json'));
  const step = lib.steps.monthly_receipt;
  const v = step.variants.find((x) => x.status === 'champion');
  assert.ok(/^01a0/.test(step.workflow_id), 'workflow id recorded');
  for (const prop of ['found_total', 'month_label', 'lookups', 'hours_saved', 'account_url', 'history_url']) {
    assert.ok(JSON.stringify(v).includes('event.properties.' + prop), 'email uses ' + prop);
  }
  for (const cat of ['emails', 'phones', 'profiles', 'profiles_full', 'websites', 'companies', 'people']) {
    assert.ok(v.body[1].includes('{% if event.properties.' + cat + ' > 0 %}'), cat + ' line is conditional');
    assert.ok(receiptWorker.includes("'" + cat + "'"), 'worker counts ' + cat);
  }
  assert.ok(!JSON.stringify(v).includes("'other'") && !receiptWorker.includes("'other'"), 'other is never shown, as on the page');
  assert.ok(read('workers/lifecycle-email/route_workflows.py').includes('def receipt_workflow('));
});

console.log(`\n${passed} passed`);
