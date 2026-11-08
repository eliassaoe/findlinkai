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
  assert.match(page, /for \(var i = 0; i < items\.length; i\+\+\) \{ await processOne\(i, false\);/);
  assert.match(page, /async function withRetry\(fn\)/);
  assert.match(page, /await processOne\(again\[j\], true\)/);
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
