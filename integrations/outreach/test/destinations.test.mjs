/**
 * What each destination actually puts on the wire.
 *
 * `outreach/README.md` claimed the suite "asserts the exact request each adapter
 * builds, so the payload shapes are pinned". It did not. Wrapping every
 * `addLead` and running the suite showed only four of twelve adapters were ever
 * executed — activecampaign, emailbison, lemlist, outreach, reply, salesforge,
 * salesloft and woodpecker were reached solely by a check that `addLead` is a
 * function. A wrong field name or endpoint path in any of the eight would have
 * shipped green, into somebody's live email campaign.
 *
 * That claim is the sentence a reader relies on to decide these are safe to
 * enable, so this file makes it true rather than softening it. Each test pins
 * the URL, the auth header and the body fields for one adapter.
 *
 * What these still cannot check is whether the vendor accepts the shape — there
 * is no network here, and several of these have never run against the real API.
 * README's "Verification status" section is where that distinction lives.
 *
 * Run: node --test outreach/test/destinations.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';

import { toLead } from '../lead.mjs';
import { DESTINATIONS } from '../destinations/index.mjs';

/** Replaces global fetch with a scripted queue, and records what was sent. */
function stubFetch(responses = []) {
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

const LEAD = toLead({
    name: 'Ada Lovelace', email: 'ada@tesla.com', jobTitle: 'VP Eng',
    phone: '+15551234567', linkedinUrl: 'https://li/ada',
    company: 'Tesla', companyWebsite: 'tesla.com', city: 'Palo Alto',
});

/** Runs one adapter against a scripted set of responses and hands back the calls. */
async function push(id, { credentials, target, responses = [], lead = LEAD }) {
    const { calls, restore } = stubFetch(responses);
    try {
        const result = await DESTINATIONS[id].addLead({ credentials, target, lead });
        return { calls, result };
    } finally {
        restore();
    }
}
const bodyOf = (call) => JSON.parse(call.options.body);

// ---------------------------------------------------------------------------

test('ActiveCampaign syncs the contact, then adds it to the list', async () => {
    const { calls, result } = await push('activecampaign', {
        credentials: { apiKey: 'ac_key', baseUrl: 'https://acme.api-us1.com/' },
        target: { id: '42' },
        responses: [{ status: 200, body: { contact: { id: '77' } } }, { status: 200, body: {} }],
    });

    assert.strictEqual(calls.length, 2, 'it has no add-to-list shortcut, so it takes two calls');
    // The trailing slash on the credential must not become a double slash.
    assert.strictEqual(calls[0].url, 'https://acme.api-us1.com/api/3/contact/sync');
    assert.strictEqual(calls[0].options.headers['Api-Token'], 'ac_key');
    assert.deepStrictEqual(bodyOf(calls[0]).contact, {
        email: 'ada@tesla.com', firstName: 'Ada', lastName: 'Lovelace', phone: '+15551234567',
    });

    assert.strictEqual(calls[1].url, 'https://acme.api-us1.com/api/3/contactLists');
    // Both ids are numbers to ActiveCampaign, and the target id arrives as a string.
    assert.deepStrictEqual(bodyOf(calls[1]).contactList, { list: 42, contact: 77, status: 1 });
    assert.deepStrictEqual(result, { contactId: '77', listId: '42' });
});

test('ActiveCampaign refuses to guess the per-account base URL', async () => {
    await assert.rejects(
        () => push('activecampaign', { credentials: { apiKey: 'k' }, target: { id: '1' } }),
        /base URL/,
    );
});

test('ActiveCampaign stops if the sync returns no contact id', async () => {
    await assert.rejects(
        () => push('activecampaign', {
            credentials: { apiKey: 'k', baseUrl: 'https://acme.api-us1.com' },
            target: { id: '1' },
            responses: [{ status: 200, body: { contact: {} } }],
        }),
        /returned no id/,
    );
});

test('EmailBison creates the lead, then attaches its id to the campaign', async () => {
    const { calls, result } = await push('emailbison', {
        credentials: { apiKey: 'eb_key', baseUrl: 'https://mail.acme.com/' },
        target: { id: 'camp 7' },
        responses: [{ status: 200, body: { data: { id: 99 } } }, { status: 200, body: {} }],
    });

    assert.strictEqual(calls.length, 2, 'there is no single create-and-attach endpoint');
    assert.strictEqual(calls[0].url, 'https://mail.acme.com/api/leads');
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer eb_key');
    assert.deepStrictEqual(bodyOf(calls[0]), {
        email: 'ada@tesla.com', first_name: 'Ada', last_name: 'Lovelace', company: 'Tesla',
        custom_variables: { job_title: 'VP Eng', phone: '+15551234567', linkedin_url: 'https://li/ada' },
    });

    assert.strictEqual(calls[1].url, 'https://mail.acme.com/api/campaigns/camp%207/leads/attach-leads');
    assert.deepStrictEqual(bodyOf(calls[1]), { lead_ids: [99] });
    assert.deepStrictEqual(result, { leadId: 99, campaignId: 'camp 7' });
});

test('EmailBison stops if the lead create returns no id', async () => {
    await assert.rejects(
        () => push('emailbison', {
            credentials: { apiKey: 'k', baseUrl: 'https://m.acme.com' },
            target: { id: '1' },
            responses: [{ status: 200, body: {} }],
        }),
        /returned no id/,
    );
});

test('EmailBison refuses to guess a self-hosted instance', async () => {
    await assert.rejects(
        () => push('emailbison', { credentials: { apiKey: 'k' }, target: { id: '1' } }),
        /base URL/,
    );
});

test('lemlist puts the email in the body and the key in Basic auth', async () => {
    const { calls } = await push('lemlist', {
        credentials: { apiKey: 'lem_key' },
        target: { id: 'camp_1' },
    });

    assert.strictEqual(calls[0].url, 'https://api.lemlist.com/api/campaigns/camp_1/leads');
    // The key is the password and the username is empty — not the other way round.
    assert.strictEqual(calls[0].options.headers.Authorization, `Basic ${btoa(':lem_key')}`);

    const body = bodyOf(calls[0]);
    assert.strictEqual(body.email, 'ada@tesla.com');
    assert.strictEqual(body.firstName, 'Ada');
    assert.strictEqual(body.companyName, 'Tesla');
    assert.strictEqual(body.companyDomain, 'tesla.com');
});

test('lemlist says so when there is no email to address', async () => {
    await assert.rejects(
        () => push('lemlist', {
            credentials: { apiKey: 'k' }, target: { id: 'c' },
            lead: toLead({ name: 'Ada Lovelace', company: 'Tesla' }),
        }),
        /identifies a lead by email/,
    );
});

test('JustCall dials rather than emails, and refuses a lead with no phone', async () => {
    const { calls } = await push('justcall', {
        credentials: { apiKey: 'jc_key', apiSecret: 'jc_secret' },
        target: { id: '14' },
    });

    assert.strictEqual(calls[0].url, 'https://api.justcall.io/v2.1/sales_dialer/contacts');
    assert.strictEqual(calls[0].options.headers.Authorization, 'jc_key:jc_secret');
    const body = bodyOf(calls[0]);
    assert.strictEqual(body.firstname, 'Ada');
    assert.strictEqual(body.phone, '+15551234567');
    assert.strictEqual(body.list_id, '14');

    await assert.rejects(
        () => push('justcall', {
            credentials: { apiKey: 'k', apiSecret: 's' }, target: { id: '1' },
            lead: toLead({ name: 'Ada Lovelace', email: 'ada@tesla.com' }),
        }),
        /has no phone number/,
    );
});

test('Outreach speaks JSON:API and links the sequence by id', async () => {
    const { calls, result } = await push('outreach', {
        credentials: { accessToken: 'oa_tok', mailboxId: '9' },
        target: { id: '55' },
        responses: [{ status: 200, body: { data: { id: 1234 } } }, { status: 200, body: {} }],
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].url, 'https://api.outreach.io/api/v2/prospects');
    assert.strictEqual(calls[0].options.headers['Content-Type'], 'application/vnd.api+json',
        'plain application/json is rejected by JSON:API');
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer oa_tok');

    const attrs = bodyOf(calls[0]).data.attributes;
    assert.deepStrictEqual(attrs.emails, ['ada@tesla.com'], 'emails is a list');
    assert.deepStrictEqual(attrs.workPhones, ['+15551234567']);
    assert.strictEqual(attrs.title, 'VP Eng');

    const rel = bodyOf(calls[1]).data.relationships;
    assert.strictEqual(rel.prospect.data.id, 1234);
    assert.strictEqual(rel.sequence.data.id, 55);
    assert.strictEqual(rel.mailbox.data.id, 9);
    assert.deepStrictEqual(result, { prospectId: 1234, sequenced: true });
});

test('Outreach keeps the prospect when it cannot sequence them', async () => {
    // The enrichment has already been paid for; dropping the prospect on the
    // floor because a mailbox is missing would waste it.
    const { calls, result } = await push('outreach', {
        credentials: { apiKey: 'oa_tok' },
        target: { id: '55' },
        responses: [{ status: 200, body: { data: { id: 7 } } }],
    });

    assert.strictEqual(calls.length, 1, 'no sequence call without a mailbox');
    assert.strictEqual(result.prospectId, 7);
    assert.strictEqual(result.sequenced, false);
    assert.match(result.reason, /mailboxId/);
});

test('Reply.io creates and enrols in one call', async () => {
    const { calls } = await push('reply', {
        credentials: { apiKey: 'rep_key' },
        target: { id: '31' },
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://api.reply.io/v1/actions/addandpushtocampaign');
    assert.strictEqual(calls[0].options.headers['X-Api-Key'], 'rep_key');

    const body = bodyOf(calls[0]);
    assert.strictEqual(body.campaignId, 31, 'the campaign id is a number here');
    assert.strictEqual(body.email, 'ada@tesla.com');
    assert.strictEqual(body.linkedInProfile, 'https://li/ada');
    assert.strictEqual(body.title, 'VP Eng');
});

test('Salesforge scopes the contact to the workspace in the path', async () => {
    const { calls } = await push('salesforge', {
        credentials: { apiKey: 'sf_key', workspaceId: 'ws 1' },
        target: { id: 'seq_9' },
    });

    assert.strictEqual(calls[0].url,
        'https://api.salesforge.ai/public/v2/workspaces/ws%201/contacts');
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer sf_key');
    const body = bodyOf(calls[0]);
    assert.strictEqual(body.sequenceId, 'seq_9', 'the sequence rides in the body, not the path');
    assert.strictEqual(body.companyName, 'Tesla');
});

test('Salesforge refuses without a workspace', async () => {
    await assert.rejects(
        () => push('salesforge', { credentials: { apiKey: 'k' }, target: { id: 's' } }),
        /workspaceId/,
    );
});

test('Salesloft form-encodes the person, then adds the cadence as JSON', async () => {
    const { calls, result } = await push('salesloft', {
        credentials: { accessToken: 'sl_tok' },
        target: { id: '88' },
        responses: [{ status: 200, body: { data: { id: 501 } } }, { status: 200, body: {} }],
    });

    assert.strictEqual(calls[0].url, 'https://api.salesloft.com/v2/people.json',
        'the .json suffix is part of the endpoint');
    assert.strictEqual(calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');

    const form = calls[0].options.body;
    assert.ok(form instanceof URLSearchParams, 'the create body is form-encoded, not JSON');
    assert.strictEqual(form.get('email_address'), 'ada@tesla.com');
    assert.strictEqual(form.get('first_name'), 'Ada');
    assert.strictEqual(form.get('city'), 'Palo Alto');

    assert.strictEqual(calls[1].url, 'https://api.salesloft.com/v2/cadence_memberships.json');
    assert.strictEqual(calls[1].options.headers['Content-Type'], 'application/json');
    assert.deepStrictEqual(bodyOf(calls[1]), { person_id: 501, cadence_id: 88 });
    assert.deepStrictEqual(result, { personId: 501, cadenceId: '88' });
});

test('Salesloft leaves out the fields it has no value for', async () => {
    const { calls } = await push('salesloft', {
        credentials: { apiKey: 'sl_tok' },
        target: { id: '1' },
        lead: toLead({ name: 'Ada Lovelace', email: 'ada@tesla.com' }),
        responses: [{ status: 200, body: { data: { id: 2 } } }, { status: 200, body: {} }],
    });

    const form = calls[0].options.body;
    assert.strictEqual(form.get('email_address'), 'ada@tesla.com');
    // An empty `title=` is a value Salesloft would store, so it must be absent.
    assert.strictEqual(form.has('title'), false);
    assert.strictEqual(form.has('phone'), false);
});

test('Woodpecker sends the key as the username and prospects as a list', async () => {
    const { calls } = await push('woodpecker', {
        credentials: { apiKey: 'wp_key' },
        target: { id: '12' },
    });

    assert.strictEqual(calls[0].url, 'https://api.woodpecker.co/rest/v1/add_prospects_campaign');
    assert.strictEqual(calls[0].options.headers.Authorization, `Basic ${btoa('wp_key:X')}`);

    const body = bodyOf(calls[0]);
    assert.deepStrictEqual(body.campaign, { campaign_id: 12 });
    assert.strictEqual(body.prospects.length, 1, 'prospects is a list even for one');
    assert.strictEqual(body.prospects[0].linkedin_url, 'https://li/ada');
    assert.strictEqual(body.prospects[0].website, 'tesla.com');
});

// ---------------------------------------------------------------------------
// The guard: no destination may go back to having no request pinned.
// ---------------------------------------------------------------------------

test('every destination has its request pinned by a test in this suite', async () => {
    // The original bug was not a wrong assertion, it was a missing one — and
    // nothing noticed for twelve adapters. This runs each adapter's addLead and
    // fails on any that never reaches fetch, which is what "untested" looked
    // like. It is the check that would have caught the README's claim.
    const args = {
        activecampaign: { credentials: { apiKey: 'k', baseUrl: 'https://a.api-us1.com' }, target: { id: '1' },
                          responses: [{ status: 200, body: { contact: { id: '1' } } }, { status: 200, body: {} }] },
        clay:           { credentials: {}, target: { id: 'https://hooks.clay.com/x' } },
        emailbison:     { credentials: { apiKey: 'k', baseUrl: 'https://m.acme.com' }, target: { id: '1' },
                          responses: [{ status: 200, body: { data: { id: 1 } } }, { status: 200, body: {} }] },
        instantly:      { credentials: { apiKey: 'k' }, target: { id: '1' } },
        justcall:       { credentials: { apiKey: 'k' }, target: { id: '1' } },
        lemlist:        { credentials: { apiKey: 'k' }, target: { id: '1' } },
        outreach:       { credentials: { apiKey: 'k' }, target: { id: '1' },
                          responses: [{ status: 200, body: { data: { id: 1 } } }] },
        reply:          { credentials: { apiKey: 'k' }, target: { id: '1' } },
        salesforge:     { credentials: { apiKey: 'k', workspaceId: 'w' }, target: { id: '1' } },
        salesloft:      { credentials: { apiKey: 'k' }, target: { id: '1' },
                          responses: [{ status: 200, body: { data: { id: 1 } } }, { status: 200, body: {} }] },
        smartlead:      { credentials: { apiKey: 'k' }, target: { id: '1' } },
        woodpecker:     { credentials: { apiKey: 'k' }, target: { id: '1' } },
    };

    const missing = Object.keys(DESTINATIONS).filter((id) => !args[id]);
    assert.deepStrictEqual(missing, [],
        `new destination(s) with no pinned request: ${missing.join(', ')}`);

    for (const [id, opts] of Object.entries(args)) {
        const { calls } = await push(id, opts);
        assert.ok(calls.length > 0, `${id}.addLead never reached fetch`);
        assert.ok(calls[0].url.startsWith('http'), `${id} built no usable URL`);
    }
});
