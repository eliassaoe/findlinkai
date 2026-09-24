// The /agency outbound landing page: the link sent by hand to agencies that
// replied yes. These tests pin what would silently break the funnel -- a
// price that drifts from plans[], a plan button whose key the app cannot
// resolve, and the lf_pending_plan handoff that opens checkout after signup.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('agency.html');
const app = read('app.html');

test('page stays out of search and carries attribution', () => {
    assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(page, /\/js\/lf-attribution\.js/);
    assert.ok(page.indexOf("utm_campaign', 'agency_10plus'") < page.indexOf('/js/lf-attribution.js'),
        'UTMs must be stamped before lf-attribution.js reads the URL');
});

test('prices on the page match plans[] in app.html', () => {
    const plans = [...app.matchAll(/key:'(\w+)',\s*monthlyPrice:(\d+),\s*credits:(\d+)/g)]
        .map(m => ({ key: m[1], price: Number(m[2]), monthlyCredits: Number(m[3]) / 12 }));
    assert.equal(plans.length, 3);
    for (const p of plans) {
        assert.ok(page.includes('$' + p.price), `page is missing $${p.price} for ${p.key}`);
        assert.ok(page.includes(p.monthlyCredits.toLocaleString('en-US') + ' credits a month'),
            `page is missing ${p.monthlyCredits} credits for ${p.key}`);
        if (p.key !== 'starter') {
            const half = (p.price / 2).toFixed(2);
            assert.ok(page.includes('$' + half), `AGENCY50 price $${half} missing for ${p.key}`);
        }
    }
});

test('every plan button uses a key the app resolves', () => {
    const aliases = app.match(/const PLAN_PARAM_ALIASES = \{([\s\S]*?)\};/)[1];
    const keys = [...page.matchAll(/data-plan="(\w+)_(monthly|annual)"/g)].map(m => m[1]);
    assert.deepEqual(keys, ['starter', 'pro', 'enterprise']);
    for (const k of keys) assert.match(aliases, new RegExp('\\b' + k + ':'));
});

test('app picks up lf_pending_plan once and opens checkout', () => {
    assert.match(page, /localStorage\.setItem\('lf_pending_plan'/);
    const block = app.match(/pendingPlan = localStorage\.getItem\('lf_pending_plan'\);([\s\S]*?)\n    \}\n/)[0];
    assert.match(block, /localStorage\.removeItem\('lf_pending_plan'\)/);
    assert.match(block, /resolvePlanParam\(pendingPlan/);
    assert.match(block, /proceedToCheckoutDirect\(pending\.index/);
});

test('pricing modal shows AGENCY50 to /agency visitors on monthly only', () => {
    assert.match(page, /localStorage\.setItem\('lf_agency_offer'/);
    assert.match(app, /id="agencyOfferBanner"/);
    assert.match(app, /localStorage\.getItem\('lf_agency_offer'/);
    assert.match(app, /const agencyOffer = agencyOfferActive\(\) && billingMode === 'monthly'/);
    assert.match(app, /AGENCY_OFFER_PLAN_KEYS = \['pro', 'enterprise'\]/);
    const fn = app.match(/function agencyOfferActive\(\) \{([\s\S]*?)\n\}/)[1];
    assert.match(fn, /if \(isExistingSubscriber\) return false/);
});
