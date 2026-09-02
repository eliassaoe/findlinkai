import type { CrmAdapter } from '../crm.js';

// Salesforce's REST API is versioned in the path. Pinned rather than floating so an
// org upgrade cannot change field behaviour under a running integration.
const API = '/services/data/v59.0/sobjects';

function sobject(name: string, label: string, defaults: CrmAdapter['contact']['defaults']) {
    return {
        label,
        defaults,
        async read(nango: any, id: string, fields: string[]) {
            const response = await nango.get({
                endpoint: `${API}/${name}/${id}`,
                params: { fields: fields.join(',') },
                retries: 3,
            });
            return response.data ?? null;
        },
        async write(nango: any, id: string, patch: Record<string, string>) {
            // Salesforce takes the field map as the bare body and answers 204 with no
            // content, so there is nothing to read back.
            await nango.patch({ endpoint: `${API}/${name}/${id}`, data: patch, retries: 3 });
        },
    };
}

export const salesforce: CrmAdapter = {
    id: 'salesforce',
    label: 'Salesforce',
    // `api` for the REST calls, `refresh_token` so Nango can keep the connection alive.
    scopes: ['api', 'refresh_token'],

    // LinkedIn URL and the result blob are custom fields — Salesforce has no standard
    // field for either, so both must be created in the org before this runs. The `__c`
    // suffix is Salesforce's own marker for a custom field, not a typo.
    contact: sobject('Contact', 'contact', {
        linkedinUrlField: 'LinkedIn_URL__c',
        nameField: 'Name',
        targetField: 'LinkFinder_AI_Data__c',
    }),

    company: sobject('Account', 'account', {
        linkedinUrlField: 'LinkedIn_URL__c',
        nameField: 'Name',
        domainField: 'Website',
        targetField: 'LinkFinder_AI_Data__c',
    }),
};
