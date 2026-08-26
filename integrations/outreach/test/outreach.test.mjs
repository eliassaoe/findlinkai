import test from 'node:test';
import assert from 'node:assert';

import { toLead, toLeads } from '../lead.mjs';
import { DESTINATIONS, getDestination } from '../destinations/index.mjs';
import { enrichAndPush } from '../push.mjs';

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

const KEY = 'lf_test';

test('every destination declares what a caller needs to know about it', () => {
    for (const [id, destination] of Object.entries(DESTINATIONS)) {
        assert.strictEqual(destination.id, id, `${id} disagrees with its own id`);
        assert.ok(destination.label, `${id} has no label`);
        assert.ok(destination.targetLabel, `${id} does not say what its target is`);
        assert.ok(destination.docs, `${id} has no docs link`);
        assert.strictEqual(typeof destination.addLead, 'function');
    }
});

test('an unknown destination names the ones that exist', () => {
    assert.throws(() => getDestination('mailchimp'), /Known: activecampaign/);
});

test('camelCase and snake_case results normalise to the same lead', () => {
    const camel = toLead({ name: 'Ada Lovelace', email: 'ada@tesla.com', linkedinUrl: 'https://li/ada', companyWebsite: 'tesla.com' });
    const snake = toLead({ full_name: 'Ada Lovelace', email: 'ada@tesla.com', linkedin_url: 'https://li/ada', website: 'tesla.com' });

    for (const lead of [camel, snake]) {
        assert.strictEqual(lead.firstName, 'Ada');
        assert.strictEqual(lead.lastName, 'Lovelace');
        assert.strictEqual(lead.linkedinUrl, 'https://li/ada');
        assert.strictEqual(lead.companyWebsite, 'tesla.com');
    }
});

test('a scalar result keeps what the caller already knew', () => {
    const lead = toLead('ada@tesla.com', { fullName: 'Ada Lovelace', company: 'Tesla' });
    assert.strictEqual(lead.email, 'ada@tesla.com');
    assert.strictEqual(lead.firstName, 'Ada');
    assert.strictEqual(lead.company, 'Tesla');
});

test('a scalar that is not an email is not mistaken for one', () => {
    const lead = toLead('https://www.linkedin.com/in/ada', { fullName: 'Ada Lovelace' });
    assert.strictEqual(lead.email, undefined);
});

test('a list result becomes many leads', () => {
    const leads = toLeads([{ name: 'Ada Lovelace' }, { name: 'Alan Turing' }]);
    assert.deepStrictEqual(leads.map((l) => l.lastName), ['Lovelace', 'Turing']);
});

test('Instantly gets the confirmed field names, and the campaign', async () => {
    const { calls, restore } = stubFetch([
        { status: 200, body: { status: 'success', result: { name: 'Ada Lovelace', email: 'ada@tesla.com', headline: 'VP Eng' } } },
        { status: 200, body: { id: 'lead_1' } },
    ]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY,
            type: 'lead_full_name_to_email',
            input: 'Ada Lovelace Tesla',
            destination: 'instantly',
            credentials: { apiKey: 'inst_key' },
            target: { id: 'camp_1' },
        });

        assert.strictEqual(out.pushed.length, 1);

        const push = calls[1];
        assert.strictEqual(push.url, 'https://api.instantly.ai/api/v2/leads');
        assert.strictEqual(push.options.headers.Authorization, 'Bearer inst_key');

        const body = JSON.parse(push.options.body);
        assert.strictEqual(body.email, 'ada@tesla.com');
        assert.strictEqual(body.first_name, 'Ada');
        assert.strictEqual(body.last_name, 'Lovelace');
        assert.strictEqual(body.campaign, 'camp_1');
        assert.strictEqual(body.custom_variables.job_title, 'VP Eng');
    } finally {
        restore();
    }
});

test('a list target goes to list_id instead of campaign', async () => {
    const { calls, restore } = stubFetch([
        { status: 200, body: { result: { name: 'Ada', email: 'ada@tesla.com' } } },
        { status: 200, body: {} },
    ]);

    try {
        await enrichAndPush({
            apiKey: KEY,
            type: 'lead_full_name_to_email',
            input: 'Ada Tesla',
            destination: 'instantly',
            credentials: { apiKey: 'k' },
            target: { id: 'list_9', kind: 'list' },
        });

        const body = JSON.parse(calls[1].options.body);
        assert.strictEqual(body.list_id, 'list_9');
        assert.strictEqual(body.campaign, undefined);
    } finally {
        restore();
    }
});

