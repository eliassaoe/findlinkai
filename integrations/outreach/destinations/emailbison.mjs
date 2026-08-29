import { send } from './_http.mjs';

/**
 * EmailBison. White-label and usually self-hosted, so there is no fixed hostname —
 * the instance URL is part of the credentials.
 *
 * There is no single "create and attach" endpoint: a lead is created on its own
 * (`POST /api/leads`), then attached to the campaign by id
 * (`POST /api/campaigns/{id}/leads/attach-leads`, body `{lead_ids: [...]}`), per
 * EmailBison's docs. Two calls, not one.
 */
export const emailbison = {
    id: 'emailbison',
    label: 'EmailBison',
    auth: 'api_key',
    docs: 'https://docs.emailbison.com',
    targetLabel: 'Campaign ID',
    extraCredentials: ['baseUrl'],

    async addLead({ credentials, target, lead }) {
        if (!credentials.baseUrl) {
            throw new Error('EmailBison is self-hosted, so it needs the instance base URL, e.g. https://mail.yourdomain.com');
        }

        const base = credentials.baseUrl.replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` };

        const created = await send('EmailBison', `${base}/api/leads`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email: lead.email,
                first_name: lead.firstName,
                last_name: lead.lastName,
                company: lead.company,
                custom_variables: {
                    job_title: lead.jobTitle,
                    phone: lead.phone,
                    linkedin_url: lead.linkedinUrl,
                },
            }),
        });

        const leadId = created?.data?.id ?? created?.id;
        if (!leadId) throw new Error('EmailBison accepted the lead but returned no id.');

        await send('EmailBison', `${base}/api/campaigns/${encodeURIComponent(target.id)}/leads/attach-leads`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ lead_ids: [leadId] }),
        });

        return { leadId, campaignId: target.id };
    },
};
