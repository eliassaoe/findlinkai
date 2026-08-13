import { z } from 'zod';
import { createAction } from 'nango';
import { callLinkFinderAI, buildHubspotProperties, LinkFinderError } from '../linkfinder-client.js';

const InputSchema = z.object({
    contactId: z.string().describe('HubSpot contact object ID to enrich. Example: "123456789"'),
    apiKey: z.string().describe('Your LinkFinder AI API key (dashboard -> Settings -> API Key).'),
    type: z
        .string()
        .optional()
        .describe(
            'LinkFinder AI enrichment type, e.g. "linkedin_profile_to_linkedin_info". Defaults to that when the contact has a LinkedIn URL. See your LinkFinder AI API docs for the full list of available types.'
        ),
    inputData: z.string().optional().describe("Overrides the value sent to LinkFinder AI. Defaults to the contact's LinkedIn URL property."),
    linkedinUrlProperty: z
        .string()
        .default('linkedin_url')
        .describe('HubSpot contact property (must already exist) holding the LinkedIn profile URL.'),
    maxWaitSeconds: z
        .number()
        .int()
        .min(1)
        .max(60)
        .default(25)
        .describe('How long to wait for the async job before returning processing=true. linkedin_profile_to_linkedin_info is always async.'),
    targetProperty: z
        .string()
        .default('linkfinder_ai_data')
        .describe('HubSpot contact property (must already exist) to store the raw LinkFinder AI JSON result in.'),
    propertyMap: z
        .record(z.string(), z.string())
        .optional()
        .describe('Optional map of LinkFinder AI result keys to HubSpot contact property names.')
});

const OutputSchema = z.object({
    contactId: z.string(),
    type: z.string(),
    inputData: z.string(),
    processing: z.boolean(),
    jobId: z.string().optional(),
    pollUrl: z.string().optional(),
    result: z.record(z.string(), z.unknown()).nullable(),
    updatedProperties: z.array(z.string())
});

const action = createAction({
    description:
        'Enriches a HubSpot contact using LinkFinder AI (defaults to linkedin_profile_to_linkedin_info) and writes the JSON result onto the contact record.',
    version: '1.0.0',

    input: InputSchema,
    output: OutputSchema,
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const contact = await nango.get({
            endpoint: `/crm/v3/objects/contacts/${input.contactId}`,
            params: { properties: `email,firstname,lastname,${input.linkedinUrlProperty}` },
            retries: 3
        });

        if (!contact.data) {
            throw new nango.ActionError({ type: 'not_found', message: 'Contact not found in HubSpot.', contactId: input.contactId });
        }

        const linkedinUrl: string | undefined = contact.data.properties?.[input.linkedinUrlProperty] || undefined;

        const type = input.type ?? (linkedinUrl ? 'linkedin_profile_to_linkedin_info' : undefined);
        const lookupValue = input.inputData ?? linkedinUrl;

        if (!type || !lookupValue) {
            throw new nango.ActionError({
                type: 'missing_input',
                message: `Could not determine what to send to LinkFinder AI. Pass inputData + type explicitly, or make sure the contact's "${input.linkedinUrlProperty}" property is filled in.`
            });
        }

        let outcome;
        try {
            outcome = await callLinkFinderAI(input.apiKey, type, lookupValue, input.maxWaitSeconds * 1000);
        } catch (err) {
            if (err instanceof LinkFinderError) {
                throw new nango.ActionError({ type: err.code, message: err.message });
            }
            throw err;
        }

        let updatedProperties: string[] = [];

        if (outcome.resolved && outcome.result) {
            const built = buildHubspotProperties(outcome.result as Record<string, unknown>, input.targetProperty, input.propertyMap);
            updatedProperties = built.updatedProperties;

            await nango.patch({
                endpoint: `/crm/v3/objects/contacts/${input.contactId}`,
                data: { properties: built.properties },
                retries: 3
            });

            await nango.log(
                `LinkFinder AI enriched contact ${input.contactId} via ${type}; wrote ${updatedProperties.length} propert${updatedProperties.length === 1 ? 'y' : 'ies'}.`
            );
        } else if (!outcome.resolved) {
            await nango.log(`LinkFinder AI is still processing contact ${input.contactId} (job ${outcome.jobId}); call check-linkfinder-job to finish it.`);
        }

        return {
            contactId: input.contactId,
            type,
            inputData: lookupValue,
            processing: !outcome.resolved,
            jobId: outcome.jobId,
            pollUrl: outcome.pollUrl,
            result: (outcome.result as Record<string, unknown> | null) ?? null,
            updatedProperties
        };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