test('a lead with no email is skipped rather than pushed', async () => {
    const { calls, restore } = stubFetch([{ status: 200, body: { result: { name: 'Ada Lovelace' } } }]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY,
            type: 'lead_full_name_to_email',
            input: 'Ada Lovelace Tesla',
            destination: 'instantly',
            credentials: { apiKey: 'k' },
            target: { id: 'c1' },
        });

        assert.strictEqual(out.pushed.length, 0);
        assert.match(out.skipped[0].reason, /no email/);
        assert.strictEqual(calls.length, 1, 'should not have called the destination');
    } finally {
        restore();
    }
});

test('a lookup that found nothing is reported as charged, not as an error', async () => {
    const { restore } = stubFetch([{ status: 200, body: { status: 'success', result: null } }]);
    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: 'Nobody',
            destination: 'instantly', credentials: { apiKey: 'k' }, target: { id: 'c1' },
        });
        assert.match(out.skipped[0].reason, /still charged/);
        assert.strictEqual(out.failed.length, 0);
    } finally {
        restore();
    }
});

test('one rejected lead does not abandon the rest of the batch', async () => {
    const { restore } = stubFetch([
        { status: 200, body: { result: { name: 'Ada L', email: 'ada@tesla.com' } } },
        { status: 400, body: { message: 'duplicate lead' } },
        { status: 200, body: { result: { name: 'Alan T', email: 'alan@tesla.com' } } },
        { status: 200, body: { id: 'lead_2' } },
    ]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: ['Ada L Tesla', 'Alan T Tesla'],
            destination: 'instantly', credentials: { apiKey: 'k' }, target: { id: 'c1' },
        });

        assert.strictEqual(out.failed.length, 1);
        assert.match(out.failed[0].error, /duplicate lead/);
        assert.strictEqual(out.pushed.length, 1);
        assert.strictEqual(out.pushed[0].lead.email, 'alan@tesla.com');
    } finally {
        restore();
    }
});

test('an unresolved job is reported so it can be polled, not re-run and paid for twice', async () => {
    const { restore } = stubFetch([
        { status: 202, body: { status: 'processing', job_id: 'job_7', poll_url: 'https://api.linkfinderai.com/status/job_7' } },
        ...Array.from({ length: 20 }, () => ({ status: 200, body: { status: 'processing' } })),
    ]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'linkedin_profile_to_linkedin_info', input: 'https://li/ada',
            destination: 'instantly', credentials: { apiKey: 'k' }, target: { id: 'c1' },
            params: { maxWaitMs: 3000 },
        });

        assert.strictEqual(out.pending.length, 1);
        assert.strictEqual(out.pending[0].jobId, 'job_7');
    } finally {
        restore();
    }
});

test('a 401 from the destination says it is the key, not the payload', async () => {
    const { restore } = stubFetch([
        { status: 200, body: { result: { name: 'Ada L', email: 'ada@tesla.com' } } },
        { status: 401, body: {} },
    ]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: 'Ada L Tesla',
            destination: 'smartlead', credentials: { apiKey: 'k' }, target: { id: 'c1' },
        });
        assert.match(out.failed[0].error, /authentication failed/);
    } finally {
        restore();
    }
});

test('destinations needing extra credentials say which one is missing', async () => {
    await assert.rejects(
        () => enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: 'Ada',
            destination: 'activecampaign', credentials: { apiKey: 'k' }, target: { id: '1' },
        }),
        /ActiveCampaign needs "baseUrl"/,
    );
});

test('a dry run enriches but never calls the destination', async () => {
    const { calls, restore } = stubFetch([{ status: 200, body: { result: { name: 'Ada L', email: 'ada@tesla.com' } } }]);
    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: 'Ada L Tesla',
            destination: 'lemlist', credentials: { apiKey: 'k' }, target: { id: 'c1' }, dryRun: true,
        });
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(out.pushed[0].dryRun, true);
    } finally {
        restore();
    }
});

test('a provider error dressed as a successful result is not treated as a lead', async () => {
    // Observed live: leads_finder_ai answered 200 / status "success" with an Apify
    // permissions error as its only result. Pushing that into a campaign would put a
    // stack trace where a person should be.
    const { calls, restore } = stubFetch([
        { status: 200, body: { status: 'success', result: [{ error: { message: '403 - full-permission-actor-not-approved', status: 403 } }] } },
    ]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'leads_finder_ai', input: 'VP Sales',
            destination: 'instantly', credentials: { apiKey: 'k' }, target: { id: 'c1' },
        });

        assert.strictEqual(out.pushed.length, 0);
        assert.strictEqual(calls.length, 1, 'should not have called the destination');
        assert.match(out.failed[0].error, /provider error/);
        assert.match(out.failed[0].error, /credits were still spent/);
    } finally {
        restore();
    }
});

