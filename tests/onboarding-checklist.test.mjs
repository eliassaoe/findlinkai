// "Get started" checklist + first-result tour, 18 Nov 2026 (docs/onboarding-checklist.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20261118090000_starter_checklist_rewards.sql', import.meta.url), 'utf8');
function appFn(name) {
  const start = app.indexOf('function ' + name + '(');
  assert.ok(start > 0, name + ' exists');
  const body = app.slice(start);
  return body.slice(0, body.indexOf('\n}\n') + 3);
}

test('the checklist sits outside the quick-start block, so a first run does not hide it', () => {
  assert.ok(app.indexOf('id="starterList"') < app.indexOf('id="quickstartSection"'));
  assert.ok(app.includes('try { starterInit(); } catch (e) {}'));
  assert.ok(appFn('starterInit').includes('lfHasUsedProduct()'), 'new accounts only');
});

test('every success advances it, and steps 2 and 3 are paid by the server, not the browser', () => {
  assert.ok(appFn('checkEnrichmentMilestone').includes('starterOnSuccess()'));
  const on = appFn('starterOnSuccess');
  assert.ok(on.includes("starterClaim('own_search')") && on.includes("starterClaim('first_list')"));
  assert.ok(!appFn('starterClaim').includes('increment_user_credits'));
  assert.ok(appFn('starterClaim').includes('/rest/v1/rpc/lf_starter_reward'));
});

test('the reward function re-checks the work, new accounts only, once per step', () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /created_at >= timestamptz '2026-11-18/);
  assert.match(sql, /from enrichment_history/);
  assert.match(sql, /from csv_enrichment_batches/);
  assert.match(sql, /unique_violation/);
  assert.match(sql, /v_credits := 25/);
  assert.match(sql, /v_credits := 50/);
});

test('the tour is three steps and ends on the sample list', () => {
  const t = appFn('starterTour');
  assert.ok(t.includes('Step ') && t.includes('of 3'));
  assert.ok(t.includes('Try a sample list'));
  assert.ok(appFn('starterTourEnd').includes('starterRunSample()'));
});
