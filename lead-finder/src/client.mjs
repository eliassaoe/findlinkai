/**
 * The one place that talks to LinkFinder AI.
 *
 * Everything else in the pipeline takes a `client` object with a single `enrich` method,
 * so the whole run is testable without a network. This module is that interface over the
 * real API — the retry, polling and error handling all come from the shared client the
 * outreach integrations already use.
 */
import { enrich as apiEnrich } from '../../integrations/outreach/linkfinder.mjs';

export function createClient(apiKey, { maxWaitMs = 55000 } = {}) {
    if (!apiKey) throw new Error('Set LINKFINDER_API_KEY (your key is on the API & MCP tab).');
    return {
        async enrich(type, input, params = {}) {
            return apiEnrich(apiKey, type, input, { maxWaitMs, ...params });
        },
    };
}
