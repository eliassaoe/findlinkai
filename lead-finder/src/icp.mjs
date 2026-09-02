/**
 * Deciding who is worth spending credits on.
 *
 * This is the half of the system that has to be deterministic. An assistant can propose
 * an ICP and can write the email, but "does this person match, and are they worth ten
 * credits" gets asked a few thousand times a week and has to give the same answer every
 * time, be reviewable in a diff, and be testable without a network call.
 *
 * Two separate questions, in this order:
 *   1. `evaluate` — does this person match the ICP at all? A no here is final.
 *   2. `scoreIntent` — how strong is the buying signal? This decides who gets enriched
 *      first when the budget will not stretch to everyone.
 */

const lower = (value) => String(value ?? '').toLowerCase();
const anyMatch = (haystack, needles) => needles.some((needle) => haystack.includes(lower(needle)));

export const DEFAULT_WEIGHTS = {
    /** Every extra source the same person shows up in. Two signals beat one strong one. */
    multiSource: 2,
    /** Their seniority is one you named. */
    seniority: 2,
    /** Their department is one you named. */
    department: 1,
    /** They did something more deliberate than a like. */
    strongReaction: 1,
};

/** A like is the cheapest thing on LinkedIn; the others take a moment's thought. */
const STRONG_REACTIONS = new Set(['PRAISE', 'EMPATHY', 'INTEREST', 'APPRECIATION', 'ENTERTAINMENT']);

/**
 * Hard filters. Every rejection names the rule that rejected it, because the first
 * question about any run is "why did it only find four people".
 */
export function evaluate(candidate, icp = {}) {
    const title = lower(candidate.jobTitle);
    const company = lower(candidate.company);
    const website = lower(candidate.companyWebsite);
    const reasons = [];

    if (icp.titles?.exclude?.length && title && anyMatch(title, icp.titles.exclude)) {
        return { matched: false, rejectedBy: 'title_excluded', reasons };
    }

    if (icp.excludeCompanies?.length) {
        const haystack = `${company} ${website}`;
        if (haystack.trim() && anyMatch(haystack, icp.excludeCompanies)) {
            return { matched: false, rejectedBy: 'company_excluded', reasons };
        }
    }

    if (icp.titles?.include?.length) {
        // No title at all is a rejection, not a pass. A reaction list always carries a
        // headline, so an empty title means the record is junk.
        if (!title) return { matched: false, rejectedBy: 'no_title', reasons };
        if (!anyMatch(title, icp.titles.include)) return { matched: false, rejectedBy: 'title_mismatch', reasons };
        reasons.push('title');
    }

    if (icp.seniority?.length && candidate.seniority) {
        if (!icp.seniority.map(lower).includes(lower(candidate.seniority))) {
            return { matched: false, rejectedBy: 'seniority_mismatch', reasons };
        }
        reasons.push('seniority');
    }

    if (icp.departments?.length && candidate.departments?.length) {
        const wanted = icp.departments.map(lower);
        if (!candidate.departments.some((d) => wanted.includes(lower(d)))) {
            return { matched: false, rejectedBy: 'department_mismatch', reasons };
        }
        reasons.push('department');
    }

    if (icp.countries?.length && candidate.country) {
        if (!icp.countries.map(lower).includes(lower(candidate.country))) {
            return { matched: false, rejectedBy: 'country_mismatch', reasons };
        }
        reasons.push('country');
    }

    // Company size and country are missing from reaction records entirely. Rejecting on
    // a field the source never returns would throw away the whole post-engagement
    // source, so an absent field passes and says so.
    if (icp.companySize && Number.isFinite(Number(candidate.companySize))) {
        const size = Number(candidate.companySize);
        if (icp.companySize.min !== undefined && size < icp.companySize.min) {
            return { matched: false, rejectedBy: 'company_too_small', reasons };
        }
        if (icp.companySize.max !== undefined && size > icp.companySize.max) {
            return { matched: false, rejectedBy: 'company_too_large', reasons };
        }
        reasons.push('company_size');
    }

    return { matched: true, reasons };
}

/** How strong the buying signal is, once they already match. */
export function scoreIntent(candidate, { weights = DEFAULT_WEIGHTS, icp = {} } = {}) {
    const detail = [];
    let score = 0;

    for (const source of candidate.sources) {
        const weight = Number.isFinite(source.weight) ? source.weight : 1;
        score += weight;
        detail.push({ reason: `source:${source.label ?? source.id}`, points: weight });
    }

    if (candidate.sources.length > 1) {
        const points = weights.multiSource * (candidate.sources.length - 1);
        score += points;
        detail.push({ reason: 'multiple_signals', points });
    }

    if (icp.seniority?.length && candidate.seniority && icp.seniority.map(lower).includes(lower(candidate.seniority))) {
        score += weights.seniority;
        detail.push({ reason: 'seniority_match', points: weights.seniority });
    }

    if (icp.departments?.length && candidate.departments?.some((d) => icp.departments.map(lower).includes(lower(d)))) {
        score += weights.department;
        detail.push({ reason: 'department_match', points: weights.department });
    }

    if (candidate.reactionType && STRONG_REACTIONS.has(String(candidate.reactionType).toUpperCase())) {
        score += weights.strongReaction;
        detail.push({ reason: `reaction:${candidate.reactionType}`, points: weights.strongReaction });
    }

    return { score, detail };
}

/**
 * Runs both passes over everyone and hands back the shortlist, highest intent first.
 * Rejections are counted by rule rather than thrown away — a run that qualifies nobody
 * has to be able to say which filter did it.
 */
export function qualify(candidates, agent) {
    const icp = agent.icp ?? {};
    const weights = { ...DEFAULT_WEIGHTS, ...(agent.weights ?? {}) };
    const minScore = agent.enrich?.minScore ?? 0;

    const qualified = [];
    const rejected = [];
    const rejectedBy = {};
    const belowThreshold = [];

    for (const candidate of candidates) {
        const verdict = evaluate(candidate, icp);
        if (!verdict.matched) {
            rejectedBy[verdict.rejectedBy] = (rejectedBy[verdict.rejectedBy] ?? 0) + 1;
            rejected.push({ candidate, rejectedBy: verdict.rejectedBy });
            continue;
        }

        const { score, detail } = scoreIntent(candidate, { weights, icp });
        const scored = { candidate, score, detail, matchedOn: verdict.reasons };
        if (score < minScore) belowThreshold.push(scored);
        else qualified.push(scored);
    }

    // Ties broken by the number of distinct signals: two mediocre signals beat one loud
    // one, because the second is independent evidence.
    qualified.sort((a, b) => b.score - a.score || b.candidate.sources.length - a.candidate.sources.length);

    return { qualified, belowThreshold, rejected, rejectedBy };
}
