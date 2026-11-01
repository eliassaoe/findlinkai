// "Buy Credits" on /pricing. The pay-as-you-go buttons link to
// /sign-up?payg=<pack>, and nothing downstream reads ?payg=, so for months a
// click on "Buy Credits $25" landed the buyer in /app with no checkout open.
// The fix hands the pack over in localStorage (lf_pending_payg), exactly like
// /agency's lf_pending_plan. These tests pin both ends of that handoff.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('pricing.html');
const app = read('app.html');

test('every PAYG button on /pricing is a pack the handoff recognises', () => {
    const packs = [...page.matchAll(/href="[^"]*sign-up\?payg=([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(packs.sort(), ['large', 'medium', 'small']);
});

test('pricing page stores the pack and waits for the DOM before wiring', () => {
    assert.match(page, /localStorage\.setItem\('lf_pending_payg', pack \+ '\|' \+ Date\.now\(\)\)/);
    // The script sits above the PAYG cards; without this the selector finds nothing.
    const at = page.indexOf("localStorage.setItem('lf_pending_payg'");
    const wiring = page.lastIndexOf("document.addEventListener('DOMContentLoaded'", at);
    assert.ok(wiring !== -1 && at - wiring < 2000, 'PAYG wiring must run on DOMContentLoaded');
});

test('app reads the pack once, expires it, and opens that pack\'s checkout', () => {
    const start = app.indexOf("localStorage.getItem('lf_pending_payg')");
    assert.ok(start !== -1, 'app.html must read lf_pending_payg');
    const block = app.slice(start, start + 1500);
    assert.match(block, /localStorage\.removeItem\('lf_pending_payg'\)/);
    assert.match(block, /24 \* 60 \* 60 \* 1000/);
    assert.match(block, /!looksLikeDodoReturn/);
    assert.match(block, /\['small', 'medium', 'large'\]\.indexOf\(parts\[0\]\)/);
    assert.match(block, /proceedToPaygCheckout\(paygIndex, null\)/);
});

test('pack order in the handoff matches proceedToPaygCheckout', () => {
    const fn = app.slice(app.indexOf('async function proceedToPaygCheckout'));
    const keys = [...fn.slice(0, 600).matchAll(/key: 'payg_([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(keys, ['small', 'medium', 'large']);
});
