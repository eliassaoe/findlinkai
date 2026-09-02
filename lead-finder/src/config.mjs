/**
 * Loading an agent file, and refusing to run a broken one.
 *
 * An agent is the whole configuration of one search: who you are looking for, where you
 * look, how much you will spend, and where the leads go. Claude writes these files; the
 * validation here is what stops a plausible-looking but wrong one from spending credits.
 */
import { readFileSync } from 'node:fs';
import { sourceOperation } from './budget.mjs';

const SOURCE_KINDS = new Set(['linkedin_post_reactions', 'company_employees']);

export function validateAgent(agent) {
    const errors = [];
    const require = (condition, message) => {
        if (!condition) errors.push(message);
    };

    require(typeof agent?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(agent.id),
        'id must be a lowercase kebab-case string — it names the state and run files.');
    require(Array.isArray(agent?.sources) && agent.sources.length > 0,
        'sources must list at least one place to look for people.');
    require(Number.isFinite(agent?.budget?.maxCreditsPerRun) && agent.budget.maxCreditsPerRun > 0,
        'budget.maxCreditsPerRun is required — a run without a ceiling can spend the whole balance.');

    for (const [index, source] of (agent?.sources ?? []).entries()) {
        const at = `sources[${index}]`;
        if (!SOURCE_KINDS.has(source?.kind)) {
            errors.push(`${at}.kind must be one of: ${[...SOURCE_KINDS].join(', ')}.`);
            continue;
        }
        require(typeof source.id === 'string' && source.id, `${at}.id is required — scoring and reporting key on it.`);
        require(typeof source.input === 'string' && source.input, `${at}.input is required (a post URL, or a company domain/name/LinkedIn URL).`);
        require(Number.isFinite(source.maxItems) && source.maxItems > 0,
            `${at}.maxItems is required — it is the only bound on a per-record charge.`);
        if (source.kind === 'linkedin_post_reactions' && source.input && !/linkedin\.com/.test(source.input)) {
            errors.push(`${at}.input does not look like a LinkedIn post URL.`);
        }
        if (source.kind === 'company_employees' && source.by && !['domain', 'name', 'linkedin'].includes(source.by)) {
            errors.push(`${at}.by must be domain, name or linkedin.`);
        }
    }

    const ids = (agent?.sources ?? []).map((s) => s.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.push('every source needs its own id — duplicates merge into one signal.');

    const icp = agent?.icp ?? {};
    require(icp.titles?.include?.length || icp.seniority?.length || icp.departments?.length,
        'icp needs at least one of titles.include, seniority or departments, or every record found will qualify.');

    if (agent?.destination) {
        require(typeof agent.destination.id === 'string', 'destination.id must name an outreach tool, e.g. "instantly".');
        require(typeof agent.destination.target?.id === 'string', 'destination.target.id must be the campaign or list to push into.');
    }

    if (Number.isFinite(agent?.enrich?.maxPerRun)) {
        require(agent.enrich.maxPerRun > 0, 'enrich.maxPerRun must be positive.');
    }

    return errors;
}

/** Fills in the defaults every other module assumes are present. */
export function withDefaults(agent) {
    return {
        ...agent,
        weights: agent.weights ?? {},
        enrich: { email: true, phone: false, minScore: 0, maxPerRun: 50, ...(agent.enrich ?? {}) },
        sources: agent.sources.map((source) => ({
            ...source,
            weight: Number.isFinite(source.weight) ? source.weight : 1,
            type: sourceOperation(source),
        })),
    };
}

export function loadAgent(path) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        throw new Error(`Could not read agent file ${path}: ${error.message}`);
    }

    const errors = validateAgent(parsed);
    if (errors.length) {
        throw new Error(`${path} is not a valid agent:\n  - ${errors.join('\n  - ')}`);
    }
    return withDefaults(parsed);
}
