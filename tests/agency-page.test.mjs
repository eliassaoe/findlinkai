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
    // /agency visitors are in the agency segment: Pro and Business only
    // (SUBSCRIPTION_PLANS), never the entry plan. docs/agency-pricing.md.
    const list = app.match(/const SUBSCRIPTION_PLANS = \[[\s\S]*?\];/)[0];
    const plans = [...list.matchAll(/key:'(\w+)',\s*monthlyPrice:(\d+),\s*credits:(\d+)/g)]
        .map(m => ({ key: m[1], price: Number(m[2]), credits: Number(m[3]) }));
    assert.equal(plans.length, 2);
    assert.doesNotMatch(page, /starter|Starter|\$49/);
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
    assert.deepEqual(keys, ['pro_annual', 'enterprise_annual', 'pro_monthly', 'enterprise_monthly']);
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
    // /agency sells the call; the pricing modal no longer advertises it.
    assert.doesNotMatch(app, /agencyOfferBanner|\+ free 1:1 setup call/);
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

test('the emailed link enrols the prospect without leaking their email', () => {
    const stamp = page.match(/<script>\s*\/\/ The hand-sent link[\s\S]*?<\/script>/)[0];
    // Taken off the URL before PostHog is even loaded.
    assert.ok(page.indexOf(stamp) < page.indexOf('posthog.init('));
    assert.match(stamp, /u\.searchParams\.delete\('email'\)/);
    assert.match(stamp, /history\.replaceState/);
    // Belt and braces: the URL scrubber redacts it too.
    assert.match(page, /\|secret\|email\)=\[\^&#\]\*\/gi/);
    // Stored on the person, which is what the follow-up workflow sends to.
    assert.match(page, /posthog\.setPersonProperties\(\{ email: leadEmail, agency_lead: true/);
    assert.match(page, /track\('agency_page_viewed', \{ email_link: !!leadEmail \}\)/);
    // Test results go on the person so the email can quote them.
    assert.match(page, /agency_demo_emails: emails, agency_demo_phones: phones/);
});

test('the email is stripped and kept for a real link', () => {
    const stamp = page.match(/<script>\s*\/\/ The hand-sent link[\s\S]*?<\/script>/)[0]
        .replace(/^<script>/, '').replace(/<\/script>$/, '');
    let replaced = null;
    const win = { location: { href: 'https://linkfinderai.com/agency?utm_source=explee&utm_content=acme&email=Ann%40Acme.com' } };
    new Function('window', 'history', 'URL', stamp)(win, { replaceState: (a, b, url) => { replaced = url; } }, URL);
    assert.equal(win.__lfLeadEmail, 'ann@acme.com');
    assert.equal(replaced, '/agency?utm_source=explee&utm_content=acme');
});

test('the tested list is carried to the app and opens ready to run', () => {
    const signup = read('sign-up.html');
    // /agency keeps the file, with the operation the app should run.
    assert.match(page, /localStorage\.setItem\('lf_agency_pending_csv'/);
    assert.match(page, /saveList\(file\.name \|\| 'my-list\.csv', text, 'linkedin_profile__email', urls\.length\)/);
    assert.match(page, /saveList\(file\.name \|\| 'my-list\.csv', text, 'lead_full_name__email', people\.length\)/);
    // Both ops exist in the app's own configuration.
    assert.match(app, /lead_full_name: \{[^}]*outputs:\{[^}]*email:/);
    assert.match(app, /linkedin_profile: \{[^}]*outputs:\{[^}]*email:/);
    // The app reads it once and pushes it through the real upload path.
    const fn = app.match(/function lfLoadAgencyList\(\)\{[\s\S]*?\n\}/)[0];
    assert.match(fn, /localStorage\.removeItem\('lf_agency_pending_csv'\)/);
    assert.match(fn, /LF_AGENCY_LIST_OPS\.includes\(saved\.op\)/);
    assert.match(fn, /el\.dispatchEvent\(new Event\('change'\)\)/);
    assert.match(app, /setTimeout\(lfLoadAgencyList, 700\)/);
    // Signup says the list is saved, prefills the email and can go straight to Google.
    assert.match(signup, /lf_agency_pending_csv/);
    assert.match(signup, /localStorage\.getItem\('lf_agency_lead_email'\)/);
    assert.match(signup, /urlParams\.get\('google'\) === '1'/);
    assert.match(page, /href="\/sign-up\?google=1"/);
});

test('the rest of the file is shown blurred, and the expected shapes are spelled out', () => {
    assert.match(page, /if \(rest > 0\) renderLocked\(more, rest, noun === 'lead'\)/);
    assert.match(page, /\.locked \.vals\{filter:blur/);
    assert.match(page, /class="shapes"/);
    // The sample runs through the demo without using up the free test.
    assert.match(page, /if \(!isSample\) \{ try \{ localStorage\.setItem\(DEMO_USED_KEY/);
    const w = {};
    new Function('window', read('js/lf-csv.js'))(w);
    const src = page.match(/function extractPeople\(text\) \{[\s\S]*?\n  \}/)[0];
    const extractPeople = new Function('window', src + '; return extractPeople;')(w);
    const sample = new Function('return ' + page.match(/var SAMPLE_CSV = ([\s\S]*?);\n/)[1])();
    assert.equal(extractPeople(sample).length, 5);
});
