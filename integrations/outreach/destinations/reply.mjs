import { send } from './_http.mjs';

/** Reply.io. One endpoint both creates the person and pushes them into the campaign. */
export const reply = {
    id: 'reply',
    label: 'Reply.io',
    auth: 'api_key',
    docs: 'https://apidocs.reply.io',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        return send('Reply.io', 'https://api.reply.io/v1/actions/addandpushtocampaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': credentials.apiKey },
            body: JSON.stringify({
                campaignId: Number(target.id),
                email: lead.email,
                firstName: lead.firstName,
                lastName: lead.lastName,
                company: lead.company,
                title: lead.jobTitle,
                phone: lead.phone,
                linkedInProfile: lead.linkedinUrl,
                city: lead.location,
            }),
        });
    },
};
