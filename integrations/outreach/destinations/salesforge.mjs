import { send } from './_http.mjs';

/**
 * Salesforge. Contacts live under a workspace, so the workspace id is part of the path
 * and comes from the credentials rather than the target.
 */
export const salesforge = {
    id: 'salesforge',
    label: 'Salesforge',
    auth: 'api_key',
    docs: 'https://api.salesforge.ai/docs',
    targetLabel: 'Sequence ID',
    extraCredentials: ['workspaceId'],

    async addLead({ credentials, target, lead }) {
        if (!credentials.workspaceId) throw new Error('Salesforge needs a workspaceId.');

        const url = `https://api.salesforge.ai/public/v2/workspaces/${encodeURIComponent(credentials.workspaceId)}/contacts`;

        return send('Salesforge', url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` },
            body: JSON.stringify({
                email: lead.email,
                firstName: lead.firstName,
                lastName: lead.lastName,
                companyName: lead.company,
                jobTitle: lead.jobTitle,
                phone: lead.phone,
                linkedinUrl: lead.linkedinUrl,
                sequenceId: target.id,
            }),
        });
    },
};
