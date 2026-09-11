import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load js/lf-plan-value.js the way a page does: a `window` global, a document
// that is still loading (so style injection waits and never touches the DOM).
function load() {
    const src = readFileSync(new URL('../js/lf-plan-value.js', import.meta.url), 'utf8');
    const window = { document: { readyState: 'loading', addEventListener() {} } };
    window.window = window;
    vm.runInNewContext(src, window);
    return window.LFPlanValue;
}

// The costs the module promises on the card must be the costs the app charges.
test('credit costs match app.html creditCosts', () => {
    const V = load();
    const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    const m = app.match(/const creditCosts=\{([^}]*)\}/);
    assert.ok(m, 'creditCosts not found in app.html');
    const costs = Object.fromEntries([...m[1].matchAll(/'([a-z_]+)':(\d+)/g)].map(([, k, v]) => [k, Number(v)]));
    assert.equal(V.COSTS.phone, costs.linkedin_profile_to_phone);
    assert.equal(V.COSTS.email, costs.linkedin_profile_to_email);
    assert.equal(V.COSTS.profile, costs.linkedin_profile_to_linkedin_info);
    assert.equal(V.COSTS.linkedin, costs.lead_full_name_to_linkedin_url);
});

test('plan credits and prices match app.html plans[]', () => {
    const V = load();
    const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    for (const p of V.PLANS) {
        const re = new RegExp(`key:'${p.key}',\\s*monthlyPrice:(\\d+),\\s*credits:(\\d+)`);
        const m = app.match(re);
        assert.ok(m, `plan ${p.key} not found in app.html`);
        assert.equal(p.monthlyPrice, Number(m[1]), `${p.key} monthly price`);
        assert.equal(p.creditsPerMonth, Math.round(Number(m[2]) / 12), `${p.key} credits/mo`);
        assert.equal(p.annualMonthly, Math.round(p.monthlyPrice * 0.6), `${p.key} annual price`);
    }
});

test('"how much for 100 phone numbers" is Starter', () => {
    const V = load();
    assert.deepEqual({ ...V.allowance(5000) }, { phones: 100, emails: 500, profiles: 500, linkedin: 5000 });
    assert.equal(V.creditsFor({ phones: 100 }), 5000);
    const r = V.recommend({ phones: 100 });
    assert.equal(r.kind, 'plan');
    assert.equal(r.plan.key, 'starter');
    assert.equal(r.pack.key, 'payg_large');           // the one-off that also covers it
    assert.equal(V.recommend({ phones: 101 }).plan.key, 'pro');
    assert.equal(V.recommend({ phones: 400 }).plan.key, 'pro');
    assert.equal(V.recommend({ phones: 1000 }).plan.key, 'enterprise'); // display name Scale
    assert.equal(V.recommend({ phones: 1001 }).kind, 'enterprise');
    assert.equal(V.recommend({ emails: 500, linkedin: 0 }).plan.key, 'starter');
    assert.equal(V.recommend({ phones: 20 }).pack.key, 'payg_small');
    assert.equal(V.recommend({}).kind, 'none');
});

test('unit price reads as cents per phone number', () => {
    const V = load();
    assert.equal(V.money(V.unitPrice(V.PLANS[0], 'phone', false)), '49¢');
    assert.equal(V.money(V.unitPrice(V.PLANS[0], 'phone', true)), '29¢');
    assert.equal(V.money(V.unitPrice(V.PLANS[2], 'phone', false)), '15¢');
});

test('card block names the three units and the credit rule', () => {
    const V = load();
    const html = V.allowanceHTML(20000, { period: 'mo' });
    assert.match(html, /<b>400<\/b> phone numbers/);
    assert.match(html, /<b>2,000<\/b> verified emails/);
    assert.match(html, /<b>20,000<\/b> LinkedIn URLs/);
    assert.match(html, /phone 50 · email 10 · LinkedIn URL 1/);
});

// The static copy on the pricing page and homepage is hand-written; keep it
// honest against the module.
test('pricing page and homepage state the same allowances', () => {
    const V = load();
    const pricing = readFileSync(new URL('../pricing.html', import.meta.url), 'utf8');
    const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const p of V.PLANS) {
        const a = V.allowance(p.creditsPerMonth);
        const phones = a.phones.toLocaleString('en-US'), emails = a.emails.toLocaleString('en-US');
        assert.ok(pricing.includes(`<b>${phones}</b> phone numbers`), `pricing.html: ${p.name} phones ${phones}`);
        assert.ok(pricing.includes(`<b>${emails}</b> verified emails`), `pricing.html: ${p.name} emails ${emails}`);
        assert.ok(home.includes(`<b>${phones}</b> phone numbers`), `index.html: ${p.name} phones ${phones}`);
        assert.ok(home.includes(`<b>${emails}</b> verified emails`), `index.html: ${p.name} emails ${emails}`);
    }
    // The old contradiction must not come back.
    assert.ok(!pricing.includes('Look up a business phone number = <strong>1 credit</strong>'));
    assert.ok(!pricing.includes("that's 2,500 fully enriched leads"));
});
