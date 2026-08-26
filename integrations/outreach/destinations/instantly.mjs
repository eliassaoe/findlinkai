import { send } from './_http.mjs';

/**
 * Instantly (v2).
 *
 * Field names confirmed against Instantly's own endpoint spec: `email`, `first_name`,
 * `last_name`, `company_name`, `phone`, `website`.
 *
 * The campaign field is the one thing to confirm on a first live run — Instantly's v2
 * body documents it as `campaign`, while its tooling exposes it as `campaign_id`. A
 * lead can go to a campaign or to a plain list, and needs exactly one of them.
 */
export const instantly = {
    id: 'instantly',
    label: 'Instantly',
    auth: 'api_key',
    docs: 'https://developer.instantly.ai/api/v2',
    targetLabel: 'Campaign or list ID',

    async addLead({ credentials, target, lead }) {
        const body = {
            email: lead.email,
            first_name: lead.firstName,
            last_name: lead.lastName,
            company_name: lead.company,
            phone: lead.phone,
            website: lead.companyWebsite,
            // Instantly merges these into the email body as {{variables}} — which is
            // the point of enriching before pushing rather than after.
            custom_variables: {
                job_title: lead.jobTitle,
                linkedin_url: lead.linkedinUrl,
                location: lead.location,
            },
            ...(target.kind === 'list' ? { list_id: target.id } : { campaign: target.id }),
        };

        return send('Instantly', 'https://api.instantly.ai/api/v2/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` },
            body: JSON.stringify(body),
        });
    },
};
