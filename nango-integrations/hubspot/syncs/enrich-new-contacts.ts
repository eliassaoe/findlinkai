import { z } from 'zod';
import { createSync } from 'nango';
import { callLinkFinderAI, LinkFinderError } from '../linkfinder-client.js';

/*
 * Stage 2 and 3 of the CRM product: clean what is there, then keep it clean.
 *
 * This is a CRM cleanup, not a CSV enrichment. Nothing is exported, nothing is
 * handed back for re-import - it reads the customer's HubSpot, fills the gaps,
 * and writes the values onto the contacts themselves.
 *
 * It fills EVERY requested field in one pass rather than one field per run, and
 * it chains: a contact with no LinkedIn URL but a known email has the URL looked
 * up first, and the result is then used to find the email, phone and title. That
 * ordering matters commercially as well as technically - the LinkedIn lookup is
 * the cheapest of the four and it unlocks the other three, so a contact that
 * would otherwise be unfillable becomes fillable for 5 credits.
 */

const FIELD = z.enum(['email', 'phone', 'title', 'linkedin']);

const Metadata = z.object({
    apiKey: z.string().describe('LinkFinder AI API key (dashboard -> Settings -> API Key).'),
    fields: z
        .array(FIELD)
        .default(['linkedin', 'email', 'title'])
        .describe(
            'Which gaps to fill. Phone is excluded by default because it costs 50 credits against 5-10 for the others and dominates any bill it appears on.'
        ),
    linkedinUrlProperty: z.string().default('linkedin_url'),
    emailProperty: z.string().default('email'),
    phoneProperty: z.string().default('phone'),
    titleProperty: z.string().default('jobtitle'),
    companyProperty: z.string().default('company'),
    targetProperty: z
        .string()
        .default('linkfinder_ai_data')
        .describe(
            'Raw JSON result, and the "already processed" marker. Do not point this at a property anything else writes to.'
        ),
    maxContactsPerRun: z.number().int().min(1).max(500).default(100),
    maxWaitSeconds: z.number().int().min(1).max(30).default(15)
});

const EnrichedContact = z.object({
    id: z.string(),
    contactId: z.string(),
    fieldsFilled: z.array(z.string()),
    creditsSpent: z.number(),
    enrichedAt: z.string()
});

/* Credit costs, mirroring app.html's live table. */
const COST: Record<string, number> = {
    linkedin_profile_to_email: 10,
    linkedin_profile_to_phone: 50,
    linkedin_profile_to_linkedin_info: 10,
    email_to_linkedin_url: 5,
    lead_full_name_to_linkedin_url: 1,
    lead_full_name_to_email: 7
};

const PAGE_SIZE = 100;

function blank(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    const s = String(v).trim();
    if (!s) return true;
    return ['n/a', 'na', 'none', 'null', 'unknown', '-', '--'].includes(s.toLowerCase());
}

