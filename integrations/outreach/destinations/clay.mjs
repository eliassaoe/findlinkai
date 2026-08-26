import { send } from './_http.mjs';

/**
 * Clay.
 *
 * The odd one out: Clay pulls rather than receives, so there is no "add a lead" API.
 * What it has is a per-table webhook — a URL Clay generates for a table, which accepts
 * an arbitrary flat JSON object and appends it as a row. So the "campaign id" here is
 * that whole webhook URL, and the payload is flattened rather than mapped, because
 * Clay infers its columns from the keys it receives.
 */
export const clay = {
    id: 'clay',
    label: 'Clay',
    auth: 'webhook',
    docs: 'https://www.clay.com/university/lesson/webhook-sources',
    targetLabel: 'Clay table webhook URL',

    async addLead({ target, lead }) {
        if (!/^https:\/\//.test(target.id)) {
            throw new Error('Clay expects the table\'s webhook URL as the target, not an id.');
        }

        // Flat, because nested objects become unusable columns in Clay. `raw` is
        // dropped for the same reason.
        const { raw, ...flat } = lead;

        return send('Clay', target.id, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flat),
        });
    },
};
