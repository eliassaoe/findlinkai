import { z } from 'zod';
import { createSync } from 'nango';
import { callLinkFinderAI, buildHubspotProperties, LinkFinderError } from '../linkfinder-client.js';

/*
 * Stage 3 of the CRM product: keep it clean automatically.
 *
 * The two actions in ../actions/ enrich ONE record when something calls them -
 * they need the customer to wire up a HubSpot workflow themselves. This sync is
 * the version that needs no wiring: it watches the portal and enriches records
 * that are missing data, including every new row as it arrives.
 *
 * Idempotency comes from HubSpot rather than from local state. The search below
 * asks only for contacts where the target property is NOT set, so an enriched
 * contact disappears from the result set permanently. That makes a partial run
 * (timeout, credit exhaustion, a deploy mid-sync) resume exactly where it left
 * off with no bookkeeping, and makes re-enriching the same contact twice - which
 * the customer pays for - structurally impossible rather than merely unlikely.
 */

const Metadata = z.object({
    apiKey: z.string().describe('LinkFinder AI API key (dashboard -> Settings -> API Key).'),
    type: z
        .string()
        .default('linkedin_profile_to_linkedin_info')
        .describe('LinkFinder AI enrichment type to run against each contact.'),
    linkedinUrlProperty: z
        .string()
        .default('linkedin_url')
        .describe('HubSpot contact property holding the LinkedIn profile URL. Must already exist.'),
    targetProperty: z
        .string()
        .default('linkfinder_ai_data')
        .describe(
            'HubSpot contact property the raw JSON result is written to. Must already exist. This property doubles as the "already enriched" marker, so do not reuse one that is populated by anything else.'
        ),
    propertyMap: z
        .record(z.string(), z.string())
        .optional()
        .describe('Optional map of LinkFinder AI result keys to HubSpot contact property names.'),
    maxContactsPerRun: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe(
            'Ceiling on contacts enriched per run. Bounds both the execution time and the credits a single run can spend; the remainder is picked up next run.'
        ),
    maxWaitSeconds: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(15)
        .describe('How long to wait on an async job before leaving that contact for the next run.')
});

const EnrichedContact = z.object({
    id: z.string(),
    contactId: z.string(),
    type: z.string(),
    inputData: z.string(),
    updatedProperties: z.array(z.string()),
    enrichedAt: z.string()
});

const PAGE_SIZE = 100;

const sync = createSync({
    description:
        'Continuously enriches HubSpot contacts that have a LinkedIn URL but no LinkFinder AI data yet, including every newly created contact. Writes the result back onto the contact.',
    version: '1.0.0',
    frequency: 'every hour',
    autoStart: false,
    syncType: 'incremental',
    trackDeletes: false,
    endpoints: [{ method: 'GET', path: '/linkfinder/enriched-contacts' }],
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
    models: { EnrichedContact },
    metadata: Metadata,

    exec: async (nango) => {
        const config = await nango.getMetadata();

        const {
            apiKey,
            type,
            linkedinUrlProperty,
            targetProperty,
            propertyMap,
            maxContactsPerRun,
            maxWaitSeconds
        } = Metadata.parse(config ?? {});

        let processed = 0;
        let after: string | undefined;
        let outOfCredits = false;
        let stillProcessing = 0;

        while (processed < maxContactsPerRun && !outOfCredits) {
            /*
             * HAS_PROPERTY on the LinkedIn URL and NOT_HAS_PROPERTY on the target
             * is the whole work queue. It is evaluated by HubSpot on every request,
             * so records enriched earlier in THIS run drop out of later pages too -
             * no local seen-set required, and no risk of double-charging a contact
             * because a page boundary shifted underneath us.
             */
            const search = await nango.post({
                endpoint: '/crm/v3/objects/contacts/search',
                data: {
                    filterGroups: [
                        {
                            filters: [
                                { propertyName: linkedinUrlProperty, operator: 'HAS_PROPERTY' },
                                { propertyName: targetProperty, operator: 'NOT_HAS_PROPERTY' }
                            ]
                        }
                    ],
                    properties: ['email', 'firstname', 'lastname', linkedinUrlProperty],
                    limit: Math.min(PAGE_SIZE, maxContactsPerRun - processed),
                    ...(after ? { after } : {})
                },
                retries: 3
            });

            const results: any[] = search.data?.results ?? [];
            if (results.length === 0) break;

            const enriched: z.infer<typeof EnrichedContact>[] = [];

            for (const contact of results) {
                if (processed >= maxContactsPerRun) break;

                const lookupValue: string | undefined = contact.properties?.[linkedinUrlProperty] || undefined;
                if (!lookupValue) continue;

                let outcome;
                try {
                    outcome = await callLinkFinderAI(apiKey, type, lookupValue, maxWaitSeconds * 1000);
                } catch (err) {
                    if (err instanceof LinkFinderError) {
                        /*
                         * Out of credits is not a per-contact failure, it is a
                         * property of the account: every remaining call in this run
                         * would fail identically. Stop the run cleanly and say so
                         * once, rather than emitting one error per contact and
                         * burying the actual cause in noise.
                         */
                        if (err.code === 'insufficient_credits') {
                            outOfCredits = true;
                            await nango.log(
                                `Stopping: the LinkFinder AI account is out of credits after enriching ${processed} contact(s) this run. The rest stay queued and the next run resumes from here.`,
                                { level: 'warn' }
                            );
                            break;
                        }
                        if (err.code === 'unauthorized') {
                            throw new Error(
                                'LinkFinder AI rejected the API key. Update it in this connection\'s metadata and re-run.'
                            );
                        }
                        // Anything else is specific to this record - skip it and keep going.
                        await nango.log(`Skipped contact ${contact.id}: ${err.message}`, { level: 'warn' });
                        processed++;
                        continue;
                    }
                    throw err;
                }

                if (!outcome.resolved || !outcome.result) {
                    /*
                     * Async job still running. Deliberately NOT polled to completion:
                     * a sync that blocks per contact would blow its execution budget
                     * on a large portal. The target property stays unset, so this
                     * contact is simply still in the queue on the next run - the
                     * filter makes retrying free.
                     */
                    stillProcessing++;
                    processed++;
                    continue;
                }

                const built = buildHubspotProperties(
                    outcome.result as Record<string, unknown>,
                    targetProperty,
                    propertyMap
                );

                await nango.patch({
                    endpoint: `/crm/v3/objects/contacts/${contact.id}`,
                    data: { properties: built.properties },
                    retries: 3
                });

                enriched.push({
                    id: contact.id,
                    contactId: contact.id,
                    type,
                    inputData: lookupValue,
                    updatedProperties: built.updatedProperties,
                    enrichedAt: new Date().toISOString()
                });

                processed++;
            }

            if (enriched.length > 0) {
                await nango.batchSave(enriched, 'EnrichedContact');
            }

            after = search.data?.paging?.next?.after;
            if (!after) break;
        }

        if (stillProcessing > 0) {
            await nango.log(
                `${stillProcessing} contact(s) had an enrichment job still running when this run ended. They are picked up automatically next run.`
            );
        }

        await nango.log(
            `Run complete: ${processed} contact(s) examined, ${processed - stillProcessing} enriched.` +
                (outOfCredits ? ' Stopped early - out of credits.' : '')
        );
    }
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
