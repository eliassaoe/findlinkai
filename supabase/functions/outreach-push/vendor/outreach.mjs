// GENERATED — do not edit. Bundled from integrations/outreach/ by vendor.mjs.
// Regenerate with: node integrations/outreach/vendor.mjs
// The comments live in the library; this is a deploy artifact.

// ── destinations/_http.mjs
/**
 * One place for "call the destination and turn a failure into something readable".
 *
 * Every adapter below is the same two facts — how to authenticate, and what body this
 * tool wants — so anything that is not one of those two facts belongs here.
 */

class DestinationError extends Error {
    constructor(destination, status, body) {
        const detail =
            (typeof body === 'string' ? body : body?.message ?? body?.error ?? body?.detail ?? '')
                .toString()
                .slice(0, 300) || `HTTP ${status}`;
        super(`${destination}: ${detail}`);
        this.name = 'DestinationError';
        this.destination = destination;
        this.status = status;
        this.body = body;
    }
}

async function send(destination, url, options) {
    const response = await fetch(url, options);

    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }

    if (!response.ok) {
        // 401/403 is almost always a wrong or expired key rather than a bad payload,
        // and saying so saves a round of debugging the lead data instead.
        if (response.status === 401 || response.status === 403) {
            throw new DestinationError(destination, response.status, 'authentication failed — check the API key and its permissions');
        }
        throw new DestinationError(destination, response.status, body);
    }

    return body;
}

const json = (payload) => ({ 'Content-Type': 'application/json', ...payload });

// ── destinations/activecampaign.mjs
/**
 * ActiveCampaign. Two calls rather than one: it has no "add to list" shortcut on
 * contact creation, so the contact is synced first and then added to the list.
 *
 * The base URL is per-account (`https://<account>.api-us1.com`), so it comes from the
 * credentials rather than being fixed here.
 */
const activecampaign = {
    id: 'activecampaign',
    label: 'ActiveCampaign',
    auth: 'api_key',
    docs: 'https://developers.activecampaign.com/reference',
    targetLabel: 'List ID',
    extraCredentials: ['baseUrl'],

    async addLead({ credentials, target, lead }) {
        if (!credentials.baseUrl) {
            throw new Error('ActiveCampaign needs the account base URL, e.g. https://youraccount.api-us1.com');
        }

        const base = credentials.baseUrl.replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json', 'Api-Token': credentials.apiKey };

        // `contact/sync` upserts on email, so re-running over the same list does not
        // create duplicates.
        const synced = await send('ActiveCampaign', `${base}/api/3/contact/sync`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                contact: {
                    email: lead.email,
                    firstName: lead.firstName,
                    lastName: lead.lastName,
                    phone: lead.phone,
                },
            }),
        });

        const contactId = synced?.contact?.id;
        if (!contactId) throw new Error('ActiveCampaign accepted the contact but returned no id.');

        // status 1 subscribes; 2 would unsubscribe.
        await send('ActiveCampaign', `${base}/api/3/contactLists`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ contactList: { list: Number(target.id), contact: Number(contactId), status: 1 } }),
        });

        return { contactId, listId: target.id };
    },
};

// ── destinations/clay.mjs
/**
 * Clay.
 *
 * The odd one out: Clay pulls rather than receives, so there is no "add a lead" API.
 * What it has is a per-table webhook — a URL Clay generates for a table, which accepts
 * an arbitrary flat JSON object and appends it as a row. So the "campaign id" here is
 * that whole webhook URL, and the payload is flattened rather than mapped, because
 * Clay infers its columns from the keys it receives.
 */
