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
    assert.equal(k.output, output, v);
  }
  assert.equal(classify('   '), null);
});

test('it hands over to the existing lookup, not a copy of it', () => {
  assert.ok(appFn('smartStartRun').includes('quickStart('));
  assert.ok(appFn('smartStartRoute').includes("pickRoute(route, 'smart_start')"));
});

test('the big route chooser does not stack under it', () => {
  assert.ok(appFn('maybeShowRouteChooser').includes("document.getElementById('smartStart')"));
});
