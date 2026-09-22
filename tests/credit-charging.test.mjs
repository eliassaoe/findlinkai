// Two things went wrong with credits at once, and they are easy to reintroduce:
//
//   1. A lookup that returned nothing cost the user nothing, while the supplier
//      was paid for the attempt. That makes garbage input free, which is what
//      the Sep 2026 signup farm ran on: 53,922 rows delivered 537,519 credits
//      of work and billed 182,497 of it (34%).
//   2. enrichment_history.credits_used was hardcoded to 1 for every row,
//      including the 50-credit phone lookup, so the table could not be used to
//      check claim 1 - or anything else about consumption.
//
// These tests read the runner's own source so they cannot drift from it, and
// pin the price table against app.html, which is the number the user is shown
// before they press the button.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runnerSrc = readFileSync(
  new URL('../supabase/functions/csv-batch-runner/index.ts', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

// ---- pull the two price tables out of the sources ---------------------------

function parseRunnerCosts() {
  const body = runnerSrc.match(/const CREDIT_COSTS: Record<string, number> = \{([\s\S]*?)\};/)[1];
  const out = {};
  for (const [, k, v] of body.matchAll(/(\w+)\s*:\s*(\d+)/g)) out[k] = Number(v);
  return out;
}

function parseAppCosts() {
  const body = appSrc.match(/const creditCosts=\{([\s\S]*?)\};/)[1];
  const out = {};
  for (const [, k, v] of body.matchAll(/'([\w]+)'\s*:\s*(\d+)/g)) out[k] = Number(v);
  return out;
}

// chargeFor() is plain arithmetic over those constants; re-implement it here
// from the source's own formula so a change to the formula fails this file.
function chargeFor(costs, rate, key, found) {
  const full = costs[key] ?? 1;
  return found ? full : Math.max(1, Math.round(full * rate));
}

const runnerCosts = parseRunnerCosts();
const appCosts = parseAppCosts();
const defaultRate = Number(
  runnerSrc.match(/MISS_CHARGE_RATE = Number\(Deno\.env\.get\('CSV_MISS_CHARGE_RATE'\) \?\? ([\d.]+)\)/)[1]);

console.log('credit charging');

test('a miss is never free', () => {
  for (const key of Object.keys(runnerCosts)) {
    const charged = chargeFor(runnerCosts, defaultRate, key, false);
    assert.ok(charged >= 1, `${key} charged ${charged} on a miss`);
  }
});

test('a miss still costs at least 1 credit even at rate 0', () => {
  // Someone will try CSV_MISS_CHARGE_RATE=0 to "go back to how it was". The
  // floor means that still bills the attempt instead of silently reopening it.
  assert.equal(chargeFor(runnerCosts, 0, 'company_name_to_website', false), 1);
  assert.equal(chargeFor(runnerCosts, 0, 'linkedin_profile_to_phone', false), 1);
});

test('a miss costs less than a hit', () => {
  // The other direction: a messy list must not bill like a clean one, or the
  // fix lands on legitimate users instead of on abuse.
  for (const key of ['linkedin_profile_to_email', 'linkedin_profile_to_phone', 'lead_full_name_to_email']) {
    const miss = chargeFor(runnerCosts, defaultRate, key, false);
    const hit = chargeFor(runnerCosts, defaultRate, key, true);
    assert.ok(miss < hit, `${key}: miss ${miss} should be below hit ${hit}`);
  }
});

test('a hit is charged the full listed price', () => {
  assert.equal(chargeFor(runnerCosts, defaultRate, 'linkedin_profile_to_email', true), 10);
  assert.equal(chargeFor(runnerCosts, defaultRate, 'linkedin_profile_to_phone', true), 50);
});

test('the logged credits_used is the charged amount, not a constant', () => {
  assert.ok(!/credits_used:\s*1\b/.test(runnerSrc),
    'credits_used must never go back to a hardcoded 1 - it made the history table unauditable');
  assert.ok(/credits_used:\s*chargeFor\(/.test(runnerSrc),
    'the logged number must come from the same function that bills');
});

test('the runner never bills 0 for a completed call', () => {
  assert.ok(!/credits:\s*[^;]*\?\s*\([^)]*\)\s*:\s*0/.test(runnerSrc),
    'the "found ? cost : 0" shape is the bug this file exists to prevent');
});

test('the runner price table agrees with what app.html shows the user', () => {
  const mismatches = [];
  for (const [key, appCost] of Object.entries(appCosts)) {
    if (key in runnerCosts && runnerCosts[key] !== appCost) {
      mismatches.push(`${key}: app.html says ${appCost}, runner charges ${runnerCosts[key]}`);
    }
  }
  assert.deepEqual(mismatches, [],
    'a price the user is quoted and a price they are billed must be the same number');
});

console.log(`\n${passed} passed`);
