/**
 * Push already-enriched leads into a cold-outreach tool.
 *
 * `push.mjs`'s `enrichAndPush` calls LinkFinder AI itself, which is right for a
 * script or a worker that owns the whole flow. A backend serving the product's own
 * UI is in a different position: the user has already paid for and is looking at an
 * enrichment result (a bulk run on screen, a CSV, a history row), so re-running the
 * lookup here to "own" the flow would charge them a second time for data they
 * already have. This module is the push half only — it takes `{ input, result }`
 * pairs the caller already has and never calls LinkFinder AI.
 */
import { getDestination } from './destinations/index.mjs';
import { toLeads } from './lead.mjs';

/** Validates a destination has what it needs before anything is spent reaching it. */
export function checkDestination(destinationId, { credentials, target, dryRun = false } = {}) {
    const destination = getDestination(destinationId);

    const targetOptional = destination.targetLabel.includes('optional');
    if (!dryRun && !targetOptional && !target?.id) {
        throw new Error(`${destination.label} needs a target — ${destination.targetLabel.toLowerCase()}.`);
    }
    for (const field of destination.extraCredentials ?? []) {
        if (!credentials?.[field]) {
            throw new Error(`${destination.label} needs "${field}" in its credentials.`);
        }
    }
    return destination;
}

/**
 * @param {object} options
 * @param {string} options.destination        Destination id, e.g. 'instantly'.
 * @param {object} options.credentials         Destination credentials.
 * @param {object} options.target              `{ id, kind }` — the campaign, list or sequence.
 * @param {{input: string, result: unknown}[]} options.results  Already-enriched pairs.
 * @param {boolean} [options.requireEmail]     Skip leads with no email. On by default.
 * @param {boolean} [options.dryRun]           Normalise, but do not push.
 */
export async function pushLeads({
    destination: destinationId,
    credentials,
    target,
    results: enriched,
    requireEmail = true,
    dryRun = false,
}) {
    const destination = checkDestination(destinationId, { credentials, target, dryRun });

    const results = { destination: destination.id, pushed: [], skipped: [], failed: [] };

    for (const item of enriched) {
        const input = item?.input ?? '';
        const value = item?.result;

        if (value === null || value === undefined || value === '') {
            results.skipped.push({ input, reason: 'LinkFinder AI found nothing (the call was still charged)' });
            continue;
        }

        for (const lead of toLeads(value, { fullName: input })) {
            // A dialler needs a phone, not an email — asking it for an email address
            // would skip every lead that is actually usable.
            const needs = destination.prefers === 'phone' ? 'phone' : 'email';
            if (requireEmail && !lead[needs]) {
                results.skipped.push({
                    input, lead,
                    reason: needs === 'phone'
                        ? 'no phone number, so there is nothing to dial'
                        : 'no email address, so there is nothing to send to',
                });
                continue;
            }

            if (dryRun) {
                results.pushed.push({ input, lead, dryRun: true });
                continue;
            }

            try {
                const response = await destination.addLead({ credentials, target, lead });
                results.pushed.push({ input, lead, response });
            } catch (error) {
                // One rejected lead must not abandon the rest of the batch — every
                // lead past this point has already been paid for.
                results.failed.push({ input, lead, stage: 'push', error: error.message });
            }
        }
    }

    return results;
}
