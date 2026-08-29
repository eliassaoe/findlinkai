import { send } from './_http.mjs';

/**
 * JustCall. A dialler rather than an email tool, so it is the one destination where a
 * phone number matters more than an email — `enrichAndPush` should be called with
 * `requireEmail: false` for it, typically after a `linkedin_profile_to_phone` lookup.
 *
 * Authenticates with `key:secret` as the Authorization header, not a bearer token.
 */
export const justcall = {
    id: 'justcall',
    label: 'JustCall',
    auth: 'api_key',
    docs: 'https://developer.justcall.io',
    targetLabel: 'Contact list ID (optional)',
    extraCredentials: ['apiSecret'],
    prefers: 'phone',

    async addLead({ credentials, target, lead }) {
        if (!lead.phone) {
            throw new Error('JustCall is a dialler — this lead has no phone number, so there is nothing to dial.');
        }

        return send('JustCall', 'https://api.justcall.io/v2.1/sales_dialer/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `${credentials.apiKey}:${credentials.apiSecret}`,
            },
            body: JSON.stringify({
                firstname: lead.firstName,
                lastname: lead.lastName,
                phone: lead.phone,
                email: lead.email,
                company: lead.company,
                ...(target?.id ? { list_id: target.id } : {}),
            }),
        });
    },
};
