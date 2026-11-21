// Cancel flow "ways to stay" (owner, 21 Nov 2026): pay per list instead of a
// subscription, and the Black Friday lifetime deal while it runs.
// Background: docs/churn-pause.md, "Ways to stay".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../account.html', import.meta.url), 'utf8');

test('step 3 carries both stay offers, below the cancel button', () => {
  const step3 = html.slice(html.indexOf('id="step3"'), html.indexOf('id="step4"'));
  assert.ok(step3.indexOf('startExitSurveyBtn') < step3.indexOf('stayOptionsCard'));
  assert.match(step3, /stayOffer\('payg'\)/);
  assert.match(step3, /id="stayLtdBtn"[^>]*display:none/);
});

test('the lifetime offer only shows before the Black Friday end and allowlists the leaver', () => {
  assert.match(html, /LTD_SAVE_OFFER_ENDS = Date\.parse\('2026-12-01T07:59:00Z'\)/);
  assert.match(html, /ltdBtn\.style\.display = ltdSaveOfferLive\(\) \? 'flex' : 'none'/);
  assert.match(html, /rest\/v1\/rpc\/ltd_allow_leaver/);
});

test('pay-per-list opens the pricing modal on the pay-as-you-go tab', () => {
  const fn = html.slice(html.indexOf('async function stayOffer'), html.indexOf('function declineAllSolutions'));
  assert.match(fn, /showPricingModal\('cancel_flow_payg'\);\s*setBilling\('payg'\);/);
  assert.match(fn, /retention_offer_clicked/);
});

test('the server side refuses non-subscribers and ends with the deal', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261121110000_ltd_cancel_flow_offer.sql', import.meta.url), 'utf8');
  assert.match(sql, /u\.subscription_id is null/);
  assert.match(sql, /timestamptz '2026-12-01 07:59:00\+00'/);
});
