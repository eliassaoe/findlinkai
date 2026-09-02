/**
 * Where candidates come from.
 *
 * Two kinds, and the difference between them is the whole point of the system:
 *
 * - `linkedin_post_reactions` is an *intent* source. These people did something this
 *   week — reacted to a competitor's launch, a hiring post, a "we just switched to X"
 *   post. The list is small, current, and the reason to contact them is on the record.
 * - `company_employees` is an *account* source. No timing signal at all, but it fills in
 *   named accounts you have decided to target. Give it a lower weight than a post.
 *
 * Both bill per record returned, so `maxItems` is a spend cap, not a preference.
 */
import { toCandidate } from './candidates.mjs';

function paramsFor(source) {
    if (source.kind !== 'company_employees') return {};
    const params = { employee_count: source.maxItems };
    if (source.department) params.department = source.department;
    if (source.seniority) params.seniority = source.seniority;
    return params;
}

/**
 * Runs one source. Returns the candidates plus what it cost, and never throws for a
 * source-level failure — one dead post URL should not lose the other three sources, and
 * the credits already spent on them.
 */
export async function collectFromSource(source, { client, budget }) {
    const price = budget ? source.maxItems : 0;
    if (budget && !budget.canAfford(price)) {
        return {
            source,
            candidates: [],
            credits: 0,
            skipped: true,
            warning: `Skipped source "${source.label ?? source.id}": ${budget.remaining} credits left, it could cost up to ${price}.`,
        };
    }

    let response;
    try {
        response = await client.enrich(source.type, source.input, paramsFor(source));
    } catch (error) {
        return { source, candidates: [], credits: 0, failed: true, warning: `Source "${source.label ?? source.id}" failed: ${error.message}` };
    }

    if (!response.resolved) {
        // The job is still running. The credits are already spent, so hand back the id
        // rather than firing the same lookup again on the next run.
        return {
            source,
            candidates: [],
            credits: 0,
            pending: { jobId: response.jobId, pollUrl: response.pollUrl },
            warning: `Source "${source.label ?? source.id}" is still running as job ${response.jobId} — poll it rather than re-running.`,
        };
    }

    const records = Array.isArray(response.result) ? response.result : response.result ? [response.result] : [];
    const kept = records.slice(0, source.maxItems);

    // Billing is per record the API returned, not per record kept.
    const credits = records.length;
    if (budget) budget.charge(credits, `source:${source.id}`);

    return {
        source,
        candidates: kept.map((record) => toCandidate(record, source)),
        credits,
        returned: records.length,
        warning: records.length > source.maxItems
            ? `Source "${source.label ?? source.id}" returned ${records.length} records and was charged for all of them; maxItems only capped what was scored.`
            : undefined,
    };
}

export async function collect(agent, { client, budget }) {
    const results = [];
    for (const source of agent.sources) {
        results.push(await collectFromSource(source, { client, budget }));
    }
    return results;
}
