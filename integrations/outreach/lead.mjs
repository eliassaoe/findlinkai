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
export function toLead(result, { email, fullName, company } = {}) {
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

    return {
        ...splitName(name),
        fullName: name,
        email: pick(result, 'email', 'work_email', 'workEmail') ?? email,
        phone: pick(result, 'phone', 'mobile_number', 'mobileNumber', 'phone_number'),
        linkedinUrl: pick(result, 'linkedinUrl', 'linkedin_url', 'profile_url', 'profileUrl'),
        jobTitle: pick(result, 'job_title', 'jobTitle', 'headline', 'position'),
        company: pick(result, 'company', 'company_name', 'companyName') ?? company,
        companyWebsite: pick(result, 'companyWebsite', 'company_website', 'website', 'domain'),
        companyPhone: pick(result, 'companyPhone', 'company_phone'),
        location: pick(result, 'location', 'companyCity', 'city'),
        raw: result,
    };
}

/** A list-returning operation gives many leads; a scalar or object gives one. */
export function toLeads(result, context) {
    if (Array.isArray(result)) return result.map((item) => toLead(item, context));
    return [toLead(result, context)];
}
