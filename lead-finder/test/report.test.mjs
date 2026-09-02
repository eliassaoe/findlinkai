import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReport, summarizeRuns } from '../src/report.mjs';

const runs = [
    {
        sourced: 40, qualified: 12, emailsFound: 8, pushed: 8, creditsSpent: 130,
        sources: [
            { id: 'post', label: 'competitor post', kind: 'linkedin_post_reactions', returned: 30, credits: 30 },
            { id: 'emp', label: 'target account', kind: 'company_employees', returned: 10, credits: 10 },
        ],
    },
    {
        sourced: 20, qualified: 6, emailsFound: 4, pushed: 4, creditsSpent: 70,
        sources: [{ id: 'post', label: 'competitor post', kind: 'linkedin_post_reactions', returned: 20, credits: 20 }],
    },
];

test('runs add up per source and per agent', () => {
    const report = summarizeRuns(runs);
    assert.equal(report.totals.emailsFound, 12);
    assert.equal(report.totals.credits, 200);
    assert.equal(report.totals.costPerLead, 16.7);
    assert.equal(report.totals.qualifyRate, 0.3);
    assert.deepEqual(report.sources.map((source) => [source.id, source.returned]), [['post', 50], ['emp', 10]]);
});

test('replies read as unknown until the outreach tool supplies them', () => {
    const text = formatReport(summarizeRuns(runs), 'revops');
    assert.match(text, /n\/a/);
    assert.match(text, /Replies are unknown here/);

    const joined = summarizeRuns(runs, { replyStats: { post: { replies: 3 } } });
    assert.equal(joined.sources.find((source) => source.id === 'post').replies, 3);
    assert.equal(joined.replyDataProvided, true);
});

test('a report with no runs yet does not divide by zero', () => {
    const report = summarizeRuns([]);
    assert.equal(report.totals.costPerLead, null);
    assert.equal(report.totals.qualifyRate, null);
});
