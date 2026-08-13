import { z } from 'zod';
import { createAction } from 'nango';
import { checkLinkFinderJob, buildHubspotProperties, LinkFinderError } from '../linkfinder-client.js';

const InputSchema = z.object({
    apiKey: z.string().describe('Your LinkFinder AI API key.'),
    jobId: z.string().optional().describe('Job ID returned by enrich-company / enrich-contact when processing=true.'),
    pollUrl: z.string().optional().describe('Poll URL returned alongside jobId. Provide either this or jobId.'),
    objectType: z.enum(['company', 'contact']).optional().describe('Write the result back onto this HubSpot object type once the job resolves.'),
    objectId: z.string().optional().describe('HubSpot object ID to write the result onto. Required when objectType is set.'),
    targetProperty: z
        .string()
        .default('linkfinder_ai_data')
        .describe('HubSpot property (must already exist) to store the raw LinkFinder AI JSON result in.'),
    propertyMap: z.record(z.string(), z.string()).optional().describe('Optional map of LinkFinder AI result keys to HubSpot property names.')
});

const OutputSchema = z.object({
    processing: z.boolean(),
    result: z.record(z.string(), z.unknown()).nullable(),
    updatedProperties: z.array(z.string())
});

const action = createAction({
    description:
        "Checks the status of an async LinkFinder AI job (e.g. from linkedin_profile_to_linkedin_info) and, once it resolves, optionally writes the result onto a HubSpot company or contact. Call this once from a HubSpot workflow's Delay loop until processing=false — mirrors LinkFinder AI's documented poll pattern.",
    version: '1.0.0',

    input: InputSchema,
    output: OutputSchema,
    scopes: ['crm.objects.companies.write', 'crm.objects.contacts.write'],

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        if (!input.jobId && !input.pollUrl) {
            throw new nango.ActionError({ type: 'invalid_request', message: 'Provide either jobId or pollUrl.' });
        }
        if (input.objectType && !input.objectId) {
            throw new nango.ActionError({ type: 'invalid_request', message: 'objectId is required when objectType is set.' });
        }

        let outcome;
        try {
            outcome = await checkLinkFinderJob(input.apiKey, { jobId: input.jobId, pollUrl: input.pollUrl });
        } catch (err) {
            if (err instanceof LinkFinderError) {
                throw new nango.ActionError({ type: err.code, message: err.message });
            }
            throw err;
        }

        const updatedProperties: string[] = [];

        if (outcome.resolved && outcome.result && input.objectType && input.objectId) {
            const built = buildHubspotProperties(outcome.result as Record<string, unknown>, input.targetProperty, input.propertyMap);
            updatedProperties.push(...built.updatedProperties);

            const objectPath = input.objectType === 'company' ? 'companies' : 'contacts';
            await nango.patch({
                endpoint: `/crm/v3/objects/${objectPath}/${input.objectId}`,
                data: { properties: built.properties },
                retries: 3
            });

            await nango.log(
                `LinkFinder AI job resolved; wrote ${updatedProperties.length} propert${updatedProperties.length === 1 ? 'y' : 'ies'} onto ${input.objectType} ${input.objectId}.`
            );
        }

        return {
            processing: !outcome.resolved,
            result: (outcome.result as Record<string, unknown> | null) ?? null,
            updatedProperties
        };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
