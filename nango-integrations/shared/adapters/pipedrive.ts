import type { CrmAdapter } from '../crm.js';

/**
 * Pipedrive wraps every response in `data` and takes a flat body on update.
 *
 * Custom fields are addressed by a 40-character hash rather than a readable name, so
 * the defaults below are Pipedrive's built-in fields; a LinkedIn URL or result field
 * will be a custom one and must be passed as its hash key.
 */
function entity(path: string, label: string, defaults: CrmAdapter['contact']['defaults']) {
    return {
        label,
        defaults,
        async read(nango: any, id: string, _fields: string[]) {
            // Pipedrive returns the whole record; there is no field-selection parameter.
            const response = await nango.get({ endpoint: `/v1/${path}/${id}`, retries: 3 });
            return response.data?.data ?? null;
        },
        async write(nango: any, id: string, patch: Record<string, string>) {
            await nango.put({ endpoint: `/v1/${path}/${id}`, data: patch, retries: 3 });
        },
    };
}

export const pipedrive: CrmAdapter = {
    id: 'pipedrive',
    label: 'Pipedrive',
    scopes: ['contacts:full'],

    contact: entity('persons', 'person', {
        linkedinUrlField: 'linkedin_url',
        nameField: 'name',
        targetField: 'linkfinder_ai_data',
    }),

    company: entity('organizations', 'organization', {
        linkedinUrlField: 'linkedin_url',
        nameField: 'name',
        domainField: 'website',
        targetField: 'linkfinder_ai_data',
    }),
};