const clay = {
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

// ── destinations/emailbison.mjs
/**
 * EmailBison. White-label and usually self-hosted, so there is no fixed hostname —
 * the instance URL is part of the credentials.
 *
 * There is no single "create and attach" endpoint: a lead is created on its own
 * (`POST /api/leads`), then attached to the campaign by id
 * (`POST /api/campaigns/{id}/leads/attach-leads`, body `{lead_ids: [...]}`), per
 * EmailBison's docs. Two calls, not one.
 */
const emailbison = {
    id: 'emailbison',
    label: 'EmailBison',
    auth: 'api_key',
    docs: 'https://docs.emailbison.com',
    targetLabel: 'Campaign ID',
    extraCredentials: ['baseUrl'],

    async addLead({ credentials, target, lead }) {
        if (!credentials.baseUrl) {
            throw new Error('EmailBison is self-hosted, so it needs the instance base URL, e.g. https://mail.yourdomain.com');
        }

        const base = credentials.baseUrl.replace(/\/$/, '');
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` };

        const created = await send('EmailBison', `${base}/api/leads`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email: lead.email,
                first_name: lead.firstName,
                last_name: lead.lastName,
                company: lead.company,
                custom_variables: {
                    job_title: lead.jobTitle,
                    phone: lead.phone,
                    linkedin_url: lead.linkedinUrl,
                },
            }),
        });

        const leadId = created?.data?.id ?? created?.id;
        if (!leadId) throw new Error('EmailBison accepted the lead but returned no id.');

        await send('EmailBison', `${base}/api/campaigns/${encodeURIComponent(target.id)}/leads/attach-leads`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ lead_ids: [leadId] }),
        });

        return { leadId, campaignId: target.id };
    },
};

// ── destinations/instantly.mjs
/**
 * Instantly (v2).
 *
 * Field names confirmed against Instantly's own endpoint spec: `email`, `first_name`,
 * `last_name`, `company_name`, `phone`, `website`.
 *
 * The campaign field is the one thing to confirm on a first live run — Instantly's v2
 * body documents it as `campaign`, while its tooling exposes it as `campaign_id`. A
 * lead can go to a campaign or to a plain list, and needs exactly one of them.
 */
const instantly = {
    id: 'instantly',
    label: 'Instantly',
    auth: 'api_key',
    docs: 'https://developer.instantly.ai/api/v2',
    targetLabel: 'Campaign or list ID',

    async addLead({ credentials, target, lead }) {
        const body = {
            email: lead.email,
            first_name: lead.firstName,
            last_name: lead.lastName,
            company_name: lead.company,
            phone: lead.phone,
            website: lead.companyWebsite,
            // Instantly merges these into the email body as {{variables}} — which is
            // the point of enriching before pushing rather than after.
            custom_variables: {
                job_title: lead.jobTitle,
                linkedin_url: lead.linkedinUrl,
                location: lead.location,
            },
            ...(target.kind === 'list' ? { list_id: target.id } : { campaign: target.id }),
        };

        return send('Instantly', 'https://api.instantly.ai/api/v2/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` },
            body: JSON.stringify(body),
        });
    },
};

// ── destinations/justcall.mjs
/**
 * JustCall. A dialler rather than an email tool, so it is the one destination where a
 * phone number matters more than an email — `enrichAndPush` should be called with
 * `requireEmail: false` for it, typically after a `linkedin_profile_to_phone` lookup.
 *
 * Authenticates with `key:secret` as the Authorization header, not a bearer token.
 */
const justcall = {
    id: 'justcall',
    label: 'JustCall',
    auth: 'api_key',
    docs: 'https://developer.justcall.io',
    targetLabel: 'Contact list ID (optional)',
    extraCredentials: ['apiSecret'],
    prefers: 'phone',

    async addLead({ credentials, target, lead }) {
        if (!lead.phone) {
            throw new Error('JustCall is a dialler — this lead has no phone number, so there is nothing to dial.');
        }

        return send('JustCall', 'https://api.justcall.io/v2.1/sales_dialer/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `${credentials.apiKey}:${credentials.apiSecret}`,
            },
            body: JSON.stringify({
                firstname: lead.firstName,
                lastname: lead.lastName,
                phone: lead.phone,
                email: lead.email,
                company: lead.company,
                ...(target?.id ? { list_id: target.id } : {}),
            }),
        });
    },
};

// ── destinations/lemlist.mjs
/**
 * lemlist. Authenticates with HTTP Basic where the key is the *password* and the
 * username is empty. The v1 API addressed the lead by email in the URL path; the
 * current API (`POST /api/campaigns/{campaignId}/leads`, per developer.lemlist.com)
 * takes the email in the body instead.
 */
