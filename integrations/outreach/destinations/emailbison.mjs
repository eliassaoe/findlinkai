import { send } from './_http.mjs';

/**
 * EmailBison. White-label and usually self-hosted, so there is no fixed hostname —
 * the instance URL is part of the credentials.
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

        return send('EmailBison', `${base}/api/campaigns/${encodeURIComponent(target.id)}/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` },
            body: JSON.stringify({
                leads: [
                    {
                        email: lead.email,
                        first_name: lead.firstName,
                        last_name: lead.lastName,
                        company: lead.company,
                        job_title: lead.jobTitle,
                        phone: lead.phone,
                        linkedin_url: lead.linkedinUrl,
                    },
                ],
            }),
        });
    },
};
