import { send } from './_http.mjs';

/**
 * Smartlead. Authenticates with the API key as a query parameter rather than a header,
 * and takes leads in batches even when there is only one.
 */
export const smartlead = {
    id: 'smartlead',
    label: 'Smartlead',
    auth: 'api_key',
    docs: 'https://api.smartlead.ai/reference',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        const url = `https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(target.id)}/leads?api_key=${encodeURIComponent(credentials.apiKey)}`;

        return send('Smartlead', url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_list: [
                    {
                        email: lead.email,
                        first_name: lead.firstName,
                        last_name: lead.lastName,
                        company_name: lead.company,
                        phone_number: lead.phone,
                        website: lead.companyWebsite,
                        linkedin_profile: lead.linkedinUrl,
                        location: lead.location,
                        custom_fields: { job_title: lead.jobTitle },
                    },
                ],
            }),
        });
    },
};