const lemlist = {
    id: 'lemlist',
    label: 'lemlist',
    auth: 'api_key',
    docs: 'https://developer.lemlist.com',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        if (!lead.email) throw new Error('lemlist identifies a lead by email, and this one has none.');

        const auth = btoa(`:${credentials.apiKey}`);
        const url = `https://api.lemlist.com/api/campaigns/${encodeURIComponent(target.id)}/leads`;

        return send('lemlist', url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
            body: JSON.stringify({
                email: lead.email,
                firstName: lead.firstName,
                lastName: lead.lastName,
                companyName: lead.company,
                phone: lead.phone,
                linkedinUrl: lead.linkedinUrl,
                jobTitle: lead.jobTitle,
                companyDomain: lead.companyWebsite,
            }),
        });
    },
};

// ── destinations/outreach.mjs
/**
 * Outreach. JSON:API — everything is wrapped in `data.type`/`data.attributes`, and the
 * content type is `application/vnd.api+json` rather than plain JSON.
 *
 * Two calls: create the prospect, then add them to the sequence. The second needs a
 * mailbox to send from, which is an Outreach-side setting rather than anything
 * LinkFinder knows.
 */
const outreach = {
    id: 'outreach',
    label: 'Outreach',
    auth: 'oauth',
    docs: 'https://developers.outreach.io/api/reference',
    targetLabel: 'Sequence ID',
    extraCredentials: ['mailboxId'],

    async addLead({ credentials, target, lead }) {
        const headers = {
            'Content-Type': 'application/vnd.api+json',
            Authorization: `Bearer ${credentials.accessToken ?? credentials.apiKey}`,
        };

        const prospect = await send('Outreach', 'https://api.outreach.io/api/v2/prospects', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                data: {
                    type: 'prospect',
                    attributes: {
                        emails: lead.email ? [lead.email] : [],
                        firstName: lead.firstName,
                        lastName: lead.lastName,
                        company: lead.company,
                        title: lead.jobTitle,
                        workPhones: lead.phone ? [lead.phone] : [],
                        linkedInUrl: lead.linkedinUrl,
                    },
                },
            }),
        });

        const prospectId = prospect?.data?.id;
        if (!prospectId) throw new Error('Outreach accepted the prospect but returned no id.');

        if (!credentials.mailboxId) {
            // The prospect exists and is worth reporting even though the sequence add
            // could not run — losing it silently would waste the enrichment credits.
            return { prospectId, sequenced: false, reason: 'no mailboxId given, so the prospect was not sequenced' };
        }

        await send('Outreach', 'https://api.outreach.io/api/v2/sequenceStates', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                data: {
                    type: 'sequenceState',
                    relationships: {
                        prospect: { data: { type: 'prospect', id: Number(prospectId) } },
                        sequence: { data: { type: 'sequence', id: Number(target.id) } },
                        mailbox: { data: { type: 'mailbox', id: Number(credentials.mailboxId) } },
                    },
                },
            }),
        });

        return { prospectId, sequenced: true };
    },
};

// ── destinations/reply.mjs
/** Reply.io. One endpoint both creates the person and pushes them into the campaign. */
const reply = {
    id: 'reply',
    label: 'Reply.io',
    auth: 'api_key',
    docs: 'https://apidocs.reply.io',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        return send('Reply.io', 'https://api.reply.io/v1/actions/addandpushtocampaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': credentials.apiKey },
            body: JSON.stringify({
                campaignId: Number(target.id),
                email: lead.email,
                firstName: lead.firstName,
                lastName: lead.lastName,
                company: lead.company,
                title: lead.jobTitle,
                phone: lead.phone,
                linkedInProfile: lead.linkedinUrl,
                city: lead.location,
            }),
        });
    },
};

// ── destinations/salesforge.mjs
/**
 * Salesforge. Contacts live under a workspace, so the workspace id is part of the path
 * and comes from the credentials rather than the target.
 */
