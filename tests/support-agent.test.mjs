import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    CREDIT_COSTS, ENRICHMENTS, parseCsv, detectMapping, planEnrichment, analyzeFile,
    applyOverrides, describePlan, summarizeResult, historyToCsv, csvHead, batchLabel,
} from '../supabase/functions/support-agent/agent-core.js';

// The support agent queues files for the same background runner the app does,
// so its copies of the app's tables must be the app's tables. These read the
// literals straight out of app.html and compare.

const appSrc = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

function literal(marker) {
    const i = appSrc.indexOf(marker);
    assert.ok(i > 0, `could not find "${marker}" in app.html`);
    const start = appSrc.indexOf('{', i);
    let depth = 0, end = start;
    for (; end < appSrc.length; end++) {
        if (appSrc[end] === '{') depth++;
        else if (appSrc[end] === '}' && --depth === 0) break;
    }
    return new Function(`return (${appSrc.slice(start, end + 1)});`)();
}

test('credit costs match app.html creditCosts', () => {
    assert.deepEqual(CREDIT_COSTS, literal('const creditCosts='));
});

test('enrichment combinations and labels match app.html dataConfigurations', () => {
    const app = literal('const dataConfigurations = ');
    assert.deepEqual(Object.keys(ENRICHMENTS), Object.keys(app));
    for (const [k, cfg] of Object.entries(app)) {
        assert.deepEqual(ENRICHMENTS[k].outputs, cfg.outputs, k);
        assert.equal(ENRICHMENTS[k].label, cfg.label.replace('Enter ', ''), k);
    }
});

test('header synonyms match app.html LF_HEADER_SYNONYMS', () => {
    const coreSrc = readFileSync(new URL('../supabase/functions/support-agent/agent-core.js', import.meta.url), 'utf8');
    const i = coreSrc.indexOf('const HEADER_SYNONYMS = ');
    const start = coreSrc.indexOf('{', i);
    const end = coreSrc.indexOf('\n};', start);
    const core = new Function(`return (${coreSrc.slice(start, end + 2)});`)();
    assert.deepEqual(core, literal('const LF_HEADER_SYNONYMS = '));
});

test('batch label is the one the History card shows', () => {
    assert.equal(batchLabel('lead_full_name', 'email'), 'Lead Full Name + Company Name → Verified Email');
});

test('parseCsv sniffs ; and skips a title row', () => {
    const p = parseCsv('My export\nfirstName;lastName;entreprise\nJohn;Doe;Acme\n;;\n"Jane";"Roe, Jr";Initech\n');
    assert.deepEqual(p.headers, ['firstName', 'lastName', 'entreprise']);
    assert.deepEqual(p.rows, [['John', 'Doe', 'Acme'], ['Jane', 'Roe, Jr', 'Initech']]);
});

test('parseCsv refuses a header-only file', () => {
    assert.ok(parseCsv('a,b\n').error);
});

test('first + last + entreprise is a full name lookup', () => {
    const { headers, rows } = parseCsv('firstName,lastName,entreprise\nJohn,Doe,Acme\nJane,,Initech\n');
    const p = planEnrichment(headers, rows, 'lead_full_name', 'email');
    assert.equal(p.ok, true);
    assert.deepEqual(p.columns_used, { first: 'firstName', last: 'lastName', company: 'entreprise' });
    assert.equal(p.enrichable_rows, 2);
    assert.equal(p.max_credits, 14);
});

test('name lookups need a company column', () => {
    const { headers, rows } = parseCsv('Full Name,City\nJohn Doe,Paris\n');
    const p = planEnrichment(headers, rows, 'lead_full_name', 'email');
    assert.equal(p.ok, false);
    assert.match(p.error, /company/);
});

test('a "LinkedIn URL" column of company pages is not read as profiles', () => {
    const { headers, rows } = parseCsv('Company,LinkedIn URL\nTesla,https://www.linkedin.com/company/tesla-motors\nApple,https://linkedin.com/company/apple\n');
    assert.equal(planEnrichment(headers, rows, 'linkedin_profile', 'email').ok, false);
    const c = planEnrichment(headers, rows, 'linkedin_company', 'employee_count');
    assert.equal(c.ok, true);
    assert.equal(c.columns_used.name, 'LinkedIn URL');
});

