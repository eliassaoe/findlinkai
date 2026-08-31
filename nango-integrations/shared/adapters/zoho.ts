import type { CrmAdapter } from '../crm.js';

/**
 * Zoho puts records in a `data` array on both read and write — a single-record update
 * is still `{ data: [ { ...fields } ] }` — and rejects a bare field map.
 */
function module_(name: string, label: string, defaults: CrmAdapter['contact']['defaults']) {
    return {
        label,
        defaults,
        async read(nango: any, id: string, fields: string[]) {
            const response = await nango.get({
                endpoint: `/crm/v2/${name}/${id}`,
                params: { fields: fields.join(',') },
                retries: 3,
            });
            return response.data?.data?.[0] ?? null;
        },
        async write(nango: any, id: string, patch: Record<string, string>) {
            await nango.put({ endpoint: `/crm/v2/${name}/${id}`, data: { data: [patch] }, retries: 3 });
        },
    };
}

export const zoho: CrmAdapter = {
    id: 'zoho',
    label: 'Zoho CRM',
    scopes: ['ZohoCRM.modules.ALL'],

    contact: module_('Contacts', 'contact', {
        // Zoho names custom fields in Title_Case with underscores.
        linkedinUrlField: 'LinkedIn_URL',
        nameField: 'Full_Name',
        targetField: 'LinkFinder_AI_Data',
    }),

    company: module_('Accounts', 'account', {
        linkedinUrlField: 'LinkedIn_URL',
        nameField: 'Account_Name',
        domainField: 'Website',
        targetField: 'LinkFinder_AI_Data',
    }),
};
