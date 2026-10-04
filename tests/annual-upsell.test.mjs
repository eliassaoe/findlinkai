// Moving monthly subscribers to annual is the upsell that matters most. The
// banner used to quote Starter's $240 to everyone; these pin that each monthly
// plan now sees its own saving, computed from plans[] with the same 40% maths
// the pricing grid uses.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

// Every plan a monthly subscriber can be on: the entry plan (its own file, see
// docs/agency-pricing.md) and SUBSCRIPTION_PLANS.
const starterSrc = readFileSync(new URL('../js/lf-starter-plan.js', import.meta.url), 'utf8');
const entry = starterSrc.match(/window\.LF_STARTER_PLAN = (\{[^}]*\});/)[1];
const plansSrc = '[' + entry + ',' + app.match(/const SUBSCRIPTION_PLANS = \[([\s\S]*?)\];/)[1] + ']';
const savingSrc = app.match(/function annualSaving\(plan\) \{[\s\S]*?\n\}/)[0];
const annualSaving = new Function(savingSrc + '; return annualSaving;')();
const plans = new Function('return ' + plansSrc)();

test('each monthly plan sees its own annual saving', () => {
    assert.deepEqual(plans.map(p => annualSaving(p)), [
        { monthlyYear: 588, annualTotal: 353, saving: 235 },
        { monthlyYear: 1188, annualTotal: 713, saving: 475 },
        { monthlyYear: 2988, annualTotal: 1793, saving: 1195 },
    ]);
    // Same annual total the pricing grid charges.
    assert.match(app, /const annualTotal\s+= Math\.round\(plan\.monthlyPrice \* 0\.6 \* 12\);/);
});

test('the banner is driven by the subscriber\'s plan, not a fixed figure', () => {
    assert.doesNotMatch(app, /\$240\/year/);
    assert.match(app, /if \(currentPlanNumber && currentPlanNumber <= 3\) showAnnualBanner\(currentPlanNumber\);/);
    assert.match(app, /const plan = planByNumber\(planNumber\);/);
});

test('dismissing snoozes the banner instead of hiding it forever', () => {
    assert.match(app, /localStorage\.setItem\('annual_banner_dismissed',String\(Date\.now\(\)\)\)/);
    assert.match(app, /Date\.now\(\) - dismissed < ANNUAL_BANNER_SNOOZE_MS/);
});

test('a monthly subscriber who buys annual raises the cancel-the-old-plan alert', () => {
    const remember = app.match(/function rememberPendingCheckout\(info\) \{[\s\S]*?\n\}/)[0];
    assert.match(remember, /info\.billingLabel === 'annual' && isExistingSubscriber/);
    assert.match(remember, /replaces_subscription_id: replacing \? currentSubscriptionId : null/);
    const ret = app.match(/function handleDodoReturnStatus\(\) \{([\s\S]*?)\n\}/)[1];
    assert.match(ret, /if \(pending\?\.replaces_subscription_id\)/);
    assert.match(ret, /posthog\.capture\('annual_switch_paid'/);
    assert.match(ret, /old_subscription_id: pending\.replaces_subscription_id/);
});

test('the 30-day annual guarantee is stated where annual is sold, and in the policy', () => {
    const policy = readFileSync(new URL('../refund-policy.html', import.meta.url), 'utf8');
    const agency = readFileSync(new URL('../agency.html', import.meta.url), 'utf8');
    assert.match(policy, /id="annual-guarantee"/);
    assert.match(policy, /within <strong>30 days of your first annual payment<\/strong>/);
    assert.match(agency, /30-day money-back guarantee/);
    assert.match(agency, /href="\/refund-policy#annual-guarantee"/);
    assert.match(app, /id="annualGuaranteeLine"/);
    assert.match(app, /guaranteeLine\.style\.display = isAnnual \? 'block' : 'none'/);
});
