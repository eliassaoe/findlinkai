// Outbound (agency segment) plans: docs/agency-outbound-pricing.md.
// Pins the price list, the switch that keeps them off until their Dodo
// products exist, the worker's copy of the product ids, and that every page
// selling plans to an agency account loads the list.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const catalogSrc = read('js/lf-agency-plans.js');
const app = read('app.html');
const account = read('account.html');
const pricing = read('pricing.html');
const agency = read('agency.html');
const workerSrc = read('workers/dodo-checkout/worker.js');

// Loads the catalog, optionally with product ids filled in.
function catalog(products) {
    let src = catalogSrc;
    for (const [planKey, id] of Object.entries(products || {})) {
        const re = new RegExp("(planKey: '" + planKey + "'[^\\n]*product: )''");
        assert.match(src, re, planKey);
        src = src.replace(re, "$1'" + id + "'");
    }
    const window = {};
    vm.runInNewContext(src, { window });
    return window.LF_AGENCY_PLANS;
}

const ALL_IDS = { agency_annual: 'pdt_a', agency_quarterly: 'pdt_q', agency_pro_annual: 'pdt_p' };

test('the price list', () => {
    const A = catalog();
    const rows = JSON.parse(JSON.stringify(A.plans.flatMap((p) => p.options.map((o) => [o.planKey, o.price, o.months, o.credits, o.perMonth, o.planNumber]))));
    assert.deepEqual(rows, [
        ['agency_annual',     1428, 12, 360000, 119, 12],
        ['agency_quarterly',   417,  3,  90000, 139, 11],
        ['agency_pro_annual', 2988, 12, 900000, 249, 13],
    ]);
    assert.ok(!/monthly/.test(JSON.stringify(rows)), 'no month-to-month option');
    assert.equal(A.option('agency_quarterly').plan.name, 'Agency');
    assert.equal(A.byPlanNumber(13).planKey, 'agency_pro_annual');
    // Plan numbers must not collide with the public ones (1-8).
    for (const n of [11, 12, 13]) assert.ok(n > 8);
});

test('off until every product id is filled', () => {
    assert.equal(catalog().live, false);
    assert.equal(catalog({ agency_annual: 'pdt_a', agency_quarterly: 'pdt_q' }).live, false);
    assert.equal(catalog(ALL_IDS).live, true);
});

test('cards: Agency yearly + quarterly, Agency Pro yearly only, current plan disabled', () => {
    const html = catalog(ALL_IDS).cardsHtml(null);
    assert.match(html, /proceedToAgencyCheckout\('agency_annual', this\)[^>]*>Pay yearly: \$1,428</);
    assert.match(html, /proceedToAgencyCheckout\('agency_quarterly', this\)[^>]*>Pay quarterly: \$417</);
    assert.match(html, /proceedToAgencyCheckout\('agency_pro_annual', this\)[^>]*>Pay yearly: \$2,988</);
    assert.equal((html.match(/proceedToAgencyCheckout/g) || []).length, 3);
    assert.match(html, /\$119<\/span><span class="plan-item-period">\/mo/);
    assert.match(html, /30,000 credits\/mo/);
    assert.match(html, /75,000 credits\/mo/);
    const cur = catalog(ALL_IDS).cardsHtml('agency_quarterly');
    assert.match(cur, /proceedToAgencyCheckout\('agency_quarterly', this\)" disabled>Current plan</);
});

test('the worker sells exactly the catalog products, and refuses until they exist', async () => {
    const A = catalog();
    for (const plan of A.plans) {
        for (const o of plan.options) {
            const m = workerSrc.match(new RegExp('\\n  ' + o.planKey + ":\\s*'([^']*)'"));
            assert.ok(m, o.planKey + ' is in PRODUCT_IDS');
            assert.equal(m[1], o.product, o.planKey + ': worker and js/lf-agency-plans.js disagree');
        }
    }
    const worker = (await import(new URL('../workers/dodo-checkout/worker.js', import.meta.url))).default;
    const realFetch = globalThis.fetch;
    let dodoCalled = false;
    globalThis.fetch = async () => { dodoCalled = true; return new Response('{}', { status: 200 }); };
    try {
        const res = await worker.fetch(new Request('https://dodo-checkout.example/', {
            method: 'POST',
            headers: { Origin: 'https://linkfinderai.com', 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'agency_annual', user_token: 'tok_12345678' }),
        }), { DODO_PAYMENTS_API_KEY: 'k' });
        if (!A.live) {
            assert.equal(res.status, 400);
            assert.match((await res.json()).error, /Plan not configured: agency_annual/);
            assert.equal(dodoCalled, false);
        }
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('every page that sells plans to agency accounts loads the list and gates on it', () => {
    for (const [name, page] of [['app.html', app], ['account.html', account], ['pricing.html', pricing], ['agency.html', agency]]) {
        assert.match(page, /<script src="\/js\/lf-agency-plans\.js"><\/script>/, name);
    }
    for (const [name, page] of [['app.html', app], ['account.html', account]]) {
        assert.match(page, /function agencyPlansActive\(\) \{\n    return isAgencySegment\(\) && !!\(window\.LF_AGENCY_PLANS && LF_AGENCY_PLANS\.live\);/, name);
        assert.match(page, /if \(toggle\) toggle\.style\.display = agencyPlansOn \? 'none' : '';/, name + ': no billing toggle, so no monthly and no packs');
        assert.match(page, /async function proceedToAgencyCheckout\(planKey, btnEl\)/, name);
    }
    assert.match(pricing, /if \(!A \|\| !A\.live\) return;/);
    assert.match(agency, /if \(!A \|\| !A\.live\) return;/);
    // The agency rewrite on /agency must run before the click handlers bind.
    assert.ok(agency.indexOf('Outbound plans (js/lf-agency-plans.js') < agency.indexOf("document.querySelectorAll('[data-plan]').forEach"));
});

test('app.html: out of credits shows the plans, links resume the checkout, the setup call follows', () => {
    assert.match(app, /if \(agencyPlansActive\(\)\) \{\n        showPricingModal\('credits_exhausted'\);\n        return;\n    \}/);
    assert.match(app, /const resumedAgency = agencyPlanParam\(p\.get\('plan'\)\);/);
    assert.match(app, /const pendingAgency = agencyPlanParam\(pendingPlan\);/);
    assert.match(app, /const AGENCY_PLAN_KEYS = \['agency_annual', 'agency_quarterly', 'agency_pro_annual'\];/);
    assert.match(app, /\|\| AGENCY_PLAN_KEYS\.includes\(pending\?\.plan_key\)\) \{\n            showAgencySetupCallPrompt/);
});

test('the refund policy covers the yearly outbound plans, not quarterly', () => {
    assert.match(read('refund-policy.html'), /Agency or Agency Pro, billed yearly; quarterly billing is not covered/);
});
