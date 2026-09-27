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

test('prices on the page match plans[] in app.html, annual first', () => {
    const plans = [...app.matchAll(/key:'(\w+)',\s*monthlyPrice:(\d+),\s*credits:(\d+)/g)]
        .map(m => ({ key: m[1], price: Number(m[2]), credits: Number(m[3]) }));
    assert.equal(plans.length, 3);
    // The app's own annual maths: 40% off monthly, rounded the same way.
    assert.match(app, /const monthlyEquiv\s+= isAnnual \? Math\.round\(plan\.monthlyPrice \* 0\.6\) : plan\.monthlyPrice;/);
    assert.match(app, /const annualTotal\s+= Math\.round\(plan\.monthlyPrice \* 0\.6 \* 12\);/);
    for (const p of plans) {
        const perMonth = Math.round(p.price * 0.6), perYear = Math.round(p.price * 0.6 * 12);
        assert.ok(page.includes('<b>$' + perMonth + '</b><s>$' + p.price + '</s>'), `annual price for ${p.key}`);
        assert.ok(page.includes('billed $' + perYear.toLocaleString('en-US') + ' a year'), `yearly total for ${p.key}`);
        assert.ok(page.includes(p.credits.toLocaleString('en-US') + ' credits a year (' + (p.credits / 12).toLocaleString('en-US') + ' credits a month)'),
            `credits for ${p.key}`);
    }
    assert.doesNotMatch(page, /AGENCY50/);
});

test('every plan button uses a key the app resolves, annual first', () => {
    const aliases = app.match(/const PLAN_PARAM_ALIASES = \{([\s\S]*?)\};/)[1];
    const keys = [...page.matchAll(/data-plan="(\w+)_(monthly|annual)"/g)].map(m => m[1] + '_' + m[2]);
    assert.deepEqual(keys, ['starter_annual', 'pro_annual', 'enterprise_annual',
        'starter_monthly', 'pro_monthly', 'enterprise_monthly']);
    for (const k of keys) assert.match(aliases, new RegExp('\\b' + k.split('_')[0] + ':'));
});

