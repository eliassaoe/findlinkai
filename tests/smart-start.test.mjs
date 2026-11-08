// The enrichment page opens on the search cards ("What do you want to find?"),
// LinkedIn profile first. The "Paste what you have" box was removed on 7 Nov 2026
// (owner's call); its classifier is kept and still tested. docs/smart-start.md.

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

test('no paste box: the cards are the start, LinkedIn profile first, lists one line under them', () => {
  assert.ok(!app.includes('id="smartStart"'), 'the paste box is gone');
  assert.ok(app.includes('<div class="search-picker-label">What do you want to find?</div>'));
  const groups = app.slice(app.indexOf('const SEARCH_PICKER_GROUPS'));
  assert.ok(groups.indexOf("'Find a LinkedIn profile'") < groups.indexOf("'Find an email'"));
  const form = app.slice(app.indexOf('<div class="config-form">'));
  assert.ok(form.indexOf('id="searchPicker"') < form.indexOf('class="qs-list-line"'));
  assert.ok(form.slice(form.indexOf('class="qs-list-line"'), form.indexOf('class="qs-list-line"') + 1200).includes("pickRoute('sheets'"), 'Google Sheets is offered with the lists');
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

test('a name gets its company, then runs', () => {
  assert.equal(classify('Satya Nadella').needsCompany, true);
  const run = appFn('smartStartRun');
  assert.ok(run.includes("getElementById('leadDomain')") && run.includes("getElementById('leadCompany')"));
  assert.ok(run.includes('eb.click()'));
});

test('it hands over to the existing lookup, not a copy of it', () => {
  assert.ok(appFn('smartStartRun').includes('quickStart('));
  assert.ok(appFn('smartStartRoute').includes("pickRoute(route, 'smart_start')"));
});

// Owner, 7 Nov 2026 22:18: the "Where is your data?" question is back on first
// visit, to push people towards bulk / Sheets / API. The cards wait under it.
test('first visit asks where the data is, and the cards wait until a route is picked', () => {
  const fn = appFn('maybeShowRouteChooser');
  assert.ok(!fn.includes("document.getElementById('searchPicker')"));
  assert.ok(fn.includes("classList.add('rc-open')"));
  assert.ok(appFn('hideRouteChooser').includes("classList.remove('rc-open')"));
  assert.match(app, /body\.rc-open \.config-form/);
  for (const r of ['csv', 'sheets', 'api', 'single']) assert.ok(app.includes(`pickRoute('${r}')`));
});

test('the dropdowns are replaced by a card per search, which drives the same selects', () => {
  assert.ok(app.includes('id="searchPicker"'));
  assert.ok(app.includes('<div class="form-grid" style="display:none;">'), 'selects stay in the DOM, hidden');
  const pick = appFn('pickSearch');
  assert.ok(pick.includes("inputSel.dispatchEvent(new Event('change'))"));
  assert.ok(pick.includes("outputSel.dispatchEvent(new Event('change'))"));
  assert.ok(appFn('setupDropdowns').includes('renderSearchPicker()'));
});

// 8 Nov 2026: one card per thing to find; what you have is picked in the form.
test('start screen: one card per goal, LinkedIn profile first, "I have" choice inside the form', () => {
  const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  const goals = html.slice(html.indexOf('const SEARCH_GOALS'), html.indexOf('function searchGoalFor'));
  const ids = [...goals.matchAll(/\{ id: '(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(ids, ['linkedin', 'email', 'phone', 'website', 'scrape', 'employees']);
  // LinkedIn profile from a name + company or from an email; email from LinkedIn or name + domain
  assert.match(goals, /id: 'linkedin'[\s\S]*?\['lead_full_name', 'linkedin_url'\][\s\S]*?\['email', 'linkedin_url'\]/);
  assert.match(goals, /id: 'email'[\s\S]*?\['linkedin_profile', 'email'\][\s\S]*?\['lead_full_name', 'email'\]/);
  assert.match(goals, /id: 'scrape'[\s\S]*?\['linkedin_profile', 'linkedin_info'\][\s\S]*?\['linkedin_company', 'linkedin_info'\]/);
  assert.match(html, /class="sp-have-label">I have:/);
  assert.match(html, /id="spMore" class="sp-more hidden"/);
  assert.match(html, /function trySearchExample\(\)/);
  // the example only fills the form: autoRun must stay false so no credits move by surprise
  assert.match(html, /quickStart\(currentInputType, currentOutputType, l\.example\[0\], null, false, l\.example\[1\]\)/);
  assert.doesNotMatch(html, /one contact or company<\/div>/);
});

// 8 Nov 2026: every miss of company data in Oct was a person's /in/ URL.
test('a person URL in company data (or the reverse) switches the search', () => {
  const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.match(html, /function lfLinkedInUrlKind\(v\)/);
  assert.match(html, /kind === 'person' && currentInputType === 'linkedin_company'\) to = 'linkedin_profile'/);
  assert.match(html, /kind === 'company' && currentInputType === 'linkedin_profile'\) to = 'linkedin_company'/);
  assert.match(html, /if \(lfAutoSwitchLinkedInKind\(true\)\) \{ restoreBtn\(\); return; \}/);
});
