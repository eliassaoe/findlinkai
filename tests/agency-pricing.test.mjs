// Agency pricing (docs/agency-pricing.md). Pins what would silently break it:
// who lands in the segment, the $49 plan leaking into an agency page's source,
// plans[] for an agency account, and the checkout worker's refusal.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const attribution = read('js/lf-attribution.js');
const starterFile = read('js/lf-starter-plan.js');
const app = read('app.html');
const account = read('account.html');
const pricing = read('pricing.html');
const agency = read('agency.html');

// Runs js/lf-attribution.js against a fake browser and returns what it did.
function land({ url, cookie = '', referrer = '', leadEmail } = {}) {
    const u = new URL(url);
    const cookies = [];
    let jar = cookie;
    const written = [];
    const calls = [];
    const posthog = {
        register: (p) => calls.push(['register', p]),
        unregister: (k) => calls.push(['unregister', k]),
        people: { set: (p) => calls.push(['people.set', p]) },
        capture: (e, p) => calls.push(['capture', e, p]),
    };
    const document = {
        referrer,
        get cookie() { return jar; },
        set cookie(v) {
            cookies.push(v);
            const [pair] = v.split(';');
            const maxAge = /Max-Age=0\b/.test(v);
            jar = maxAge ? '' : pair;
        },
        write: (s) => written.push(s),
    };
    const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
    const window = {
        location: { href: u.href, search: u.search, pathname: u.pathname, hostname: u.hostname, protocol: u.protocol },
        localStorage: store(), sessionStorage: store(), posthog, __lfLeadEmail: leadEmail,
    };
    vm.runInNewContext(attribution, { window, document, URL, URLSearchParams, JSON, Date, Object, Array, Promise });
    return { seg: window.LFSegment, cookies, calls, written, window };
}

