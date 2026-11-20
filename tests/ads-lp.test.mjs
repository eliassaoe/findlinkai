// Ad landing pages (ads_lp/build.py): never indexed, canonical to the SEO page,
// and none of the unprovable claims the SEO pages carry (ad networks reject
// "misleading" pages). Background: docs/paid-visibility-rule.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
console.log('ad landing pages');
for (const slug of ['linkedin-search-by-email', 'linkedin-url-finder']) {
  const lp = read(`lp/${slug}.html`);
  test(`${slug}: noindex, canonical to the SEO page, doctype first`, () => {
    assert.ok(lp.startsWith('<!DOCTYPE html>'));
    assert.ok(lp.includes('<meta name="robots" content="noindex, follow"/>'));
    assert.ok(lp.includes(`<link rel="canonical" href="https://linkfinderai.com/${slug}"/>`));
    assert.ok(!lp.includes('application/ld+json'));
    assert.ok(!lp.includes('hreflang'));
  });
  test(`${slug}: no testimonial or accuracy / volume claims`, () => {
    assert.ok(!/accuracy|class="testimonial|5,000\+|50K\+/i.test(lp.split('</head>')[1]));
  });
  test(`${slug}: keeps the working widget and the Google-first signup`, () => {
    assert.ok(lp.includes('<div class="main-card">'));
    assert.ok(lp.includes('sign-up?google=1&amp;source=lp_'));
  });
}
test('the LPs are not in the sitemap', () => {
  assert.ok(!read('sitemap.xml').includes('/lp/'));
});
console.log(`\n${passed} passed`);
