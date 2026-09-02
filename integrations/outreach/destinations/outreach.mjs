import { send } from './_http.mjs';

/**
 * Outreach. JSON:API — everything is wrapped in `data.type`/`data.attributes`, and the
 * content type is `application/vnd.api+json` rather than plain JSON.
 *
 * Two calls: create the prospect, then add them to the sequence. The second needs a
 * mailbox to send from, which is an Outreach-side setting rather than anything
 * LinkFinder knows.
 */
export const outreach = {
    id: 'outreach',
    label: 'Outreach',
    auth: 'oauth',
    docs: 'https://developers.outreach.io/api/reference',
    targetLabel: 'Sequence ID',
    extraCredentials: ['mailboxId'],

    async addLead({ credentials, target, lead }) {
        const headers = {
            'Content-Type': 'application/vnd.api+json',
            Authorization: `Bearer ${credentials.accessToken ?? credentials.apiKey}`,
        };

        const prospect = await send('Outreach', 'https://api.outreach.io/api/v2/prospects', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                data: {
                    type: 'prospect',
                    attributes: {
                        emails: lead.email ? [lead.email] : [],
                        firstName: lead.firstName,
                        lastName: lead.lastName,
                        company: lead.company,
                        title: lead.jobTitle,
                        workPhones: lead.phone ? [lead.phone] : [],
                        linkedInUrl: lead.linkedinUrl,
                    },
                },
            }),
        });

        const prospectId = prospect?.data?.id;
        if (!prospectId) throw new Error('Outreach accepted the prospect but returned no id.');

        if (!credentials.mailboxId) {
            // The prospect exists and is worth reporting even though the sequence add
            // could not run — losing it silently would waste the enrichment credits.
            return { prospectId, sequenced: false, reason: 'no mailboxId given, so the prospect was not sequenced' };
        }

        await send('Outreach', 'https://api.outreach.io/api/v2/sequenceStates', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                data: {
                    type: 'sequenceState',
                    relationships: {
                        prospect: { data: { type: 'prospect', id: Number(prospectId) } },
                        sequence: { data: { type: 'sequence', id: Number(target.id) } },
                        mailbox: { data: { type: 'mailbox', id: Number(credentials.mailboxId) } },
                    },
                },
            }),
        });

        return { prospectId, sequenced: true };
    },
};
