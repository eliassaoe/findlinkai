import { send } from './_http.mjs';

/**
 * Salesloft. Create the person, then add them to a cadence. Endpoints keep the `.json`
 * suffix, and the create body is form-encoded rather than JSON.
 */
export const salesloft = {
    id: 'salesloft',
    label: 'Salesloft',
    auth: 'oauth',
    docs: 'https://developers.salesloft.com',
    targetLabel: 'Cadence ID',

    async addLead({ credentials, target, lead }) {
        const token = credentials.accessToken ?? credentials.apiKey;

        const form = new URLSearchParams();
        const set = (key, value) => value && form.set(key, String(value));
        set('email_address', lead.email);
        set('first_name', lead.firstName);
        set('last_name', lead.lastName);
        set('title', lead.jobTitle);
        set('phone', lead.phone);
        set('linkedin_url', lead.linkedinUrl);
        set('city', lead.location);

        const person = await send('Salesloft', 'https://api.salesloft.com/v2/people.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` },
            body: form,
        });

        const personId = person?.data?.id;
        if (!personId) throw new Error('Salesloft accepted the person but returned no id.');

        await send('Salesloft', 'https://api.salesloft.com/v2/cadence_memberships.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ person_id: personId, cadence_id: Number(target.id) }),
        });

        return { personId, cadenceId: target.id };
    },
};
