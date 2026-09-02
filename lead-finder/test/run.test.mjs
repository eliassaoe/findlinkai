import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDefaults } from '../src/config.mjs';
import { runAgent } from '../src/run.mjs';
import { emptyState } from '../src/state.mjs';
import { Budget } from '../src/budget.mjs';

const agent = () => withDefaults({
    id: 'test-agent',
    icp: {
        titles: { include: ['vp sales', 'head of growth', 'revops'], exclude: ['intern'] },
        excludeCompanies: ['instantly'],
    },
    sources: [
        { id: 'post', kind: 'linkedin_post_reactions', label: 'competitor post', input: 'https://www.linkedin.com/posts/x', weight: 3, maxItems: 10 },
        { id: 'employees', kind: 'company_employees', by: 'domain', label: 'target account', input: 'tesla.com', weight: 1, maxItems: 5 },
    ],
    enrich: { email: true, minScore: 3, maxPerRun: 2 },
    budget: { maxCreditsPerRun: 1000 },
    destination: { id: 'instantly', target: { id: 'campaign-1' } },
});

const reactions = [
    { name: 'Ada Lovelace', headline: 'VP Sales at Tesla', linkedinUrl: 'https://www.linkedin.com/in/ada', reactionType: 'PRAISE' },
    { name: 'Grace Hopper', headline: 'Head of Growth at Salesforce', linkedinUrl: 'https://www.linkedin.com/in/grace', reactionType: 'LIKE' },
    { name: 'Sales Intern', headline: 'Sales intern at Microsoft', linkedinUrl: 'https://www.linkedin.com/in/intern', reactionType: 'LIKE' },
    { name: 'Rival Rep', headline: 'VP Sales at Instantly', linkedinUrl: 'https://www.linkedin.com/in/rival', reactionType: 'LIKE' },
];

