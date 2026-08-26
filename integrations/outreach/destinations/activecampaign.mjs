import { send } from './_http.mjs';

/**
 * ActiveCampaign. Two calls rather than one: it has no "add to list" shortcut on
 * contact creation, so the contact is synced first and then added to the list.
 *
 * The base URL is per-account (`https://<account>.api-us1.com`), so it comes from the
 * credentials rather than being fixed here.
 */
export const activecampaign = {
    id: 'activecampaign',
    label: 'ActiveCampaign',
    auth: 'api_key',
    docs: 'https://developers.activecampaign.com/reference',
    targetLabel: 'List ID',
    extraCredentials: ['baseUrl'],

    async addLead({ credentials, target, lead }) {
        if (!credentials.baseUrl) {
            throw new Error('ActiveCampaign needs the account base URL, e.g. https://youraccount.api-us1.com');
        }

        const base = credentials.baseUrl.replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json', 'Api-Token': credentials.apiKey };

        // `contact/sync` upserts on email, so re-running over the same list does not
        // create duplicates.
        const synced = await send('ActiveCampaign', `${base}/api/3/contact/sync`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                contact: {
                    email: lead.email,
                    firstName: lead.firstName,
                    lastName: lead.lastName,
                    phone: lead.phone,
                },
            }),
        });

        const contactId = synced?.contact?.id;
        if (!contactId) throw new Error('ActiveCampaign accepted the contact but returned no id.');

        // status 1 subscribes; 2 would unsubscribe.
        await send('ActiveCampaign', `${base}/api/3/contactLists`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ contactList: { list: Number(target.id), contact: Number(contactId), status: 1 } }),
        });

        return { contactId, listId: target.id };
    },
};
