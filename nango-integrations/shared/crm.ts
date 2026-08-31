/**
 * One enrichment action, five CRMs.
 *
 * Enriching a record is the same three steps everywhere: read a field off the record
 * to look up, ask LinkFinder AI about it, write what comes back onto the record. What
 * differs is only how each CRM spells "read a field" and "write a field" — Salesforce
 * PATCHes a bare body, Zoho wraps everything in `data[0]`, monday speaks GraphQL.
 *
 * So that difference is all an adapter is, and `makeEnrichAction` builds the action
 * around it. Adding a CRM means describing its two request shapes, not copying an
 * action and editing the endpoints — which is how the field defaults, the async job
 * handling and the error messages stay identical across all of them.
 *
 * Not an action file itself: only scripts under actions/ and syncs/ are Nango
 * entrypoints, and this deliberately is not one.
 */
import { z } from 'zod';
import { callLinkFinderAI, checkLinkFinderJob, buildPropertyPatch, LinkFinderError } from './linkfinder-client.js';

/** Nango's script context. Typed loosely here because each CRM's client shape differs. */
type Nango = any;

export interface CrmObjectAdapter {
    /** What this object is called in the CRM, for messages: "contact", "account". */
    label: string;
    /**
     * Reads the named fields off one record. Missing fields come back undefined;
     * a record that does not exist comes back null.
     */
    read(nango: Nango, id: string, fields: string[]): Promise<Record<string, string | undefined> | null>;
    /** Writes a flat field patch back onto the record. */
    write(nango: Nango, id: string, patch: Record<string, string>): Promise<void>;
    /** Field names to fall back on when the caller does not name them. */
    defaults: {
        /** Field holding a LinkedIn profile URL (contacts) or company page URL (companies). */
        linkedinUrlField: string;
        /** Field holding the person's or company's name. */
        nameField: string;
        /** Companies only: field holding the web domain. */
        domainField?: string | undefined;
        /** Field the raw JSON result is written to. Must already exist in the CRM. */
        targetField: string;
    };
}

export interface CrmAdapter {
    id: string;
    label: string;
    /** OAuth scopes the action needs. Empty for CRMs authenticated with an API key. */
    scopes: string[];
    contact: CrmObjectAdapter;
    company: CrmObjectAdapter;
}

/**
 * Picks the enrichment to run from whatever the record actually has.
 *
 * A LinkedIn URL is preferred because it is the most precise input the API takes. A
 * company falls back to its domain, then its name; a person falls back to their name
 * (which the API expects joined with their company). Cost differs sharply between
 * these — a LinkedIn profile lookup is 10 credits against 1 for a company name — so
 * the chosen type is always reported back rather than left implicit.
 */
function chooseLookup(
    kind: 'contact' | 'company',
    fields: Record<string, string | undefined>,
    names: { linkedinUrlField: string; nameField: string; domainField?: string | undefined },
): { type: string; inputData: string } | null {
    const linkedinUrl = fields[names.linkedinUrlField];
    const name = fields[names.nameField];
    const domain = names.domainField ? fields[names.domainField] : undefined;

    if (kind === 'contact') {
        if (linkedinUrl) return { type: 'linkedin_profile_to_linkedin_info', inputData: linkedinUrl };
        if (name) return { type: 'lead_full_name_to_linkedin_url', inputData: name };
        return null;
    }

    if (linkedinUrl) return { type: 'linkedin_company_to_linkedin_info', inputData: linkedinUrl };
    if (domain) return { type: 'company_domain_to_employees', inputData: domain };
    if (name) return { type: 'company_name_to_website', inputData: name };
    return null;
}

/**
 * The input/output contract for an enrich action, specialised to one CRM and object.
 *
 * Nango's CLI requires each script's default export to be a literal `createAction()`
 * call, so an action cannot be returned from a factory. This returns the parts each
 * action file assembles instead — which keeps the twenty-odd field descriptions in
 * one place even though the call itself is repeated.
 */
