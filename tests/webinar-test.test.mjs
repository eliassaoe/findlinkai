// The webinar test: one dated landing page, one dismissible bar on the home
// page and the app, registrations stored through the existing sales_leads
// door. These pin the parts that break silently -- above all that the date
// on the page and the date in the banner never drift apart, and that the bar
// takes itself down once the session is over.
//
// Numbers, verdict and the bar the test has to clear: docs/webinar-test.md.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('webinar.html');
const banner = read('js/lf-webinar-banner.js');
const index = read('index.html');
const app = read('app.html');
const sitemap = read('gen_sitemap.py');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('webinar test');

const iso = (s) => (s.match(/startISO:\s*'([^']+)'/) || [])[1];
const slug = (s) => (s.match(/slug:\s*'([^']+)'/) || [])[1];

// ------------------------------------------------------------------ one date
test('the page and the banner carry the same start time and slug', () => {
  assert.ok(iso(page), 'webinar.html has no startISO');
  assert.equal(iso(banner), iso(page), 'banner startISO must equal the page startISO');
  assert.equal(slug(banner), slug(page), 'banner slug must equal the page slug');
  assert.ok(!isNaN(new Date(iso(page)).getTime()), 'startISO must parse');
});

test('the date in the copy matches the date in the config', () => {
  const d = new Date(iso(page));
  const day = d.getUTCDate();
  assert.match(page, new RegExp('Friday ' + day + ' September 2026'), 'hero copy must name the configured day');
  assert.equal(d.getUTCDay(), 5, 'the configured date must be a Friday, as the copy says');
  assert.match(banner, new RegExp("when: 'Friday " + day + " Sept'"), 'banner label must name the configured day');
});

// ---------------------------------------------------------- where the bar is
test('the banner is on the home page and the app, and nowhere it should not be', () => {
  assert.match(index, /<script src="\/js\/lf-webinar-banner\.js" defer><\/script>/);
  assert.match(app, /<script src="\/js\/lf-webinar-banner\.js" defer><\/script>/);
  assert.equal(page.includes('<script src="/js/lf-webinar-banner.js"'), false, 'the page must not show a bar pointing at itself');
  assert.equal(page.includes('lf-highticket-cta.js'), false, 'the page has its own CTA; no injected band');
  assert.match(page, /<body data-lf-cta="off">/, 'belt and braces: the highticket router is told to stay off');
});

test('the banner never renders on /webinar or on the auth flow', () => {
  assert.match(banner, /if \(\/\^\\\/webinar\/\.test\(path\)\) return;/);
  assert.match(banner, /log-in\|sign-up\|verify-email/);
});

test('the banner is a static bar, not a popup: dismissible, remembered, self-expiring', () => {
  assert.match(banner, /lf_webinar_banner_dismissed_/, 'dismissal must be remembered');
  assert.match(banner, /if \(state === 'over'\) return;/, 'must remove itself after the session');
  assert.equal(/position:\s*fixed|position:\s*sticky/.test(banner), false, 'never sticky, never over content');
  assert.match(banner, /insertBefore\(bar, document\.body\.firstChild\)/, 'top of the document, in flow');
});

test('lfWebinarState: upcoming, live for the duration, then over', () => {
  const fn = banner.match(/function lfWebinarState[\s\S]*?\n  \}/);
  assert.ok(fn, 'lfWebinarState not found');
  const ctx = {};
  vm.runInNewContext(fn[0] + '; out = lfWebinarState;', ctx);
  const start = Date.parse('2026-09-25T15:00:00Z');
  assert.equal(ctx.out(start - 1, start, 45), 'upcoming');
  assert.equal(ctx.out(start, start, 45), 'live');
  assert.equal(ctx.out(start + 45 * 60000, start, 45), 'live');
  assert.equal(ctx.out(start + 45 * 60000 + 1, start, 45), 'over');
  assert.equal(ctx.out(start, NaN, 45), 'over', 'an unparseable date must never render a bar');
});

// -------------------------------------------------------------- registrations
test('registrations go through sales_lead_request, tagged so they can be read back', () => {
  assert.match(page, /\/rest\/v1\/rpc\/sales_lead_request/);
  assert.match(page, /p_offer: 'webinar'/);
  assert.match(page, /p_src: WEBINAR\.slug \+ '\/' \+ src/, 'src must carry the slug so the rows can be filtered');
  assert.match(page, /p_token:/, 'a signed-in registrant should be linked to their account');
});

test('the reminder signal is tracked: calendar links fire their own event', () => {
  assert.match(page, /calendar\.google\.com\/calendar\/render/);
  assert.match(page, /BEGIN:VCALENDAR/);
  assert.match(page, /webinar_calendar_added/);
  assert.match(page, /webinar_registered/);
  assert.match(page, /webinar_landing_viewed/);
});

test('the page is out of the sitemap but crawlable, and says when the session is over', () => {
  assert.match(page, /<meta name="robots" content="noindex"\/>/);
  assert.match(sitemap, /NOINDEX_ONLY = \{[\s\S]*"webinar",[\s\S]*\}/, 'webinar must be in NOINDEX_ONLY');
  assert.equal(/EXCLUDE = \{[^}]*"webinar"/.test(sitemap), false, 'not in EXCLUDE: a Disallow line would advertise it');
  assert.match(page, /body\.is-over \.only-upcoming\{display:none\}/);
  assert.match(page, /if \(Date\.now\(\) > end\.getTime\(\)\) document\.body\.classList\.add\('is-over'\)/);
});

test('no join link is invented: the page says it arrives by email', () => {
  assert.equal(/zoom\.us|meet\.google|streamyard|youtube\.com\/live/i.test(page), false);
  assert.match(page, /link by email the morning of/);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', with failures' : ''));