test('utm_campaign starting with "agency" puts the visitor in the segment for 365 days', () => {
    const r = land({ url: 'https://linkfinderai.com/pricing?utm_campaign=agency_10plus' });
    assert.equal(r.seg.isAgency(), true);
    const set = r.cookies.find((c) => c.startsWith('segment=agency'));
    assert.ok(set, 'cookie written');
    assert.match(set, /Max-Age=31536000/);
    assert.match(set, /Path=\//);
    assert.match(set, /Domain=linkfinderai\.com/);
    assert.ok(r.calls.some((c) => c[0] === 'register' && c[1].segment === 'agency'), 'segment super property');
    assert.equal(JSON.stringify(r.calls.find((c) => c[0] === 'people.set')), JSON.stringify(['people.set', { segment: 'agency' }]));
});

test('email= on a landing page puts the visitor in the segment', () => {
    assert.equal(land({ url: 'https://linkfinderai.com/pricing?email=a@b.co' }).seg.isAgency(), true);
    // agency.html strips email= before this file runs and leaves it here.
    assert.equal(land({ url: 'https://linkfinderai.com/agency', leadEmail: 'a@b.co' }).seg.isAgency(), true);
});

test('email= on an internal redirect does not (every buyer lands on /app?email=)', () => {
    assert.equal(land({ url: 'https://linkfinderai.com/app?email=a@b.co' }).seg.isAgency(), false);
    assert.equal(land({ url: 'https://linkfinderai.com/upgrade-confirmation?email=a@b.co' }).seg.isAgency(), false);
    assert.equal(land({ url: 'https://linkfinderai.com/pricing?email=a@b.co', referrer: 'https://linkfinderai.com/app' }).seg.isAgency(), false);
    assert.match(read('upgrade-confirmation.html'), /linkfinderai\.com\/app';[\s\S]*\?email=/, 'the redirect this guards against still exists');
});

test('other campaigns and plain visits are not agency, and the cookie persists', () => {
    assert.equal(land({ url: 'https://linkfinderai.com/pricing?utm_campaign=icp30k' }).seg.isAgency(), false);
    assert.equal(land({ url: 'https://linkfinderai.com/pricing' }).seg.isAgency(), false);
    const back = land({ url: 'https://linkfinderai.com/pricing', cookie: 'x=1; segment=agency' });
    assert.equal(back.seg.isAgency(), true);
    assert.ok(back.calls.some((c) => c[0] === 'register' && c[1].segment === 'agency'), 'super property on every later page');
});

test('the entry plan file is loaded for everyone except agency visitors', () => {
    const normal = land({ url: 'https://linkfinderai.com/app' });
    normal.seg.writeStarterScript();
    assert.deepEqual(normal.written, ['<script src="/js/lf-starter-plan.js"><\/script>']);
    const ag = land({ url: 'https://linkfinderai.com/app', cookie: 'segment=agency' });
    ag.seg.writeStarterScript();
    assert.deepEqual(ag.written, []);
    for (const [name, page] of [['app.html', app], ['account.html', account], ['pricing.html', pricing]]) {
        assert.match(page, /<script src="\/js\/lf-attribution\.js"><\/script>\n<script>LFSegment\.writeStarterScript\(\);<\/script>/, name);
    }
});

test('the database wins once there is an account', () => {
    const r = land({ url: 'https://linkfinderai.com/app', cookie: 'segment=agency' });
    assert.equal(r.seg.applyServerSegment(null), true);
    assert.equal(r.seg.isAgency(), false);
    assert.match(r.cookies.at(-1), /^segment=; Max-Age=0/);
    assert.deepEqual(r.calls.at(-1), ['unregister', 'segment']);
    const n = land({ url: 'https://linkfinderai.com/app' });
    n.seg.applyServerSegment('agency');
    assert.equal(n.seg.isAgency(), true);
});

test('plan ids and agency display names', () => {
    const r = land({ url: 'https://linkfinderai.com/?utm_campaign=agency' });
    assert.equal(r.seg.planId('pro_monthly'), 'pro');
    assert.equal(r.seg.planId('enterprise_annual'), 'business');
    assert.equal(r.seg.planId('starter_monthly'), 'starter');
    assert.equal(r.seg.planName('pro', 'Professional'), 'Pro');
    assert.equal(r.seg.planName('enterprise', 'Scale'), 'Business');
    assert.equal(land({ url: 'https://linkfinderai.com/' }).seg.planName('enterprise', 'Scale'), 'Scale');
    assert.equal(r.seg.CUSTOM_PLAN_URL, 'https://calendly.com/hamoureliasse/linkfinder-ai');
});

test('the $49 plan is in no page source, only in js/lf-starter-plan.js', () => {
    for (const [name, page] of [['app.html', app], ['account.html', account], ['pricing.html', pricing], ['agency.html', agency]]) {
        assert.doesNotMatch(page, /\$49\b/, name + ' quotes $49');
        assert.doesNotMatch(page, /monthlyPrice:\s*49\b/, name + ' defines the plan');
        assert.ok(!page.includes('pdt_0Nfl5LZfppnjJBM2mvons') && !page.includes('pdt_0Nfl5q5bWWWymf2XQnJUD'), name + ' carries its Dodo ids');
        assert.doesNotMatch(page, />\s*Starter\s*</, name + ' renders a Starter label');
    }
    assert.match(starterFile, /window\.LF_STARTER_PLAN = \{ name:'Starter', key:'starter', monthlyPrice:49, credits:60000 \};/);
    assert.match(starterFile, /data-plan=\\"starter\\"/);
});

// Builds app.html's plan state for a given segment, from its own source.
function appPlans({ agency, starterLoaded = true }) {
    const grab = (re) => { const m = app.match(re); assert.ok(m, String(re)); return m[0]; };
    const src = [
        grab(/const DODO_DIRECT_PRODUCTS = \{[\s\S]*?\};/),
        grab(/const SUBSCRIPTION_PLANS = \[[\s\S]*?\];/),
        'const plans = [];',
        grab(/const PLAN_NUMBER_KEYS = \{[^}]*\};/),
        grab(/function planByNumber\(planNumber\) \{[\s\S]*?\n\}/),
        grab(/function isAgencySegment\(\) \{[\s\S]*?\n\}/),
        grab(/function applySegmentToPlans\(\) \{[\s\S]*?\n\}/),
        grab(/const PLAN_PARAM_ALIASES = \{[\s\S]*?\};/),
        'applySegmentToPlans();',
        grab(/function resolvePlanParam\(planParam, billingParam\) \{[\s\S]*?\n\}/),
        'return { plans, DODO_DIRECT_PRODUCTS, planByNumber, resolvePlanParam };',
    ].join('\n');
    const window = {};
    if (starterLoaded) vm.runInNewContext(starterFile, { window });
    const LFSegment = land({ url: 'https://linkfinderai.com/app', cookie: agency ? 'segment=agency' : '' }).seg;
    window.LFSegment = LFSegment;
    return new Function('window', 'LFSegment', src)(window, LFSegment);
}

test('app.html: an agency account can buy Pro and Business, nothing else', () => {
    const a = appPlans({ agency: true });
    assert.deepEqual(a.plans.map((p) => [p.key, p.name]), [['pro', 'Pro'], ['enterprise', 'Business']]);
    assert.equal(a.DODO_DIRECT_PRODUCTS.starter_monthly, undefined);
    assert.equal(a.resolvePlanParam('starter_annual'), null, '?plan=starter opens the modal, not a checkout');
    assert.equal(a.planByNumber(6).key, 'pro');
    const n = appPlans({ agency: false });
    assert.deepEqual(n.plans.map((p) => p.key), ['starter', 'pro', 'enterprise']);
    assert.equal(n.plans[2].name, 'Scale');
    assert.equal(n.DODO_DIRECT_PRODUCTS.starter_monthly, 'pdt_0Nfl5LZfppnjJBM2mvons');
    assert.deepEqual(n.resolvePlanParam('starter_annual'), { index: 0, billing: 'annual' });
    assert.equal(n.planByNumber(1).key, 'starter', 'existing $49 subscribers still see their plan');
});

test('app.html: agency accounts get the custom-plan card and the tracking events', () => {
    assert.match(app, /isAgencySegment\(\) \? renderCustomPlanCard\('pricing_modal'\) : renderEnterpriseCard\(\)/);
    assert.match(app, /posthog\.capture\('custom_plan_clicked'/);
    assert.match(app, /window\.open\(LFSegment\.CUSTOM_PLAN_URL/);
    assert.match(app, /posthog\.capture\('pricing_viewed', \{ surface: trigger === 'credits_exhausted'/);
    assert.match(app, /posthog\.capture\('pricing_viewed', \{ surface: 'credits_exhausted_modal'/);
    assert.match(app, /plan_id: window\.LFSegment \? LFSegment\.planId\(planKey\) : null/);
    assert.match(app, /plan_id: pending\?\.plan_key && window\.LFSegment \? LFSegment\.planId\(pending\.plan_key\) : null/);
    assert.match(app, /LFSegment\.sync\(token\)/);
    assert.match(account, /LFSegment\.sync\(token\)/);
    assert.match(read('sign-up.html'), /LFSegment\.sync\(data\.token\)/);
    assert.match(read('confirmation-signup.html'), /LFSegment\.sync\(result\.token\)/);
});

test('pricing.html: custom card for agency, and the three events', () => {
    assert.match(pricing, /if \(window\.LF_STARTER_CARD_HTML\) document\.write\(window\.LF_STARTER_CARD_HTML\);/);
    assert.match(pricing, /posthog\.init\('phc_/);
    assert.ok(pricing.indexOf("posthog.init('phc_") < pricing.indexOf('/js/lf-attribution.js'), 'PostHog must exist before the segment registers on it');
    assert.match(pricing, /posthog\.capture\('pricing_viewed'/);
    assert.match(pricing, /posthog\.capture\('custom_plan_clicked'/);
    assert.match(pricing, /posthog\.capture\('plan_selected'/);
    assert.match(pricing, /grid\.replaceChild\(custom, sales\)/);
});

// ------------------------------------------------------------ checkout worker
const worker = (await import(new URL('../workers/dodo-checkout/worker.js', import.meta.url))).default;

async function checkout(plan, segmentResponse) {
    const sent = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        if (String(url).includes('/rpc/get_user_segment')) {
            if (segmentResponse instanceof Error) throw segmentResponse;
            return new Response(JSON.stringify(segmentResponse), { status: 200 });
        }
        sent.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ checkout_url: 'https://checkout.dodopayments.com/session/x', session_id: 's' }), { status: 200 });
    };
    try {
        const res = await worker.fetch(new Request('https://dodo-checkout.example/', {
            method: 'POST',
            headers: { Origin: 'https://linkfinderai.com', 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, user_token: 'tok_12345678' }),
        }), { DODO_PAYMENTS_API_KEY: 'k' });
        return { body: await res.json(), sent };
    } finally {
        globalThis.fetch = realFetch;
    }
}

test('worker: an agency account asking for Starter gets a Pro session', async () => {
    const m = await checkout('starter_monthly', 'agency');
    assert.equal(m.sent[0].product_cart[0].product_id, 'pdt_0Nfl5YPolhxfkTEMxOJYp');
    assert.equal(m.sent[0].metadata.plan, 'pro_monthly');
    assert.deepEqual(m.body.plan_redirected, { from: 'starter_monthly', to: 'pro_monthly', reason: 'agency_segment' });
    const a = await checkout('starter_annual', 'agency');
    assert.equal(a.sent[0].metadata.plan, 'pro_annual');
    // The bare alias the browser may send resolves the same way.
    assert.equal((await checkout('starter', 'agency')).sent[0].metadata.plan, 'pro_monthly');
});

test('worker: everyone else, and a failed lookup, keep Starter', async () => {
    const n = await checkout('starter_monthly', null);
    assert.equal(n.sent[0].metadata.plan, 'starter_monthly');
    assert.equal(n.body.plan_redirected, null);
    const down = await checkout('starter_monthly', new Error('supabase down'));
    assert.equal(down.sent[0].metadata.plan, 'starter_monthly', 'a lookup outage must not block checkout');
    // Other plans never trigger a lookup.
    assert.equal((await checkout('pro_monthly', 'agency')).sent[0].metadata.plan, 'pro_monthly');
});
