import test from 'node:test';
import assert from 'node:assert';

import { pushLeads, checkDestination } from '../push-leads.mjs';

/** Replaces global fetch with a scripted queue, and records what was sent. */
function stubFetch(responses) {
    const calls = [];
    const original = globalThis.fetch;

    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        const next = responses.shift() ?? { status: 200, body: {} };
        return {
            ok: next.status < 400,
            status: next.status,
            json: async () => next.body,
            text: async () => JSON.stringify(next.body ?? null),
        };
    };

    return { calls, restore: () => { globalThis.fetch = original; } };
}

test('pushLeads never calls LinkFinder AI — it only pushes what it is handed', async () => {
    const { calls, restore } = stubFetch([{ status: 200, body: {} }]);
    try {
        const outcome = await pushLeads({
            destination: 'instantly',
            credentials: { apiKey: 'k' },
            target: { id: 'camp1' },
            results: [{ input: 'Ada Lovelace Tesla', result: 'ada@tesla.com' }],
        });

        assert.strictEqual(calls.length, 1, 'exactly one call — to the destination, never a second one to LinkFinder AI');
        assert.strictEqual(calls[0].url, 'https://api.instantly.ai/api/v2/leads');
        assert.strictEqual(outcome.pushed.length, 1);
        assert.strictEqual(outcome.pushed[0].lead.email, 'ada@tesla.com');
    } finally {
        restore();
    }
});

test('a result of null is reported as skipped, not silently dropped', async () => {
    const outcome = await pushLeads({
        destination: 'instantly',
        credentials: { apiKey: 'k' },
        target: { id: 'camp1' },
        results: [{ input: 'nobody at nowhere', result: null }],
    });
    assert.strictEqual(outcome.pushed.length, 0);
    assert.strictEqual(outcome.skipped.length, 1);
    assert.match(outcome.skipped[0].reason, /found nothing/);
});

test('one failed push does not abandon the rest of the batch', async () => {
    const { restore } = stubFetch([{ status: 401, body: {} }, { status: 200, body: {} }]);
    try {
        const outcome = await pushLeads({
            destination: 'instantly',
            credentials: { apiKey: 'bad' },
            target: { id: 'camp1' },
            results: [
                { input: 'Ada Lovelace Tesla', result: 'ada@tesla.com' },
                { input: 'Alan Turing Tesla', result: 'alan@tesla.com' },
            ],
        });
        assert.strictEqual(outcome.failed.length, 1);
        assert.match(outcome.failed[0].error, /authentication failed/);
        assert.strictEqual(outcome.pushed.length, 1);
        assert.strictEqual(outcome.pushed[0].lead.email, 'alan@tesla.com');
    } finally {
        restore();
    }
});

test('checkDestination refuses a missing target before anything is sent', () => {
    assert.throws(
        () => checkDestination('instantly', { credentials: { apiKey: 'k' }, target: undefined }),
        /needs a target/,
    );
});

test('checkDestination lets JustCall through without a target — its target is optional', () => {
    assert.doesNotThrow(
        () => checkDestination('justcall', { credentials: { apiKey: 'k', apiSecret: 's' }, target: undefined }),
    );
});

test('checkDestination refuses a destination missing extra credentials', () => {
    assert.throws(
        () => checkDestination('salesforge', { credentials: { apiKey: 'k' }, target: { id: 'seq1' } }),
        /workspaceId/,
    );
});
