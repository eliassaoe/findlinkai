import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Black Friday 2026 banner (docs/black-friday-ltd-2026.md).
const banner = readFileSync(new URL('../js/lf-bf-banner.js', import.meta.url), 'utf8');
const attr = readFileSync(new URL('../js/lf-attribution.js', import.meta.url), 'utf8');

test('the shared script loads the banner, and stops loading it after the deal', () => {
    assert.match(attr, /s\.src = '\/js\/lf-bf-banner\.js'/);
    assert.match(attr, /Date\.parse\('2026-12-01T07:59:00Z'\)/);
});

test('banner ends with the deal, shows a countdown only in the last 5 days', () => {
    assert.match(banner, /var END = Date\.parse\('2026-12-01T07:59:00Z'\)/);
    assert.match(banner, /var TIMER_FROM = END - 5 \* 864e5/);
});

test('banner is hidden on the deal and redeem pages and for past payers', () => {
    assert.match(banner, /lifetime-deal\|redeem-code\|redeem/);
    assert.match(banner, /e\.paid_before \|\| e\.has_ltd/);
});

test('banner links to the deal page with its own utm_source', () => {
    assert.match(banner, /\/lifetime-deal\?utm_source=site_banner&utm_medium=banner&utm_campaign=bf2026/);
});