const employees = [
    { name: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace', jobTitle: 'VP Sales', company: 'Tesla', linkedinUrl: 'http://linkedin.com/in/ada/', email: 'ada@tesla.com' },
    { name: 'Alan Turing', firstName: 'Alan', lastName: 'Turing', jobTitle: 'RevOps Manager', company: 'Tesla', linkedinUrl: 'https://www.linkedin.com/in/alan' },
];

/** Records every call so a test can assert on what was and was not paid for. */
function stubClient({ emails = {} } = {}) {
    const calls = [];
    return {
        calls,
        async enrich(type, input) {
            calls.push({ type, input });
            if (type === 'linkedin_post_to_reactions') return { resolved: true, result: reactions };
            if (type === 'company_domain_to_employees') return { resolved: true, result: employees };
            if (type === 'linkedin_profile_to_email') return { resolved: true, result: emails[input] ?? null };
            throw new Error(`unexpected call ${type}`);
        },
    };
}

test('a dry run sources and scores but never spends a credit on enrichment', async () => {
    const client = stubClient();
    const { summary, skipped } = await runAgent(agent(), { client, state: emptyState('test-agent'), dryRun: true });

    assert.equal(client.calls.filter((call) => call.type === 'linkedin_profile_to_email').length, 0);
    // Sourcing is charged per record returned: 4 reactions + 2 employees.
    assert.equal(summary.creditsSpent, 6);
    assert.ok(skipped.some((entry) => entry.reason === 'dry_run'));
});

test('the ICP rules drop the intern and the competitor before any credit is spent on them', async () => {
    const { summary } = await runAgent(agent(), { client: stubClient(), state: emptyState('test-agent'), dryRun: true });
    assert.deepEqual(summary.rejectedBy, { title_excluded: 1, company_excluded: 1 });
});

test('a live run enriches highest intent first and stops at maxPerRun', async () => {
    const client = stubClient({ emails: { 'https://www.linkedin.com/in/grace': 'grace@salesforce.com' } });
    const pushed = [];
    const { summary, leads } = await runAgent(agent(), {
        client,
        state: emptyState('test-agent'),
        dryRun: false,
        pushLead: (lead) => pushed.push(lead),
    });

    // Ada appears in both sources and already has an email from the employee list, so
    // she costs nothing extra. Grace is the only profile worth a lookup.
    const lookups = client.calls.filter((call) => call.type === 'linkedin_profile_to_email');
    assert.deepEqual(lookups.map((call) => call.input), ['https://www.linkedin.com/in/grace']);
    assert.deepEqual(leads.map((lead) => lead.email), ['ada@tesla.com', 'grace@salesforce.com']);
    assert.equal(summary.creditsSpent, 6 + 10);
    assert.equal(pushed.length, 2);
    assert.equal(summary.pushed, 2);
});

test('a lookup that finds nothing is still charged and reported', async () => {
    const client = stubClient({ emails: {} });
    const { summary, skipped } = await runAgent(agent(), { client, state: emptyState('test-agent'), dryRun: false, pushLead: () => {} });

    assert.equal(summary.creditsSpent, 6 + 10);
    assert.ok(skipped.some((entry) => entry.reason === 'no_email_found'));
    assert.deepEqual(summary.emailsFound, 1); // Ada, who came with an address.
});

test('someone enriched in an earlier run is never paid for twice', async () => {
    const state = emptyState('test-agent');
    state.seen['linkedin.com/in/grace'] = { enriched: true, hasEmail: true, sources: ['post'], firstSeen: 'earlier' };

    const client = stubClient({ emails: { 'https://www.linkedin.com/in/grace': 'grace@salesforce.com' } });
    const { summary } = await runAgent(agent(), { client, state, dryRun: false, pushLead: () => {} });

    assert.equal(client.calls.filter((call) => call.type === 'linkedin_profile_to_email').length, 0);
    assert.equal(summary.alreadyEnriched, 1);
});

test('the budget stops the run cleanly and says so, keeping the leads it already has', async () => {
    const client = stubClient({ emails: { 'https://www.linkedin.com/in/grace': 'grace@salesforce.com' } });
    const { summary, leads } = await runAgent(agent(), {
        client,
        state: emptyState('test-agent'),
        dryRun: false,
        pushLead: () => {},
        // 6 credits of sourcing plus room for no ten-credit lookup at all.
        budget: new Budget(10),
    });

    assert.equal(summary.stoppedBy, 'budget');
    assert.equal(summary.creditsSpent, 6);
    assert.deepEqual(leads.map((lead) => lead.email), ['ada@tesla.com']);
});

test('one dead source does not lose the credits already spent on the others', async () => {
    const client = {
        calls: [],
        async enrich(type, input) {
            this.calls.push({ type, input });
            if (type === 'linkedin_post_to_reactions') throw new Error('post not found');
            if (type === 'company_domain_to_employees') return { resolved: true, result: employees };
            return { resolved: true, result: 'alan@tesla.com' };
        },
    };
    const { summary } = await runAgent(agent(), { client, state: emptyState('test-agent'), dryRun: false, pushLead: () => {} });

    assert.ok(summary.warnings.some((warning) => /post not found/.test(warning)));
    // The employee source still ran and was still charged for its two records.
    assert.equal(summary.sourced, 2);
    assert.equal(summary.creditsSpent, 2);
    // Both are below the threshold on the account source alone — which is the system
    // working: without the intent signal, a named-account employee is not worth ten
    // credits yet.
    assert.equal(summary.belowThreshold, 2);
});

test('a source still running is handed back as a job rather than re-run and paid for twice', async () => {
    const client = {
        async enrich(type) {
            if (type === 'linkedin_post_to_reactions') return { resolved: false, jobId: 'job-1', pollUrl: 'https://api/status/job-1' };
            return { resolved: true, result: employees };
        },
    };
    const { summary } = await runAgent(agent(), { client, state: emptyState('test-agent'), dryRun: true });
    assert.deepEqual(summary.pending, [{ source: 'post', jobId: 'job-1', pollUrl: 'https://api/status/job-1' }]);
});

test('the run is recorded in state so report has something to read', async () => {
    const state = emptyState('test-agent');
    await runAgent(agent(), { client: stubClient(), state, dryRun: true });
    assert.equal(state.runs.length, 1);
    assert.equal(state.runs[0].sources.length, 2);
    assert.ok(Object.keys(state.seen).length > 0);
});

test('the lookup cap counts lookups, not leads, so empty results still count against it', async () => {
    const many = Array.from({ length: 6 }, (unused, index) => ({
        name: `Person ${index}`,
        headline: 'VP Sales at Tesla',
        linkedinUrl: `https://www.linkedin.com/in/person-${index}`,
        reactionType: 'PRAISE',
    }));
    const client = {
        calls: [],
        async enrich(type, input) {
            this.calls.push({ type, input });
            if (type === 'linkedin_post_to_reactions') return { resolved: true, result: many };
            if (type === 'company_domain_to_employees') return { resolved: true, result: [] };
            return { resolved: true, result: null }; // every lookup comes back empty
        },
    };

    const { summary } = await runAgent(agent(), { client, state: emptyState('test-agent'), dryRun: false, pushLead: () => {} });

    assert.equal(summary.lookups, 2); // enrich.maxPerRun on the test agent
    assert.equal(summary.emailsFound, 0);
    assert.equal(summary.stoppedBy, 'enrich.maxPerRun');
    assert.equal(summary.creditsSpent, 6 + 20); // 6 sourced records, 2 lookups charged
});

test('an auth failure is not counted as a spend', async () => {
    const client = {
        async enrich(type) {
            if (type === 'linkedin_post_to_reactions') return { resolved: true, result: reactions };
            if (type === 'company_domain_to_employees') return { resolved: true, result: employees };
            const error = new Error('Invalid or missing LinkFinder AI API key.');
            error.code = 'unauthorized';
            throw error;
        },
    };
    const { summary } = await runAgent(agent(), { client, state: emptyState('test-agent'), dryRun: false, pushLead: () => {} });
    assert.equal(summary.creditsSpent, 6);
    assert.ok(summary.warnings.some((warning) => /Invalid or missing/.test(warning)));
});