test('app picks up lf_pending_plan once and opens checkout', () => {
    assert.match(page, /localStorage\.setItem\('lf_pending_plan'/);
    const block = app.match(/pendingPlan = localStorage\.getItem\('lf_pending_plan'\);([\s\S]*?)\n    \}\n/)[0];
    assert.match(block, /localStorage\.removeItem\('lf_pending_plan'\)/);
    assert.match(block, /resolvePlanParam\(pendingPlan/);
    assert.match(block, /proceedToCheckoutDirect\(pending\.index/);
});

test('/agency visitors get annual plus a setup call, never a discount code', () => {
    assert.match(page, /localStorage\.setItem\('lf_agency_offer'/);
    assert.match(app, /id="agencyOfferBanner"/);
    assert.match(app, /const agencyOffer = agencyOfferActive\(\) && billingMode === 'annual'/);
    const fn = app.match(/function agencyOfferActive\(\) \{([\s\S]*?)\n\}/)[1];
    assert.match(fn, /if \(isExistingSubscriber\) return false/);
    // No code is requested at checkout any more.
    assert.doesNotMatch(app, /payload\.discount_code/);
    assert.doesNotMatch(app, /'AGENCY50'/);
});

test('a paid annual agency plan shows the setup call booking prompt', () => {
    assert.match(app, /AGENCY_SETUP_CALL_PLANS = \['pro_annual', 'enterprise_annual'\]/);
    const ret = app.match(/function handleDodoReturnStatus\(\) \{([\s\S]*?)\n\}/)[1];
    const prompt = ret.indexOf('showAgencySetupCallPrompt(pending.plan_key)');
    assert.ok(prompt > 0, 'checkout return must show the prompt');
    // Must run before the upgrade-intent call flips isExistingSubscriber.
    assert.ok(prompt < ret.indexOf('fetch(UPGRADE_INTENT_WORKER'));
    assert.match(ret, /AGENCY_SETUP_CALL_PLANS\.includes\(pending\?\.plan_key\)/);
    assert.match(app, /agency_setup_call_clicked/);
});

test('pricing modal never opens on pay-as-you-go by default', () => {
    const open = app.match(/function showPricingModal\(trigger, extra\) \{([\s\S]*?)const modalTitle/)[1];
    assert.doesNotMatch(open, /billingMode = 'payg'/);
    assert.match(open, /billingMode = 'annual'/);
});

test('cold visitors can enrich a few leads before signing up', () => {
    // The demo sits above everything that asks for an account.
    assert.ok(page.indexOf('id="try"') < page.indexOf('href="/sign-up"'),
        'the no-signup demo must come before any signup link');
    // Same worker, key and requests as the free LinkedIn email and phone finder pages.
    assert.ok(page.indexOf('/js/lf-tools-key.js') < page.indexOf("window.LF_API_KEY"));
    assert.match(page, /\/js\/lf-linkedin-url\.js/);
    assert.match(page, /linkfinder-free-tools\.hamoureliasse\.workers\.dev/);
    assert.match(page, /lookup\(\{ type: 'business_email_finder', linkedin_url: url/);
    assert.match(page, /lookup\(\{ type: 'business_phone_finder', linkedin_url: url/);
    // Capped, and once per browser.
    assert.match(page, /var DEMO_MAX = 5;/);
    assert.match(page, /items = items\.slice\(0, DEMO_MAX\)/);
    assert.match(page, /localStorage\.setItem\(DEMO_USED_KEY/);
    // Worker output is never parsed as HTML.
    assert.doesNotMatch(page, /innerHTML\s*=(?!\s*'';)/);
    assert.match(page, /cell\.lastChild\.nodeValue = text/);
});

test('a dropped CSV feeds the demo, whatever its columns', () => {
    assert.match(page, /<input type="file" id="tryFile" accept="\.csv/);
    assert.match(page, /tryDrop\.addEventListener\('drop'/);
    const re = new Function('return ' + page.match(/var PROFILE_RE = (\/.*\/gi);/)[1])();
    const csv = 'Name;Company;LI\n"Ann";Acme;https://www.linkedin.com/in/ann-1/\n' +
        'Bob,"Beta, Inc",fr.linkedin.com/in/bob\nno link here\n' +
        'Dup;X;https://www.linkedin.com/in/ann-1/\tco;https://www.linkedin.com/company/acme\n';
    assert.deepEqual(csv.match(re), [
        'https://www.linkedin.com/in/ann-1/',
        'fr.linkedin.com/in/bob',
        'https://www.linkedin.com/in/ann-1/',
    ]);
});

test('a list with only names and companies finds the LinkedIn profile first', () => {
    assert.ok(page.indexOf('/js/lf-csv.js') < page.indexOf('function extractPeople'));
    // Same request as the free LinkedIn URL finder page.
    assert.match(page, /type: 'professional_profile_finder', first_name: it\.first,\s*last_name: it\.last, company_name: it\.company/);
    // LinkedIn links win; names are the fallback.
    const hf = page.match(/async function handleFile\(file\) \{[\s\S]*?\n  \}/)[0];
    assert.ok(hf.indexOf('extractProfiles(text)') < hf.indexOf('extractPeople(text)'));

    // Run the page's own parser over two real-world shapes.
    const w = {};
    new Function('window', read('js/lf-csv.js'))(w);
    const src = page.match(/function extractPeople\(text\) \{[\s\S]*?\n  \}/)[0];
    const extractPeople = new Function('window', src + '; return extractPeople;')(w);
    assert.deepEqual(
        extractPeople('First Name,Last Name,Title,Company Name\nAnn,Lee,CEO,Acme\nBob,Ray,,\nAnn,Lee,CEO,Acme\n')
            .map(p => [p.first, p.last, p.company]),
        [['Ann', 'Lee', 'Acme']]);
    assert.deepEqual(
        extractPeople('Full name;Entreprise\n"Doe, Jane";Beta Inc\nJohn Smith Jr;Gamma\n')
            .map(p => [p.first, p.last, p.company]),
        [['Jane', 'Doe', 'Beta Inc'], ['John', 'Smith Jr', 'Gamma']]);
    assert.deepEqual(extractPeople('email,phone\na@b.com,1\n'), []);
});
