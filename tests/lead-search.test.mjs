import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapLead, pickEmails, priceFor, buildInput, maxUsdFor, CREDITS_WITH_EMAIL, CREDITS_PROFILE_ONLY }
    from '../supabase/functions/lead-search/map.js';

// Lead search (10 Nov 2026), docs/lead-search.md. Synthetic rows only: this
// repo is public, so no real person's data goes in a fixture.

const item = (over = {}) => ({
    firstName: 'Ada', lastName: 'Example', headline: 'Java developer',
    linkedinUrl: 'https://www.linkedin.com/in/ada-example',
    location: { linkedinText: 'Paris, Île-de-France, France' },
    currentPosition: [{ position: 'Senior Java Developer', companyName: 'Acme', companyLinkedinUrl: 'https://www.linkedin.com/company/acme/' }],
    experience: [{ position: 'Senior Java Developer', companyName: 'Acme', duration: '2 yrs' }, { position: 'Developer', companyName: 'Beta' }],
    education: [{ schoolName: 'EPITA', degree: 'MSc' }],
    companyWebsites: [{ domain: 'acme.example' }],
    emails: [],
    ...over,
});

test('picks a valid work email first, keeps a personal one apart', () => {
    const e = pickEmails([
        { email: 'ada@gmail.example', status: 'valid', free: true },
        { email: 'ada@acme.example', status: 'valid', free: false, catchAllDomain: false },
    ]);
    assert.equal(e.email, 'ada@acme.example');
    assert.equal(e.email_status, 'valid');
    assert.equal(e.personal_email, 'ada@gmail.example');
});

test('a catch-all or risky work email is kept but marked risky', () => {
    assert.equal(pickEmails([{ email: 'a@acme.example', status: 'valid', free: false, catchAllDomain: true }]).email_status, 'risky');
    assert.equal(pickEmails([{ email: 'a@acme.example', status: 'risky', free: false }]).email_status, 'risky');
    assert.equal(pickEmails([{ email: 'a@acme.example', status: 'invalid', free: false }]).email, '');
});

test('maps a profile to the exported row', () => {
    const r = mapLead(item());
    assert.equal(r.full_name, 'Ada Example');
    assert.equal(r.job_title, 'Senior Java Developer');
    assert.equal(r.company, 'Acme');
    assert.equal(r.company_website, 'acme.example');
    assert.match(r.experience, /Senior Java Developer @ Acme \(2 yrs\) \| Developer @ Beta/);
    assert.equal(r.education, 'EPITA, MSc');
    assert.equal(mapLead({}), null);
});

test('billing: 15 per lead with an email, 5 without', () => {
    const withMail = mapLead(item({ emails: [{ email: 'ada@acme.example', status: 'valid', free: false }] }));
    const without = mapLead(item());
    assert.equal(priceFor([withMail, without]), CREDITS_WITH_EMAIL + CREDITS_PROFILE_ONLY);
    assert.equal(CREDITS_WITH_EMAIL, 15);
    assert.equal(CREDITS_PROFILE_ONLY, 5);
});

test('criteria: needs words or a title, caps the count at 100, drops unknown filters', () => {
    assert.ok(buildInput({}).error);
    const { input, n } = buildInput({ query: 'java', locations: 'Paris, Lyon', maxItems: 500, seniority: ['120', 'x'], headcount: ['C', 'Z'] });
    assert.equal(n, 100);
    assert.deepEqual(input.locations, ['Paris', 'Lyon']);
    assert.deepEqual(input.seniorityLevelIds, ['120']);
    assert.deepEqual(input.companyHeadcount, ['C']);
    assert.equal(input.profileScraperMode, 'Full + email search');
    assert.ok(maxUsdFor(100) <= 2);
});

test('the proxy secret and URL are not in the repo', () => {
    const fn = readFileSync(new URL('../supabase/functions/lead-search/index.ts', import.meta.url), 'utf8');
    assert.match(fn, /lead_finder_config/);
    assert.doesNotMatch(fn, /webhook\/lf-lead-search-/);
});

test('no Lead Search tab in the app (owner, 10 Nov: an enrichment input first); the page bills what the server bills', () => {
    const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /data-page="leadSearch"/);
    const page = readFileSync(new URL('../lead-search.html', import.meta.url), 'utf8');
    assert.match(page, /PER_EMAIL = 15, PER_PROFILE = 5/);
    assert.match(page, /noindex/);
});

test('search kinds: urls bills 1 per profile, preview is free and capped at 50, leads stays 15/5', async () => {
    const { KINDS, chargeFor } = await import('../supabase/functions/lead-search/map.js');
    const rows = [mapLead(item()), mapLead(item({ linkedinUrl: 'https://www.linkedin.com/in/b' }))];
    assert.equal(chargeFor('urls', rows), 2);
    assert.equal(chargeFor('preview', rows), 0);
    assert.equal(chargeFor('leads', rows), 10);
    assert.equal(KINDS.preview.max, 50);
    assert.equal(KINDS.urls.withEmails, false);
    assert.equal(buildInput({ query: 'x', maxItems: 500 }, false, KINDS.preview.max).n, 50);
    assert.ok(Array.isArray(mapLead(item()).exp_list));
});

test('free list page offers "pas de liste ?" and reuses the found profile', () => {
    const lp = readFileSync(new URL('../liste-gratuite.html', import.meta.url), 'utf8');
    assert.match(lp, /id="tryQuery"/);
    assert.match(lp, /action: 'preview'/);
    assert.match(lp, /if \(it\.pre\) \{ st\.pr = it\.pre;/);
});

test('app: LinkedIn search fills the list for LinkedIn profile lookups', () => {
    const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    assert.match(app, /id="lfLiSearch"/);
    assert.match(app, /currentInputType === 'linkedin_profile' \? '' : 'none'/);
    assert.match(app, /kind: 'urls'/);
    assert.match(app, /parseCSV\(csv\)/);
});
