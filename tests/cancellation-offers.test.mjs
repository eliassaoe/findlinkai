import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * The cancellation flow on account.html leads with two offers: pause the
 * billing, and — for everyone except CRM customers — credit packs that outlive
 * the subscription. Both are easy to lose in a copy edit, and one of them
 * (packs to a CRM user) is a thing CLAUDE.md says never to ship, so the rules
 * are pinned here rather than left to memory.
 */

const src = readFileSync(new URL('../account.html', import.meta.url), 'utf8');

const REASONS = ['notUsing', 'tooExpensive', 'competitor', 'missingFeature', 'technical', 'other'];

// The reason -> offer-screen map, sliced out of the page so the test cannot
// drift from what ships.
const mapStart = src.indexOf('const solutionMap = {');
assert.ok(mapStart > 0, 'could not find solutionMap in account.html');
const mapEnd = src.indexOf('  step2.innerHTML = solutionMap[reason]', mapStart);
assert.ok(mapEnd > mapStart, 'could not find the end of solutionMap');
const solutionMap = src.slice(mapStart, mapEnd);

function branchFor(reason) {
  const start = solutionMap.indexOf(`\n    ${reason}: \``);
  assert.ok(start > 0, `no solutionMap branch for ${reason}`);
  const nextStarts = REASONS
    .map((r) => solutionMap.indexOf(`\n    ${r}: \``))
    .filter((i) => i > start);
  const end = nextStarts.length ? Math.min(...nextStarts) : solutionMap.length;
  return solutionMap.slice(start, end);
}

test('every cancellation reason offers a pause, not just "I am not using it"', () => {
  for (const reason of REASONS) {
    assert.match(
      branchFor(reason),
      /\$\{pauseCard\(/,
      `the "${reason}" screen does not offer to pause the billing`,
    );
  }
});

test('the two screens before the cancel button carry the offers', () => {
  for (const id of ['step3Offers', 'step5Offers']) {
    assert.ok(src.includes(`id="${id}"`), `${id} container is missing from the modal`);
  }
  assert.match(src, /function declineAllSolutions\(\)[\s\S]{0,240}renderStep3Offers\(\)/,
    'step3 is shown without rendering its offers');
  assert.match(src, /function finishExitSurvey\(\)[\s\S]{0,300}renderStep5Offers\(\)/,
    'step5 is shown without rendering its offers');
});

test('a successful pause lands on its own confirmation, not a green line', () => {
  assert.ok(src.includes('id="stepPaused"'), 'the paused confirmation screen is missing');
  // Twice: the preview branch and the real one. Preview walking a different
  // screen to production is how the preview stops being worth running.
  const routes = src.match(/if \(action === 'pause'\) \{ goToFlowStep\('stepPaused'\); return; \}/g) || [];
  assert.equal(routes.length, 2, 'pausing no longer routes to the paused confirmation screen in both preview and live');
});

test('cancelling ends on a screen that offers packs, not a dismissed alert', () => {
  assert.ok(src.includes('id="stepCancelled"'), 'the cancelled screen is missing');
  assert.match(src, /renderCancelledOffers\(\);\s*\n\s*goToFlowStep\('stepCancelled'\);/,
    'the cancelled screen is reached without rendering the offer on it');
  assert.doesNotMatch(
    src,
    /alert\('Your subscription has been cancelled/,
    'the post-cancellation alert is back, and it replaces the offer screen',
  );
});

/*
 * CLAUDE.md: never recommend PAYG to a CRM user. Credits do not open the
 * HubSpot connection — that is billed monthly — so packs cannot do the job a
 * CRM customer is here for. renderCrmOrPaygCard() is the only gate, so
 * paygCard() must never be reached around it.
 */
test('credit packs are only ever rendered through the CRM guard', () => {
  const calls = src.match(/paygCard\(/g) || [];
  assert.equal(calls.length, 2, 'expected exactly the definition and one guarded call site');
  assert.match(src, /function renderCrmOrPaygCard\(context\) \{[\s\S]*?return paygCard\(context\);\s*\n\}/,
    'renderCrmOrPaygCard no longer owns the only paygCard() call');
  assert.match(src, /function isCrmUser\(\)[\s\S]{0,220}crmConnected === true[\s\S]{0,220}usage\.value === 'crm'/,
    'the CRM check no longer reads both the live connection and the exit-survey answer');
});

test('the CRM screen says what a subscription buys them, and offers no packs', () => {
  const start = src.indexOf('function crmNoteCard()');
  const end = src.indexOf('function renderCrmOrPaygCard', start);
  const card = src.slice(start, end);
  assert.ok(start > 0 && end > start, 'crmNoteCard is missing');
  assert.match(card, /needs an active subscription/, 'the CRM card does not say a plan is required');
  assert.doesNotMatch(card, /openPaygFromCancellation/, 'the CRM card links to credit packs');
});

test('the pack prices match the packs the page actually sells', () => {
  const start = src.indexOf('function paygCard(context)');
  const card = src.slice(start, src.indexOf('function crmNoteCard', start));
  for (const [price, credits] of [['$25', '1,000'], ['$75', '3,500'], ['$200', '10,000']]) {
    assert.ok(card.includes(price) && card.includes(credits),
      `the packs card no longer quotes ${price} / ${credits} credits`);
  }
  assert.match(card, /never expire/, 'the packs card no longer says credits never expire');
});

/*
 * The offers sit in front of the cancel button, never in place of it — two
 * clicks to cancel is what ROSCA's "simple mechanism" looks at, and it is the
 * rule docs/exit-survey.md already ships under.
 */
test('cancelling is still reachable from every screen that offers something', () => {
  assert.ok(src.includes('id="startExitSurveyBtn"'), 'step3 lost its cancellation CTA');
  assert.ok(src.includes('id="confirmCancelBtn"'), 'step5 lost the real cancel button');
  assert.match(src, /id="surveyCancelFooter"[\s\S]{0,700}js-confirm-cancel/,
    'the survey no longer keeps cancelling one click away');
  assert.match(src, /backToPauseOffer\(\)/, 'the survey no longer offers the pause as an alternative');
});

test('offer buttons are addressed by class, so two can share a screen', () => {
  for (const dead of ['id="pauseBtn"', 'id="discountBtn"', 'id="pauseStatus"', 'id="discountStatus"']) {
    assert.ok(!src.includes(dead), `${dead} is back — duplicate ids across stacked offer cards`);
  }
  const pauseClicks = src.match(/retentionAction\('pause'[^)]*\)/g) || [];
  assert.ok(pauseClicks.length >= 2, 'expected several pause buttons');
  for (const call of pauseClicks) {
    assert.match(call, /retentionAction\('pause', (this|btnEl)?\)?/, `${call} does not pass its own button`);
  }
});

test('packs opened from the cancellation flow are priced as packs, not as a plan change', () => {
  const start = src.indexOf('function showPricingModal(');
  const body = src.slice(start, src.indexOf("document.getElementById('pricingModal').classList.add('show')", start));
  const paygBranch = body.indexOf("if (trigger === 'cancellation_payg') {\n        // Checked before");
  const subBranch = body.indexOf('} else if (isExistingSubscriber) {');
  assert.ok(paygBranch > 0, 'the cancellation_payg copy branch is missing');
  assert.ok(paygBranch < subBranch,
    'the subscriber branch runs first, so a churner buying a pack is told they only pay the difference');
});
