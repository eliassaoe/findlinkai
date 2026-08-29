/**
 * Enrich, then push into a cold-outreach tool.
 *
 * This is the whole point of the outreach integrations: a lead with no email cannot be
 * emailed, so the enrichment has to happen *before* the push, not after. Everything
 * here is about not wasting that enrichment — credits are spent the moment the lookup
 * runs, whether or not the destination accepts what comes back.
 */
import { enrich } from './linkfinder.mjs';
import { toLeads } from './lead.mjs';
import { checkDestination } from './push-leads.mjs';

/**
 * @param {object} options
 * @param {string} options.apiKey            LinkFinder AI API key.
 * @param {string} options.type              Enrichment type, e.g. 'lead_full_name_to_email'.
 * @param {string|string[]} options.input    One input, or many to enrich in turn.
 * @param {string} options.destination       Destination id, e.g. 'instantly'.
 * @param {object} options.credentials       Destination credentials.
 * @param {object} options.target            `{ id, kind }` — the campaign, list or sequence.
 * @param {boolean} [options.requireEmail]   Skip leads with no email. On by default.
 * @param {boolean} [options.dryRun]         Enrich and normalise, but do not push.
 * @param {object} [options.params]          Extra request params, e.g. `{ employee_count: 50 }`.
 */
export async function enrichAndPush({
    apiKey,
    type,
    input,
    destination: destinationId,
    credentials,
    target,
    requireEmail = true,
    dryRun = false,
    params = {},
}) {
    // JustCall can create a contact without a list, so its target is optional —
    // checkDestination knows that from the destination's own targetLabel.
    const destination = checkDestination(destinationId, { credentials, target, dryRun });

    const inputs = Array.isArray(input) ? input : [input];

    const results = {
        destination: destination.id,
        pushed: [],
        skipped: [],
        failed: [],
        pending: [],
    };

    for (const one of inputs) {
        let outcome;
        try {
            outcome = await enrich(apiKey, type, one, params);
        } catch (error) {
            results.failed.push({ input: one, stage: 'enrich', error: error.message });
            continue;
        }

        if (!outcome.resolved) {
            // The credits are already spent and the job is still running. Report it so
            // the caller can poll rather than re-running the same lookup and paying twice.
            results.pending.push({ input: one, jobId: outcome.jobId, pollUrl: outcome.pollUrl });
            continue;
        }

        if (outcome.result === null || outcome.result === undefined) {
            results.skipped.push({ input: one, reason: 'LinkFinder AI found nothing (the call was still charged)' });
            continue;
        }

        for (const lead of toLeads(outcome.result, { fullName: one })) {
            // A dialler needs a phone, not an email — asking it for an email address
            // would skip every lead that is actually usable.
            const needs = destination.prefers === 'phone' ? 'phone' : 'email';
            if (requireEmail && !lead[needs]) {
                results.skipped.push({
                    input: one,
                    lead,
                    reason: needs === 'phone'
                        ? 'no phone number, so there is nothing to dial'
                        : 'no email address, so there is nothing to send to',
                });
                continue;
            }

            if (dryRun) {
                results.pushed.push({ input: one, lead, dryRun: true });
                continue;
            }

            try {
                const response = await destination.addLead({ credentials, target, lead });
                results.pushed.push({ input: one, lead, response });
            } catch (error) {
                // One rejected lead must not abandon the rest of the batch — every
                // lead past this point has already been paid for.
                results.failed.push({ input: one, lead, stage: 'push', error: error.message });
            }
        }
    }

    return results;
}
