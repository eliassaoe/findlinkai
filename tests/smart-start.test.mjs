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

test('the big route chooser does not come back while the cards are the start', () => {
  assert.ok(appFn('maybeShowRouteChooser').includes("document.getElementById('searchPicker')"));
});

test('the dropdowns are replaced by a card per search, which drives the same selects', () => {
  assert.ok(app.includes('id="searchPicker"'));
  assert.ok(app.includes('<div class="form-grid" style="display:none;">'), 'selects stay in the DOM, hidden');
  const pick = appFn('pickSearch');
  assert.ok(pick.includes("inputSel.dispatchEvent(new Event('change'))"));
  assert.ok(pick.includes("outputSel.dispatchEvent(new Event('change'))"));
  assert.ok(appFn('setupDropdowns').includes('renderSearchPicker()'));
});

// 7 Nov 2026, later: four big cards first, the rest behind "More searches".
test('start screen shows four cards, LinkedIn profile first, the rest behind More searches', () => {
  const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  const top = html.slice(html.indexOf('const SEARCH_PICKER_TOP'), html.indexOf('function searchPickerLabel'));
  const pairs = [...top.matchAll(/pair: \['(\w+)', '(\w+)'\]/g)].map(m => m[1] + '__' + m[2]);
  assert.deepEqual(pairs, ['lead_full_name__linkedin_url', 'linkedin_profile__email', 'company_name__website', 'linkedin_profile__phone']);
  assert.match(html, /id="spMore" class="sp-more hidden"/);
  assert.match(html, /More searches/);
  assert.match(html, /function trySearchExample\(\)/);
  // the example only fills the form: autoRun must stay false so no credits move by surprise
  assert.match(html, /quickStart\(currentInputType, currentOutputType, l\.example\[0\], null, false, l\.example\[1\]\)/);
  assert.doesNotMatch(html, /one contact or company<\/div>/);
});
