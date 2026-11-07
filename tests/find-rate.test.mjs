// A miss should lead to the search most likely to find something, and a name
// should reach an email through LinkedIn, not name + domain (1-15% found).
// Numbers and reasoning: docs/find-rate.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const fn = (name) => { const i = app.indexOf('function ' + name + '('); assert.ok(i > 0, name); const b = app.slice(i); return b.slice(0, b.indexOf('\n}\n') + 3); };

test('the not-found card carries a rescue', () => {
  assert.ok(app.includes('${missRescueHTML(inputData)}'));
  const h = fn('missRescueHTML');
  for (const p of ['lead_full_name__email', 'linkedin_profile__phone', 'linkedin_profile__email']) assert.ok(h.includes(p), p);
  assert.ok(h.includes('getCreditCost('), 'costs come from creditCosts');
});

test('name -> email goes through LinkedIn, then chains to the email', () => {
  assert.ok(fn('missRescue').includes("lfChain = { after: 'lead_full_name__linkedin_url', then: 'email' }"));
  assert.ok(fn('smartStartRun').includes("lfChain = { after: 'lead_full_name__linkedin_url', then: 'email' }"));
  assert.ok(fn('lfContinueChain').includes("quickStart('linkedin_profile', chain.then, url"));
  assert.ok(app.includes('lfContinueChain(data);'));
});

test('blank employee rows are a miss, not a result', () => {
  const keep = new Function(fn('lfRealEmployees') + '\nreturn lfRealEmployees;')();
  assert.equal(keep([{ name: null, email: null, firstName: 'We improve the Actor everyday' }]).length, 0);
  assert.equal(keep([{ name: 'Jane Doe' }]).length, 1);
  assert.ok(app.includes("data = lfRealEmployees(data);"));
});