const salesforge = {
    id: 'salesforge',
    label: 'Salesforge',
    auth: 'api_key',
    docs: 'https://api.salesforge.ai/docs',
    targetLabel: 'Sequence ID',
    extraCredentials: ['workspaceId'],

    async addLead({ credentials, target, lead }) {
        if (!credentials.workspaceId) throw new Error('Salesforge needs a workspaceId.');

        const url = `https://api.salesforge.ai/public/v2/workspaces/${encodeURIComponent(credentials.workspaceId)}/contacts`;

        return send('Salesforge', url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` },
            body: JSON.stringify({
                email: lead.email,
                firstName: lead.firstName,
                lastName: lead.lastName,
                companyName: lead.company,
                jobTitle: lead.jobTitle,
                phone: lead.phone,
                linkedinUrl: lead.linkedinUrl,
                sequenceId: target.id,
            }),
        });
    },
};

// ── destinations/salesloft.mjs
/**
 * Salesloft. Create the person, then add them to a cadence. Endpoints keep the `.json`
 * suffix, and the create body is form-encoded rather than JSON.
 */
const salesloft = {
    id: 'salesloft',
    label: 'Salesloft',
    auth: 'oauth',
    docs: 'https://developers.salesloft.com',
    targetLabel: 'Cadence ID',

    async addLead({ credentials, target, lead }) {
        const token = credentials.accessToken ?? credentials.apiKey;

        const form = new URLSearchParams();
        const set = (key, value) => value && form.set(key, String(value));
        set('email_address', lead.email);
        set('first_name', lead.firstName);
        set('last_name', lead.lastName);
        set('title', lead.jobTitle);
        set('phone', lead.phone);
        set('linkedin_url', lead.linkedinUrl);
        set('city', lead.location);

        const person = await send('Salesloft', 'https://api.salesloft.com/v2/people.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${token}` },
            body: form,
        });

        const personId = person?.data?.id;
        if (!personId) throw new Error('Salesloft accepted the person but returned no id.');

        await send('Salesloft', 'https://api.salesloft.com/v2/cadence_memberships.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ person_id: personId, cadence_id: Number(target.id) }),
        });

        return { personId, cadenceId: target.id };
    },
};

// ── destinations/smartlead.mjs
/**
 * Smartlead. Authenticates with the API key as a query parameter rather than a header,
 * and takes leads in batches even when there is only one.
 */
const smartlead = {
    id: 'smartlead',
    label: 'Smartlead',
    auth: 'api_key',
    docs: 'https://api.smartlead.ai/reference',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        const url = `https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(target.id)}/leads?api_key=${encodeURIComponent(credentials.apiKey)}`;

        return send('Smartlead', url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_list: [
                    {
                        email: lead.email,
                        first_name: lead.firstName,
                        last_name: lead.lastName,
                        company_name: lead.company,
                        phone_number: lead.phone,
                        website: lead.companyWebsite,
                        linkedin_profile: lead.linkedinUrl,
                        location: lead.location,
                        custom_fields: { job_title: lead.jobTitle },
                    },
                ],
            }),
        });
    },
};

// ── destinations/woodpecker.mjs
/**
 * Woodpecker. Basic auth with the API key as the username, and prospects are added in
 * a list even when there is one.
 */
const woodpecker = {
    id: 'woodpecker',
    label: 'Woodpecker',
    auth: 'api_key',
    docs: 'https://woodpecker.co/api',
    targetLabel: 'Campaign ID',

    async addLead({ credentials, target, lead }) {
        const auth = btoa(`${credentials.apiKey}:X`);

        return send('Woodpecker', 'https://api.woodpecker.co/rest/v1/add_prospects_campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
            body: JSON.stringify({
                campaign: { campaign_id: Number(target.id) },
                prospects: [
                    {
                        email: lead.email,
                        first_name: lead.firstName,
                        last_name: lead.lastName,
                        company: lead.company,
                        title: lead.jobTitle,
                        phone: lead.phone,
                        linkedin_url: lead.linkedinUrl,
                        website: lead.companyWebsite,
                        city: lead.location,
                    },
                ],
            }),
        });
    },
};

