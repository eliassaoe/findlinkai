import type { CrmAdapter } from '../crm.js';

/**
 * Close's endpoints keep their trailing slash — dropping it redirects — and custom
 * fields are addressed as `custom.<field_id>`, so a result field must be passed in
 * that form rather than by its display name.
 *
 * Close models a company as a "lead", with contacts hanging off it.
 */
function entity(path: string, label: string, defaults: CrmAdapter['contact']['defaults']) {
    return {
        label,
        defaults,
        async read(nango: any, id: string, _fields: string[]) {
            const response = await nango.get({ endpoint: `/api/v1/${path}/${id}/`, retries: 3 });
            return response.data ?? null;
        },
        async write(nango: any, id: string, patch: Record<string, string>) {
            await nango.put({ endpoint: `/api/v1/${path}/${id}/`, data: patch, retries: 3 });
        },
    };
}

export const close: CrmAdapter = {
    id: 'close',
    label: 'Close',
    // Close authenticates with an API key, so there are no OAuth scopes to request.
    scopes: [],

    contact: entity('contact', 'contact', {
        linkedinUrlField: 'custom.linkedin_url',
        nameField: 'name',
        targetField: 'custom.linkfinder_ai_data',
    }),

    company: entity('lead', 'lead', {
        linkedinUrlField: 'custom.linkedin_url',
        nameField: 'name',
        domainField: 'url',
        targetField: 'custom.linkfinder_ai_data',
    }),
};