export function enrichContract(adapter: CrmAdapter, kind: 'contact' | 'company') {
    const object = adapter[kind];
    const d = object.defaults;

    const InputSchema = z.object({
        recordId: z.string().describe(`${adapter.label} ${object.label} ID to enrich.`),
        apiKey: z.string().describe('Your LinkFinder AI API key (dashboard -> Settings -> API Key).'),
        type: z
            .string()
            .optional()
            .describe(
                'LinkFinder AI enrichment type. Defaults to the best fit for the fields the record has. ' +
                    'Costs vary from 1 to 50 credits by type — see linkfinderai.com/api-documentation.',
            ),
        inputData: z.string().optional().describe('Overrides the value sent to LinkFinder AI.'),
        linkedinUrlField: z
            .string()
            .default(d.linkedinUrlField)
            .describe(`${adapter.label} field (must already exist) holding the LinkedIn URL.`),
        nameField: z.string().default(d.nameField).describe(`${adapter.label} field holding the name.`),
        ...(d.domainField ? { domainField: z.string().default(d.domainField).describe(`${adapter.label} field holding the web domain.`) } : {}),
        maxWaitSeconds: z
            .number()
            .int()
            .min(1)
            .max(60)
            .default(25)
            .describe('How long to wait for an async job before returning processing=true.'),
        targetField: z
            .string()
            .default(d.targetField)
            .describe(`${adapter.label} field (must already exist) to store the raw LinkFinder AI JSON in.`),
        propertyMap: z
            .record(z.string(), z.string())
            .optional()
            .describe(`Optional map of LinkFinder AI result keys to ${adapter.label} field names.`),
        overwrite: z
            .boolean()
            .default(false)
            .describe(
                'Whether to overwrite fields that already have a value. Off by default: enrichment fills gaps, ' +
                    'it does not replace what a person entered.',
            ),
    });

    const OutputSchema = z.object({
        recordId: z.string(),
        crm: z.string(),
        object: z.string(),
        type: z.string(),
        inputData: z.string(),
        processing: z.boolean(),
        jobId: z.string().optional(),
        pollUrl: z.string().optional(),
        result: z.unknown().nullable(),
        updatedFields: z.array(z.string()),
        skippedFields: z.array(z.string()),
    });

    const description =
        `Enriches a ${adapter.label} ${object.label} using LinkFinder AI and writes the result back onto the record. ` +
        'Only fills empty fields unless overwrite is set.';

    const exec = async (nango: Nango, input: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> => {
            const names = {
                linkedinUrlField: input.linkedinUrlField,
                nameField: input.nameField,
                domainField: (input as Record<string, unknown>)['domainField'] as string | undefined,
            };

            const wanted = [names.linkedinUrlField, names.nameField, names.domainField, input.targetField].filter(
                (f): f is string => Boolean(f),
            );

            const fields = await object.read(nango, input.recordId, wanted);
            if (!fields) {
                throw new nango.ActionError({
                    type: 'not_found',
                    message: `${object.label} not found in ${adapter.label}.`,
                    recordId: input.recordId,
                });
            }

            const chosen =
                input.type && input.inputData
                    ? { type: input.type, inputData: input.inputData }
                    : chooseLookup(kind, fields, names);

            if (!chosen) {
                throw new nango.ActionError({
                    type: 'missing_input',
                    message:
                        `Nothing on this ${object.label} to look up. Fill in "${names.linkedinUrlField}" or ` +
                        `"${names.nameField}", or pass type and inputData explicitly.`,
                });
            }

            const type = input.type ?? chosen.type;
            const inputData = input.inputData ?? chosen.inputData;

            let outcome;
            try {
                outcome = await callLinkFinderAI(input.apiKey, type, inputData, input.maxWaitSeconds * 1000);
            } catch (err) {
                if (err instanceof LinkFinderError) {
                    throw new nango.ActionError({ type: err.code, message: err.message });
                }
                throw err;
            }

            if (!outcome.resolved) {
                await nango.log(
                    `LinkFinder AI is still processing ${adapter.label} ${object.label} ${input.recordId} ` +
                        `(job ${outcome.jobId}); call check-linkfinder-job to finish it.`,
                );
                return {
                    recordId: input.recordId,
                    crm: adapter.id,
                    object: object.label,
                    type,
                    inputData,
                    processing: true,
                    jobId: outcome.jobId,
                    pollUrl: outcome.pollUrl,
                    result: null,
                    updatedFields: [],
                    skippedFields: [],
                };
            }

            const updatedFields: string[] = [];
            const skippedFields: string[] = [];

            if (outcome.result) {
                const built = buildPropertyPatch(
                    outcome.result as Record<string, unknown>,
                    input.targetField,
                    input.propertyMap,
                );

                // Enrichment fills gaps. Overwriting a value someone typed in is the
                // fastest way to lose a team's trust in an automatic sync, so a field
                // that already has content is skipped and reported rather than replaced.
                const patch: Record<string, string> = {};
                for (const [field, value] of Object.entries(built.properties)) {
                    const existing = fields[field];
                    if (!input.overwrite && existing !== undefined && existing !== null && String(existing).trim() !== '') {
                        skippedFields.push(field);
                        continue;
                    }
                    patch[field] = value;
                    updatedFields.push(field);
                }

                if (Object.keys(patch).length > 0) {
                    await object.write(nango, input.recordId, patch);
                }

                await nango.log(
                    `LinkFinder AI enriched ${adapter.label} ${object.label} ${input.recordId} via ${type}: ` +
                        `wrote ${updatedFields.length}, left ${skippedFields.length} already-filled field(s) alone.`,
                );
            } else {
                // A lookup that found nothing still cost credits. Say so, so a run over
                // a large list does not look like it silently did nothing.
                await nango.log(`LinkFinder AI found nothing for ${inputData} via ${type}. The call was still charged.`);
            }

            return {
                recordId: input.recordId,
                crm: adapter.id,
                object: object.label,
                type,
                inputData,
                processing: false,
                result: outcome.result ?? null,
                updatedFields,
                skippedFields,
            };
    };

    return { InputSchema, OutputSchema, description, exec, scopes: adapter.scopes };
}

/**
 * Finishes an enrichment that was still running when the enrich action stopped waiting.
 *
 * The enrich actions poll for a bounded window and then hand back `processing: true`
 * with a job id rather than blocking a workflow indefinitely. This is the other half:
 * poll that job once, and write the result onto the record if it is ready. Pair it
 * with a delay in the calling workflow and call it again while it reports processing.
 */
export function checkJobContract(adapter: CrmAdapter) {
    const InputSchema = z.object({
        recordId: z.string().describe(`${adapter.label} record ID the job was started for.`),
        object: z.enum(['contact', 'company']).describe('Which object the record is.'),
        apiKey: z.string().describe('Your LinkFinder AI API key.'),
        jobId: z.string().optional().describe('job_id returned by the enrich action.'),
        pollUrl: z.string().optional().describe('poll_url returned by the enrich action. Wins over jobId.'),
        targetField: z.string().optional().describe('Field to store the raw JSON result in. Defaults per object.'),
        propertyMap: z.record(z.string(), z.string()).optional().describe('Map of result keys to CRM field names.'),
        overwrite: z.boolean().default(false).describe('Whether to overwrite fields that already have a value.'),
    });

    const OutputSchema = z.object({
        recordId: z.string(),
        crm: z.string(),
        processing: z.boolean(),
        jobId: z.string().optional(),
        pollUrl: z.string().optional(),
        result: z.unknown().nullable(),
        updatedFields: z.array(z.string()),
        skippedFields: z.array(z.string()),
    });

    const description = `Polls a LinkFinder AI job started by a ${adapter.label} enrich action and writes the result once it is ready.`;

    const exec = async (nango: Nango, input: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> => {
            const object = adapter[input.object];
            const targetField = input.targetField ?? object.defaults.targetField;

            let outcome;
            try {
                outcome = await checkLinkFinderJob(input.apiKey, { jobId: input.jobId, pollUrl: input.pollUrl });
            } catch (err) {
                if (err instanceof LinkFinderError) {
                    throw new nango.ActionError({ type: err.code, message: err.message });
                }
                throw err;
            }

            if (!outcome.resolved || !outcome.result) {
                return {
                    recordId: input.recordId,
                    crm: adapter.id,
                    processing: !outcome.resolved,
                    jobId: outcome.jobId,
                    pollUrl: outcome.pollUrl,
                    result: outcome.result ?? null,
                    updatedFields: [],
                    skippedFields: [],
                };
            }

            const built = buildPropertyPatch(outcome.result as Record<string, unknown>, targetField, input.propertyMap);

            // Re-read before writing: the job may have been running for minutes, and a
            // person could have filled one of these fields in the meantime.
            const existing = (await object.read(nango, input.recordId, Object.keys(built.properties))) ?? {};

            const patch: Record<string, string> = {};
            const updatedFields: string[] = [];
            const skippedFields: string[] = [];

            for (const [field, value] of Object.entries(built.properties)) {
                const current = existing[field];
                if (!input.overwrite && current !== undefined && current !== null && String(current).trim() !== '') {
                    skippedFields.push(field);
                    continue;
                }
                patch[field] = value;
                updatedFields.push(field);
            }

            if (Object.keys(patch).length > 0) {
                await object.write(nango, input.recordId, patch);
            }

            await nango.log(
                `LinkFinder AI job finished for ${adapter.label} ${input.recordId}: wrote ${updatedFields.length}, ` +
                    `left ${skippedFields.length} already-filled field(s) alone.`,
            );

            return {
                recordId: input.recordId,
                crm: adapter.id,
                processing: false,
                result: outcome.result,
                updatedFields,
                skippedFields,
            };
    };

    return { InputSchema, OutputSchema, description, exec, scopes: adapter.scopes };
}
