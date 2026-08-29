import { send } from './_http.mjs';

/**
 * lemlist. Authenticates with HTTP Basic where the key is the *password* and the
 * username is empty. The v1 API addressed the lead by email in the URL path; the
 * current API (`POST /api/campaigns/{campaignId}/leads`, per developer.lemlist.com)
 * takes the email in the body instead.
 */
export const lemlist = {
    id: 'lemlist',
    label: 'lemlist',
    auth: 'api_key',
    docs: 'https://developer.lemlist.com',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        if (!lead.email) throw new Error('lemlist identifies a lead by email, and this one has none.');

        const auth = btoa(`:${credentials.apiKey}`);
        const url = `https://api.lemlist.com/api/campaigns/${encodeURIComponent(target.id)}/leads`;

        return send('lemlist', url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
            body: JSON.stringify({
                email: lead.email,
                firstName: lead.firstName,
                lastName: lead.lastName,
                companyName: lead.company,
                phone: lead.phone,
                linkedinUrl: lead.linkedinUrl,
                jobTitle: lead.jobTitle,
                companyDomain: lead.companyWebsite,
            }),
        });
    },
};