// ── destinations/index.mjs
const DESTINATIONS = {
    activecampaign,
    clay,
    emailbison,
    instantly,
    justcall,
    lemlist,
    outreach,
    reply,
    salesforge,
    salesloft,
    smartlead,
    woodpecker,
};

function getDestination(id) {
    const destination = DESTINATIONS[id];
    if (!destination) {
        throw new Error(`Unknown outreach destination "${id}". Known: ${Object.keys(DESTINATIONS).join(', ')}.`);
    }
    return destination;
}

// ── lead.mjs
/**
 * Turning a LinkFinder AI result into the lead shape every outreach tool wants.
 *
 * The API answers in three shapes depending on the operation — a bare scalar
 * ("tesla.com"), an object, or a list of them — and the object keys are not uniform
 * either: employee lists come back camelCase (`linkedinUrl`, `companyWebsite`) while
 * profile lookups come back snake_case (`job_title`, `follower_count`). Every
 * destination adapter would otherwise have to know all of that.
 */

/** Reads the first key present, so one lookup can cover both casings. */
const pick = (source, ...keys) => {
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return undefined;
};

/**
 * Outreach tools all want first and last name separately, and the API returns one
 * `name`. Splitting on the last space is wrong for compound surnames ("van der Berg")
 * but is what every tool in this category does, and it is reversible by the caller —
 * `fullName` is always passed through unchanged.
 */
function splitName(fullName) {
    if (!fullName) return {};
    const parts = String(fullName).trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0] };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

/** Normalises one enrichment result into the shape every destination adapter reads. */
function toLead(result, { email, fullName, company } = {}) {
    // A scalar result carries no identity of its own, so whatever the caller knew
    // going in is all there is.
    if (result === null || result === undefined || typeof result !== 'object') {
        const scalar = result === null || result === undefined ? undefined : String(result);
        const looksLikeEmail = scalar?.includes('@');
        return {
            ...splitName(fullName),
            fullName,
            email: email ?? (looksLikeEmail ? scalar : undefined),
            company,
            raw: result ?? null,
        };
    }

    const name = pick(result, 'name', 'full_name', 'fullName') ?? fullName;

    // Employee-list and lead-search results carry firstName/lastName directly, which is
    // always better than splitting `name` — the split is only a fallback.
    const given = pick(result, 'firstName', 'first_name');
    const family = pick(result, 'lastName', 'last_name');
    const parts = given || family ? { firstName: given, lastName: family } : splitName(name);

    return {
        ...parts,
        fullName: name,
        email: pick(result, 'email', 'work_email', 'workEmail') ?? email,
        phone: pick(result, 'mobileNumber', 'phone', 'mobile_number', 'phone_number'),
        linkedinUrl: pick(result, 'linkedinUrl', 'linkedin_url', 'profile_url', 'profileUrl'),
        jobTitle: pick(result, 'jobTitle', 'job_title', 'headline', 'position'),
        company: pick(result, 'company', 'company_name', 'companyName') ?? company,
        companyWebsite: pick(result, 'companyWebsite', 'company_website', 'website', 'domain'),
        linkedinUrlCompany: pick(result, 'companyLinkedinUrl', 'company_linkedin_url'),
        companyPhone: pick(result, 'companyPhone', 'company_phone'),
        location: pick(result, 'location', 'city', 'companyCity'),
        seniority: pick(result, 'seniority'),
        raw: result,
    };
}

/** A list-returning operation gives many leads; a scalar or object gives one. */
function toLeads(result, context) {
    if (Array.isArray(result)) return result.map((item) => toLead(item, context));
    return [toLead(result, context)];
}

// ── push-leads.mjs
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

/** Validates a destination has what it needs before anything is spent reaching it. */
function checkDestination(destinationId, { credentials, target, dryRun = false } = {}) {
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
async function pushLeads({
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

export { DestinationError, send, DESTINATIONS, getDestination, toLead, toLeads, checkDestination, pushLeads };
export const BUNDLE_SHA = '24c54b60bfba0274';
