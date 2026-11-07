// The enrichment page opens on one box: paste anything, the input/output pair is
// picked for you, and a LinkedIn profile URL goes to the work email (the result
// people pay for). Background: docs/smart-start.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

function appFn(name) {
  const start = app.indexOf('function ' + name + '(');
  assert.ok(start > 0, name + ' exists');
  const body = app.slice(start);
  return body.slice(0, body.indexOf('\n}\n') + 3);
}

const classify = new Function(appFn('smartStartClassify') + '\nreturn smartStartClassify;')();

test('the box is the first thing in the quick-start section', () => {
  const qs = app.slice(app.indexOf('id="quickstartSection"'));
  assert.ok(qs.indexOf('id="smartStart"') < qs.indexOf('id="routeChooser"'));
});

test('what was pasted decides the pair', () => {
  const cases = [
    ['https://www.linkedin.com/in/satyanadella/', 'linkedin_profile', 'email'],
    ['linkedin.com/company/tesla-motors', 'linkedin_company', 'linkedin_info'],
    ['https://www.linkedin.com/posts/abc-123', 'linkedin_post', 'reactions'],
    ['john@stripe.com', 'email', 'linkedin_url'],
    ['stripe.com', 'company_domain', 'employees'],
    ['Satya Nadella', 'lead_full_name', 'email'],
    ['Tesla', 'company_name', 'website'],
  ];
  for (const [v, input, output] of cases) {
    const k = classify(v);
    assert.equal(k.input, input, v);
    assert.equal(k.options[0][0], output, v + ' (first choice)');
  }
  assert.equal(classify('   '), null);
});

test('every choice offered is a real search with a real credit cost', () => {
  const costs = app.slice(app.indexOf('const creditCosts='), app.indexOf('};', app.indexOf('const creditCosts=')));
  for (const v of ['linkedin.com/in/x', 'linkedin.com/company/x', 'linkedin.com/posts/x', 'a@b.co', 'stripe.com', 'Satya Nadella', 'Tesla']) {
    for (const [out] of classify(v).options) {
      assert.ok(costs.includes("'" + classify(v).input + '_to_' + out + "'"), v + ' -> ' + out);
    }
  }
});

test('a name gets its company inside the box, then runs', () => {
  assert.ok(app.includes('id="smartStartCompany"'));
  assert.equal(classify('Satya Nadella').needsCompany, true);
  const run = appFn('smartStartRun');
  assert.ok(run.includes("getElementById('leadDomain')") && run.includes("getElementById('leadCompany')"));
  assert.ok(run.includes('eb.click()'));
});

test('it hands over to the existing lookup, not a copy of it', () => {
  assert.ok(appFn('smartStartRun').includes('quickStart('));
  assert.ok(appFn('smartStartRoute').includes("pickRoute(route, 'smart_start')"));
});

test('the big route chooser does not stack under it', () => {
  assert.ok(appFn('maybeShowRouteChooser').includes("document.getElementById('smartStart')"));
});

test('the dropdowns are replaced by a card per search, which drives the same selects', () => {
  assert.ok(app.includes('id="searchPicker"'));
  assert.ok(app.includes('<div class="form-grid" style="display:none;">'), 'selects stay in the DOM, hidden');
  const pick = appFn('pickSearch');
  assert.ok(pick.includes("inputSel.dispatchEvent(new Event('change'))"));
  assert.ok(pick.includes("outputSel.dispatchEvent(new Event('change'))"));
  assert.ok(appFn('setupDropdowns').includes('renderSearchPicker()'));
});
