// /free-list (11 Nov 2026, docs/black-friday-ltd-2026.md "US cold campaign"):
// English copy of /liste-gratuite for the US cold email, same flow, own events,
// a Black Friday line in the popup, and no phone promise while the phone
// lookup returns almost nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../free-list.html', import.meta.url), 'utf8');

test('same flow as /liste-gratuite, English, own events and utm', () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /await profileStage\(i\);/);
  assert.match(page, /showDoneModal\(profiles, emails, items\.length, total\);/);
  assert.match(page, /var RESULTS_KEY = 'lf_free_list_results';/);
  assert.match(page, /utm_campaign', 'us_free_list_bf2026'/);
  assert.doesNotMatch(page, /'fr_list_/);
  assert.match(page, /noindex, nofollow/);
});

test('popup carries the Black Friday deal; no phone lookup on the page', () => {
  assert.match(page, /id="dmBf"[^>]*data-cta="us_modal_bf"/);
  assert.match(page, /\/lifetime-deal\?utm_source=us_free_list&amp;utm_campaign=bf2026/);
  assert.doesNotMatch(page, /business_phone_finder|linkedin_profile_to_phone/);
});
