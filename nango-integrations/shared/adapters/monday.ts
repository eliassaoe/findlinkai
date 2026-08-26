import type { CrmAdapter } from '../crm.js';

/**
 * monday.com is the odd one out: everything is a board item reached over GraphQL, so
 * there is no contact endpoint and no account endpoint — both are items, and "fields"
 * are board columns addressed by column id (`text_1`, `link_4`), not by the label
 * shown in the UI. Those ids differ per board, so the defaults below are only a
 * starting point; the real column ids have to be passed in.
 *
 * Writing needs the board id as well as the item id, so the read fetches it and the
 * adapter caches it between the two calls of a single action run.
 */
const boardIdByItem = new Map<string, string>();

async function graphql(nango: any, query: string, variables: Record<string, unknown>) {
    const response = await nango.post({ endpoint: '/v2', data: { query, variables }, retries: 3 });

    // monday answers 200 with an `errors` array rather than an HTTP error code, so a
    // failed mutation is invisible unless it is checked for explicitly.
    if (response.data?.errors?.length) {
        throw new Error(`monday.com API error: ${response.data.errors.map((e: any) => e.message).join('; ')}`);
    }
    return response.data?.data;
}

function board(label: string, defaults: CrmAdapter['contact']['defaults']) {
    return {
        label,
        defaults,
        async read(nango: any, id: string, _fields: string[]) {
            const data = await graphql(
                nango,
                `query ($ids: [ID!]) {
                    items (ids: $ids) {
                        id
                        name
                        board { id }
                        column_values { id text }
                    }
                }`,
                { ids: [id] },
            );

            const item = data?.items?.[0];
            if (!item) return null;

            if (item.board?.id) boardIdByItem.set(id, String(item.board.id));

            // Flatten columns to the same name->value map every other adapter returns,
            // plus `name` so the shared name fallback works here too.
            const fields: Record<string, string | undefined> = { name: item.name };
            for (const column of item.column_values ?? []) {
                fields[column.id] = column.text ?? undefined;
            }
            return fields;
        },

        async write(nango: any, id: string, patch: Record<string, string>) {
            const boardId = boardIdByItem.get(id);
            if (!boardId) {
                throw new Error(`No monday.com board id known for item ${id}. Read the item before writing to it.`);
            }

            await graphql(
                nango,
                `mutation ($itemId: ID!, $boardId: ID!, $values: JSON!) {
                    change_multiple_column_values (item_id: $itemId, board_id: $boardId, column_values: $values) {
                        id
                    }
                }`,
                // column_values is a JSON *string*, not an object — monday rejects it otherwise.
                { itemId: id, boardId, values: JSON.stringify(patch) },
            );
        },
    };
}

export const monday: CrmAdapter = {
    id: 'monday',
    label: 'monday.com',
    scopes: ['boards:read', 'boards:write'],

    contact: board('contact item', {
        linkedinUrlField: 'linkedin_url',
        nameField: 'name',
        targetField: 'linkfinder_ai_data',
    }),

    company: board('account item', {
        linkedinUrlField: 'linkedin_url',
        nameField: 'name',
        domainField: 'website',
        targetField: 'linkfinder_ai_data',
    }),
};