test('a primary column is found by its values when no header names it', () => {
    const { headers, rows } = parseCsv('Contact,Ref\nJohn,https://www.linkedin.com/in/john\nJane,https://www.linkedin.com/in/jane\n');
    const m = detectMapping(headers, rows, 'linkedin_profile');
    assert.equal(m.name, 1);
});

test('LinkedIn URLs are never offered as company domains', () => {
    const { headers, rows } = parseCsv('Profile\nhttps://www.linkedin.com/in/john\n');
    assert.equal(planEnrichment(headers, rows, 'company_domain', 'employees').ok, false);
});

test('analyzeFile lists the enrichments a file can feed, largest first', () => {
    const { headers, rows } = parseCsv('Name,Company,Email\nJohn Doe,Acme,john@acme.com\nJane Roe,Initech,\n');
    const a = analyzeFile(headers, rows);
    const keys = a.options.map((o) => `${o.input_type}_to_${o.output_type}`);
    assert.ok(keys.includes('lead_full_name_to_email'));
    assert.ok(keys.includes('company_name_to_website'));
    assert.ok(keys.includes('email_to_linkedin_url'));
    assert.ok(!keys.includes('linkedin_profile_to_email'));
    const email = a.options.find((o) => o.input_type === 'email');
    assert.equal(email.enrichable_rows, 1);
    assert.equal(a.options[0].enrichable_rows, 2);
});

test('employee lists have no fixed ceiling', () => {
    const { headers, rows } = parseCsv('Domain\ntesla.com\napple.com\n');
    const p = planEnrichment(headers, rows, 'company_domain', 'employees');
    assert.equal(p.ok, true);
    assert.equal(p.max_credits, null);
});

test('overrides pick a column by name and reject unknown ones', () => {
    const { headers, rows } = parseCsv('Who,Org,Employer\nJohn Doe,Acme,Other\n');
    const p = planEnrichment(headers, rows, 'lead_full_name', 'email', { name: 'who', company: 'Employer' });
    assert.equal(p.ok, true);
    assert.deepEqual(p.columns_used, { name: 'Who', company: 'Employer' });
    const bad = applyOverrides(headers, {}, { company: 'Nope' });
    assert.deepEqual(bad.unknown, ['Nope']);
    assert.equal(planEnrichment(headers, rows, 'lead_full_name', 'email', { company: 'Nope' }).ok, false);
});

test('unknown combinations are refused', () => {
    const { headers, rows } = parseCsv('Email\na@b.com\n');
    assert.equal(planEnrichment(headers, rows, 'email', 'phone').ok, false);
});

test('only subscription_id makes a subscriber', () => {
    assert.deepEqual(describePlan({ subscription_id: 'sub_1', plan_type: 6, is_unlimited: true }).plan, 'Professional');
    assert.equal(describePlan({ subscription_id: 'sub_1', plan_type: 6 }).billing, 'annual');
    const pack = describePlan({ subscription_id: null, plan_type: 1, is_unlimited: true });
    assert.equal(pack.subscribed, false);
    assert.equal(pack.plan, 'Credit pack (no subscription)');
    assert.equal(describePlan({ subscription_id: null }).plan, 'Free');
});

test('summarizeResult reads every shape enrichment_history holds', () => {
    assert.equal(summarizeResult({ result: 'https://www.linkedin.com/company/microsoft/', status: 'success' }), 'https://www.linkedin.com/company/microsoft/');
    assert.equal(summarizeResult('{"result": ""}'), '');
    assert.equal(summarizeResult({ result: '{"name":"Ada","jobTitle":"CTO"}' }), 'name: Ada · jobTitle: CTO');
    assert.equal(summarizeResult({ employees: [{}, {}] }), '2 employees');
    assert.equal(summarizeResult([1, 2, 3]), '3 results');
});

test('historyToCsv quotes cells and flattens newlines', () => {
    const csv = historyToCsv([{ timestamp: 't', type: 'x', input: 'a "b"\nc', result: { result: 'r' }, credits_used: 1, source: 'app' }]);
    assert.equal(csv.split('\n')[1], '"t","x","a ""b"" c","r","1","app"');
});

test('csvHead keeps the header and n rows', () => {
    assert.equal(csvHead('h\n1\n2\n3\n', 2), 'h\n1\n2\n');
});
