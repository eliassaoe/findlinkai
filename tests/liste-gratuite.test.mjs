// /liste-gratuite (8 Nov 2026, docs/liste-gratuite.md): one person at a time,
// an end-of-run popup that leads to signup, and the app downloads the saved
// list after signup as the page promises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../liste-gratuite.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

test('lookups run one at a time, with retries and a second pass', () => {
  assert.doesNotMatch(page, /Promise\.all\(\[worker\(\)/);
  assert.doesNotMatch(page, /Promise\.all\(\[\s*profileLookup/);
  // two lanes, one per service: profile N+1 loads while email N is searched
  assert.match(page, /await profileStage\(i\);/);
  assert.match(page, /emailLane = emailLane\.then\(function \(\) \{ return emailStage\(k, false\); \}\);/);
  assert.match(page, /async function withRetry\(fn\)/);
  assert.match(page, /await profileStage\(again\[j\]\); await emailStage\(again\[j\], true\);/);
});

test('the end of a run opens the signup popup', () => {
  assert.match(page, /showDoneModal\(profiles, emails, items\.length, total\);/);
  assert.match(page, /id="doneModal"/);
  assert.match(page, /id="dmGoogle" href="\/sign-up\?google=1"/);
});

test('the app downloads the saved free list after signup', () => {
  assert.match(app, /function lfDownloadFreeList\(\)/);
  assert.match(app, /localStorage\.getItem\('lf_free_list_results'\)/);
  assert.match(app, /setTimeout\(function\(\)\{ try \{ lfDownloadFreeList\(\); \} catch\(e\) \{\} \}, 1500\);/);
});

test('each row shows experiences and education, email stays masked', () => {
  assert.match(page, /function renderMore\(box, rec\)/);
  assert.match(page, /block\('Expériences', rec\.exps, 3, 'autre expérience'\);/);
  assert.match(page, /block\('Formation', rec\.edus, 2, 'autre formation'\);/);
  assert.match(page, /renderMore\(cell\._more, \{ exps: expList\(pr\), edus: eduList\(pr\) \}\);/);
  assert.match(page, /setCell\(cell, mask\(em\) \+ '  ✓', true\)/);
  // untrusted profile text goes in with textContent, never innerHTML
  const fn = page.slice(page.indexOf('function renderMore'), page.indexOf('function setCell'));
  assert.doesNotMatch(fn, /innerHTML/);
});

test('conversion: reassurance line, call offer, sticky bar after the run', () => {
  assert.match(page, /class="trust"/);
  assert.match(page, /id="dmCall"[^>]*data-cta="fr_modal_call"|data-cta="fr_modal_call"[^>]*id="dmCall"/);
  assert.match(page, /calendly\.com\/hamoureliasse\/linkfinder-ai\?utm_source=liste-gratuite/);
  assert.match(page, /id="stickyCta" hidden/);
  assert.match(page, /showDoneModal\(profiles, emails, items\.length, total\);\n    showSticky\(\);/);
});
