import { send } from './_http.mjs';

/**
 * Woodpecker. Basic auth with the API key as the username, and prospects are added in
 * a list even when there is one.
 */
export const woodpecker = {
    id: 'woodpecker',
    label: 'Woodpecker',
    auth: 'api_key',
    docs: 'https://woodpecker.co/api',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        const auth = btoa(`${credentials.apiKey}:X`);

        return send('Woodpecker', 'https://api.woodpecker.co/rest/v1/add_prospects_campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
            body: JSON.stringify({
                campaign: { campaign_id: Number(target.id) },
                prospects: [
                    {
                        email: lead.email,
                        first_name: lead.firstName,
                        last_name: lead.lastName,
                        company: lead.company,
                        title: lead.jobTitle,
                        phone: lead.phone,
                        linkedin_url: lead.linkedinUrl,
                        website: lead.companyWebsite,
                        city: lead.location,
                    },
                ],
            }),
        });
    },
};