const sync = createSync({
    description:
        'Cleans a HubSpot contact database in place: finds contacts missing an email, phone, job title or LinkedIn URL and fills them from LinkFinder AI, writing the values onto the contact records themselves.',
    version: '2.0.0',
    frequency: 'every hour',
    autoStart: false,
    syncType: 'incremental',
    trackDeletes: false,
    endpoints: [{ method: 'GET', path: '/linkfinder/enriched-contacts' }],
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
    models: { EnrichedContact },
    metadata: Metadata,

    exec: async (nango) => {
        const cfg = Metadata.parse((await nango.getMetadata()) ?? {});
        const {
            apiKey, fields, linkedinUrlProperty, emailProperty, phoneProperty,
            titleProperty, companyProperty, targetProperty, maxContactsPerRun, maxWaitSeconds
        } = cfg;

        let processed = 0;
        let filledTotal = 0;
        let creditsSpent = 0;
        let outOfCredits = false;
        let after: string | undefined;

        const wanted = new Set<string>(fields);

        while (processed < maxContactsPerRun && !outOfCredits) {
            /*
             * The work queue is a HubSpot search, not local state: contacts that
             * do not yet carry the target property. An enriched contact leaves
             * the queue permanently and server-side, so a run that dies halfway
             * resumes exactly where it stopped and the same contact can never be
             * paid for twice.
             */
            const search = await nango.post({
                endpoint: '/crm/v3/objects/contacts/search',
                data: {
                    filterGroups: [{ filters: [{ propertyName: targetProperty, operator: 'NOT_HAS_PROPERTY' }] }],
                    properties: [
                        emailProperty, phoneProperty, titleProperty,
                        companyProperty, linkedinUrlProperty, 'firstname', 'lastname'
                    ],
                    limit: Math.min(PAGE_SIZE, maxContactsPerRun - processed),
                    ...(after ? { after } : {})
                },
                retries: 3
            });

            const results: any[] = search.data?.results ?? [];
            if (results.length === 0) break;

            const saved: z.infer<typeof EnrichedContact>[] = [];

            for (const contact of results) {
                if (processed >= maxContactsPerRun || outOfCredits) break;

                const p = contact.properties ?? {};
                const fullName = [p.firstname, p.lastname].filter(Boolean).join(' ').trim();
                const company = String(p[companyProperty] ?? '').trim();

                let linkedinUrl: string = blank(p[linkedinUrlProperty]) ? '' : String(p[linkedinUrlProperty]).trim();
                let email: string = blank(p[emailProperty]) ? '' : String(p[emailProperty]).trim();

                const write: Record<string, string> = {};
                const filled: string[] = [];
                const raw: Record<string, unknown> = {};
                let spentHere = 0;

                // Runs one lookup, converting the account-level failure into a
                // signal the outer loop can stop on.
                const lookup = async (type: string, input: string): Promise<unknown> => {
                    try {
                        const outcome = await callLinkFinderAI(apiKey, type, input, maxWaitSeconds * 1000);
                        spentHere += COST[type] ?? 1;
                        return outcome.resolved ? outcome.result : null;
                    } catch (err) {
                        if (err instanceof LinkFinderError) {
                            if (err.code === 'insufficient_credits') { outOfCredits = true; return null; }
                            if (err.code === 'unauthorized') {
                                throw new Error('LinkFinder AI rejected the API key. Update it in this connection\'s metadata.');
                            }
                            return null;   // specific to this record - skip the field, keep the contact
                        }
                        throw err;
                    }
                };

                /*
                 * LinkedIn URL first, always. It is the cheapest lookup (5 credits
                 * from an email, 1 from a name) and it is the input the other three
                 * need, so resolving it here turns a contact that could not be
                 * enriched at all into one that can.
                 */
                if (!linkedinUrl && (wanted.has('linkedin') || wanted.has('email') || wanted.has('phone') || wanted.has('title'))) {
                    let found: any = null;
                    if (email) found = await lookup('email_to_linkedin_url', email);
                    else if (fullName && company) found = await lookup('lead_full_name_to_linkedin_url', `${fullName} ${company}`);

                    const url = extractUrl(found);
                    if (url) {
                        linkedinUrl = url;
                        raw['linkedin_url'] = found;
                        if (wanted.has('linkedin')) { write[linkedinUrlProperty] = url; filled.push('linkedin'); }
                    }
                }

                if (!outOfCredits && wanted.has('email') && !email && linkedinUrl) {
                    const found: any = await lookup('linkedin_profile_to_email', linkedinUrl);
                    const v = extractString(found, ['email', 'work_email', 'business_email']);
                    if (v) { write[emailProperty] = v; email = v; filled.push('email'); raw['email'] = found; }
                }

                if (!outOfCredits && wanted.has('phone') && blank(p[phoneProperty]) && linkedinUrl) {
                    const found: any = await lookup('linkedin_profile_to_phone', linkedinUrl);
                    const v = extractString(found, ['phone', 'phone_number', 'mobile']);
                    if (v) { write[phoneProperty] = v; filled.push('phone'); raw['phone'] = found; }
                }

                if (!outOfCredits && wanted.has('title') && blank(p[titleProperty]) && linkedinUrl) {
                    const found: any = await lookup('linkedin_profile_to_linkedin_info', linkedinUrl);
                    const v = extractString(found, ['job_title', 'headline', 'title', 'position']);
                    if (v) { write[titleProperty] = v; filled.push('title'); raw['profile'] = found; }
                }

                /*
                 * The marker is written even when nothing was found, and that is
                 * deliberate: without it an unfillable contact is re-attempted on
                 * every run forever, and the customer pays for the same failed
                 * lookups each time. Recording the attempt is what makes the queue
                 * drain rather than spin.
                 */
                write[targetProperty] = JSON.stringify({
                    filled,
                    attempted_at: new Date().toISOString(),
                    ...(Object.keys(raw).length ? { raw } : {})
                });

                await nango.patch({
                    endpoint: `/crm/v3/objects/contacts/${contact.id}`,
                    data: { properties: write },
                    retries: 3
                });

                creditsSpent += spentHere;
                filledTotal += filled.length;
                processed++;

                saved.push({
                    id: String(contact.id),
                    contactId: String(contact.id),
                    fieldsFilled: filled,
                    creditsSpent: spentHere,
                    enrichedAt: new Date().toISOString()
                });
            }

            if (saved.length) await nango.batchSave(saved, 'EnrichedContact');

            after = search.data?.paging?.next?.after;
            if (!after) break;
        }

        if (outOfCredits) {
            await nango.log(
                `Stopped: out of LinkFinder AI credits after cleaning ${processed} contact(s). The rest stay queued and the next run resumes from here.`,
                { level: 'warn' }
            );
        }

        await nango.log(
            `Run complete: ${processed} contact(s) processed, ${filledTotal} field(s) filled, ~${creditsSpent} credits spent.`
        );
    }
});

/* LinkFinder returns different shapes per endpoint; pull a URL out of any of them. */
function extractUrl(result: unknown): string {
    const s = extractString(result, ['linkedin_url', 'profile_url', 'url', 'linkedin']);
    return s && /linkedin\.com\/(in|pub)\//i.test(s) ? s : '';
}

function extractString(result: unknown, keys: string[]): string {
    if (!result) return '';
    if (typeof result === 'string') return result.trim();
    if (typeof result !== 'object') return '';
    const obj = result as Record<string, unknown>;
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    // Some endpoints nest the payload one level down.
    for (const nested of ['result', 'data', 'profile']) {
        const inner = obj[nested];
        if (inner && typeof inner === 'object') {
            const s = extractString(inner, keys);
            if (s) return s;
        }
    }
    return '';
}

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
