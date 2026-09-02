/**
 * Turning what a source returns into one comparable candidate.
 *
 * The two sources disagree about almost everything. An employee list comes back
 * structured — `jobTitle`, `seniority`, `department`, `country`, sometimes even an
 * `email`. A post-reaction list comes back with four fields, one of which is a free-text
 * headline ("VP Engineering at Tesla") that has the title and the company mashed
 * together. Scoring has to see one shape, so the parsing lives here and nowhere else.
 */
import { toLead } from '../../integrations/outreach/lead.mjs';

/**
 * Two records are the same person when their LinkedIn URLs match. They rarely match as
 * strings: the API returns `http://www.linkedin.com/in/x` from one operation and
 * `https://linkedin.com/in/x/` from another, plus tracking query strings.
 */
export function profileKey(url) {
    if (!url) return null;
    const trimmed = String(url).trim().toLowerCase();
    if (!trimmed) return null;
    return trimmed
        .replace(/^https?:\/\//, '')
        .replace(/^[a-z]{2,3}\.linkedin\.com/, 'linkedin.com')
        .replace(/^www\./, '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '');
}

/**
 * A headline is marketing copy, not a schema, so this is a best effort on purpose:
 * take the last "at"/"@" separator as the company boundary, and if there is none, treat
 * the whole line as the title. Guessing a company wrongly is worse than leaving it
 * empty — it ends up in an email as {{company_name}}.
 */
export function parseHeadline(headline) {
    if (!headline) return {};
    const text = String(headline).trim();
    const match = text.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
    if (!match) return { jobTitle: text };

    const company = match[2]
        // "Tesla | We're hiring!" and "Tesla • Building X" are one company plus a slogan.
        .split(/\s+[|•·—]\s+/)[0]
        .trim();
    return { jobTitle: match[1].trim(), company: company || undefined };
}

const asArray = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

/** One record from one source, in the shape the rest of the pipeline reads. */
export function toCandidate(record, source) {
    const lead = toLead(record);
    const fromHeadline = lead.company ? {} : parseHeadline(record?.headline);

    const linkedinUrl = lead.linkedinUrl ?? record?.linkedinUrl;
    const key = profileKey(linkedinUrl);

    return {
        key,
        linkedinUrl,
        fullName: lead.fullName,
        firstName: lead.firstName,
        lastName: lead.lastName,
        jobTitle: lead.jobTitle ?? fromHeadline.jobTitle,
        company: lead.company ?? fromHeadline.company,
        companyWebsite: lead.companyWebsite,
        companySize: record?.companySize ?? record?.companyEmployeeCount ?? record?.employeeCount,
        seniority: lead.seniority,
        departments: asArray(record?.department ?? record?.departments),
        country: record?.country,
        location: lead.location,
        email: lead.email,
        phone: lead.phone,
        reactionType: record?.reactionType,
        sources: [{ id: source.id, kind: source.kind, label: source.label, weight: source.weight }],
        raw: record,
    };
}

/** Later sources fill in fields the first one left empty, but never overwrite them. */
function absorb(into, from) {
    for (const field of [
        'linkedinUrl', 'fullName', 'firstName', 'lastName', 'jobTitle', 'company', 'companyWebsite',
        'companySize', 'seniority', 'country', 'location', 'email', 'phone', 'reactionType',
    ]) {
        if (into[field] === undefined || into[field] === null || into[field] === '') into[field] = from[field];
    }
    if (!into.departments?.length) into.departments = from.departments;
    // Appearing in two sources is the signal itself — someone who engaged with a
    // competitor's post *and* works at an account you already target is not two leads.
    for (const source of from.sources) {
        if (!into.sources.some((s) => s.id === source.id)) into.sources.push(source);
    }
    return into;
}

/** Collapses every source's records into one candidate per person, in first-seen order. */
export function mergeCandidates(candidates) {
    const byKey = new Map();
    const anonymous = [];

    for (const candidate of candidates) {
        // No LinkedIn URL means nothing downstream can enrich or dedupe it. Keeping it
        // would put a nameless row in the campaign, so it is dropped here and counted.
        if (!candidate.key) {
            anonymous.push(candidate);
            continue;
        }
        const existing = byKey.get(candidate.key);
        if (existing) absorb(existing, candidate);
        else byKey.set(candidate.key, { ...candidate, sources: [...candidate.sources] });
    }

    return { candidates: [...byKey.values()], dropped: anonymous.length };
}
