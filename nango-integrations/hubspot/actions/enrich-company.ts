import { z } from 'zod';
import { createAction } from 'nango';
import { callLinkFinderAI, buildHubspotProperties, LinkFinderError } from '../linkfinder-client.js';

const InputSchema = z.object({
    companyId: z.string().describe('HubSpot company object ID to enrich. Example: "123456789"'),
    apiKey: z.string().describe('Your LinkFinder AI API key (dashboard -> Settings -> API Key).'),
    type: z
        .enum(['company_name_to_website', 'company_domain_to_employees'])
        .optional()
        .describe(
            'LinkFinder AI enrichment type. Defaults to company_domain_to_employees when the HubSpot company has a domain, otherwise company_name_to_website.'
        ),
    inputData: z.string().optional().describe("Overrides the value sent to LinkFinder AI. Defaults to the company's HubSpot domain or name."),
    maxWaitSeconds: z
        .number()
        .int()
        .min(1)
        .max(60)
        .default(20)
        .describe('How long to wait for an async LinkFinder AI job before returning processing=true.'),
    targetProperty: z
        .string()
        .default('linkfinder_ai_data')
        .describe('HubSpot company property (must already exist) to store the raw LinkFinder AI JSON result in.'),
    propertyMap: z
        .record(z.string(), z.string())
        .optional()
        .describe('Optional map of LinkFinder AI result keys to HubSpot company property names, e.g. { "employee_count": "numberofemployees" }.')
});

const OutputSchema = z.object({
    companyId: z.string(),
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
        'Enriches a HubSpot company using LinkFinder AI (company_name_to_website / company_domain_to_employees) and writes the JSON result onto the company record.',
    version: '1.0.0',

    input: InputSchema,
    output: OutputSchema,
    scopes: ['crm.objects.companies.read', 'crm.objects.companies.write'],

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const company = await nango.get({
            endpoint: `/crm/v3/objects/companies/${input.companyId}`,
            params: { properties: 'name,domain' },
            retries: 3
        });

        if (!company.data) {
            throw new nango.ActionError({ type: 'not_found', message: 'Company not found in HubSpot.', companyId: input.companyId });
        }

        const domain: string | undefined = company.data.properties?.['domain'] || undefined;
        const name: string | undefined = company.data.properties?.['name'] || undefined;

        const type = input.type ?? (domain ? 'company_domain_to_employees' : 'company_name_to_website');
        const lookupValue = input.inputData ?? (type === 'company_domain_to_employees' ? domain : name) ?? domain ?? name;

        if (!lookupValue) {
            throw new nango.ActionError({
                type: 'missing_input',
                message: 'The HubSpot company has no domain or name, and no inputData override was provided.'
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
                endpoint: `/crm/v3/objects/companies/${input.companyId}`,
                data: { properties: built.properties },
                retries: 3
            });

            await nango.log(
                `LinkFinder AI enriched company ${input.companyId} via ${type}; wrote ${updatedProperties.length} propert${updatedProperties.length === 1 ? 'y' : 'ies'}.`
            );
        } else if (!outcome.resolved) {
            await nango.log(`LinkFinder AI is still processing company ${input.companyId} (job ${outcome.jobId}); call check-linkfinder-job to finish it.`);
        }

        return {
            companyId: input.companyId,
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