test('a 422 on the Instagram type is retried with the documented alternative', async () => {
    const { calls, restore } = stubFetch([
        { status: 422, body: { message: 'unknown type' } },
        { status: 200, body: { status: 'success', result: { name: 'NASA', email: 'press@nasa.gov' } } },
        { status: 200, body: { id: 'lead_1' } },
    ]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'instagram_lookup', input: '@nasa',
            destination: 'instantly', credentials: { apiKey: 'k' }, target: { id: 'c1' },
            params: { altType: 'instagram_profile_to_instagram_info' },
        });

        assert.strictEqual(JSON.parse(calls[0].options.body).type, 'instagram_lookup');
        assert.strictEqual(JSON.parse(calls[1].options.body).type, 'instagram_profile_to_instagram_info');
        assert.strictEqual(out.pushed.length, 1);
    } finally {
        restore();
    }
});

test('firstName and lastName from the API beat splitting the full name', () => {
    // Live employee results carry both, and splitting "Sebastian Robles Garcia" on the
    // last space would get the surname wrong.
    const lead = toLead({ name: 'Sebastian Robles Garcia', firstName: 'Sebastian', lastName: 'Robles Garcia', email: 'a@b.com' });
    assert.strictEqual(lead.firstName, 'Sebastian');
    assert.strictEqual(lead.lastName, 'Robles Garcia');
});

test('the API returning empty strings for missing fields reads as missing, not as data', () => {
    // Live profile results use "" rather than null for absent email and phone.
    const lead = toLead({ name: 'Bill Gates', email: '', mobileNumber: '', jobTitle: 'Co-chair' });
    assert.strictEqual(lead.email, undefined);
    assert.strictEqual(lead.phone, undefined);
    assert.strictEqual(lead.jobTitle, 'Co-chair');
});

test('Clay takes the webhook URL as its target and gets a flat payload', async () => {
    const { calls, restore } = stubFetch([
        { status: 200, body: { result: { name: 'Ada L', email: 'ada@tesla.com', headline: 'VP Eng' } } },
        { status: 200, body: { ok: true } },
    ]);

    try {
        await enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: 'Ada L Tesla',
            destination: 'clay', credentials: {}, target: { id: 'https://api.clay.com/v3/sources/webhook/abc' },
        });

        const body = JSON.parse(calls[1].options.body);
        assert.strictEqual(calls[1].url, 'https://api.clay.com/v3/sources/webhook/abc');
        assert.strictEqual(body.email, 'ada@tesla.com');
        assert.strictEqual(body.raw, undefined, 'nested raw would become an unusable Clay column');
        assert.ok(Object.values(body).every((v) => typeof v !== 'object' || v === null));
    } finally {
        restore();
    }
});

test('Clay rejects a bare id, since it needs the whole webhook URL', async () => {
    const { restore } = stubFetch([{ status: 200, body: { result: { name: 'Ada', email: 'a@b.com' } } }]);
    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: 'Ada Tesla',
            destination: 'clay', credentials: {}, target: { id: 'table_123' },
        });
        assert.match(out.failed[0].error, /webhook URL/);
    } finally {
        restore();
    }
});

test('JustCall gates on a phone number rather than an email', async () => {
    const { calls, restore } = stubFetch([
        { status: 200, body: { result: { name: 'Ada L', mobileNumber: '+15551234567' } } },
        { status: 200, body: { id: 'contact_1' } },
    ]);

    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'linkedin_profile_to_phone', input: 'https://li/ada',
            destination: 'justcall', credentials: { apiKey: 'k', apiSecret: 's' }, target: {},
        });

        assert.strictEqual(out.pushed.length, 1, 'a lead with a phone but no email is still usable to a dialler');
        assert.strictEqual(JSON.parse(calls[1].options.body).phone, '+15551234567');
        assert.strictEqual(calls[1].options.headers.Authorization, 'k:s');
    } finally {
        restore();
    }
});

test('JustCall skips a lead with no phone, and says why', async () => {
    const { restore } = stubFetch([{ status: 200, body: { result: { name: 'Ada L', email: 'ada@tesla.com' } } }]);
    try {
        const out = await enrichAndPush({
            apiKey: KEY, type: 'lead_full_name_to_email', input: 'Ada L Tesla',
            destination: 'justcall', credentials: { apiKey: 'k', apiSecret: 's' }, target: {},
        });
        assert.match(out.skipped[0].reason, /nothing to dial/);
    } finally {
        restore();
    }
});
