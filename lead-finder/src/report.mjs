/**
 * Which source is actually worth its credits.
 *
 * The question the assistant gets asked after a month of runs is "which ICP is
 * responding best" — and the honest answer needs two halves. This module owns the half
 * the pipeline knows: how many people each source found, how many survived the ICP
 * rules, and what that cost per usable lead.
 *
 * The other half — replies and meetings — lives in the outreach tool. Pass it in as
 * `replyStats` keyed by source id and it is joined in; leave it out and the report says
 * the column is unknown rather than implying a zero.
 */
export function summarizeRuns(runs, { replyStats } = {}) {
    const bySource = new Map();
    const totals = { runs: runs.length, sourced: 0, qualified: 0, emailsFound: 0, pushed: 0, credits: 0 };

    for (const run of runs) {
        totals.sourced += run.sourced ?? 0;
        totals.qualified += run.qualified ?? 0;
        totals.emailsFound += run.emailsFound ?? 0;
        totals.pushed += run.pushed ?? 0;
        totals.credits += run.creditsSpent ?? 0;

        for (const source of run.sources ?? []) {
            const entry = bySource.get(source.id) ?? { id: source.id, label: source.label, kind: source.kind, returned: 0, credits: 0, runs: 0 };
            entry.returned += source.returned ?? 0;
            entry.credits += source.credits ?? 0;
            entry.runs += 1;
            bySource.set(source.id, entry);
        }
    }

    const sources = [...bySource.values()].map((entry) => ({
        ...entry,
        replies: replyStats?.[entry.id]?.replies,
        // Sourcing credits only — the enrichment spend is not attributable to one source
        // when a lead can arrive from two, and inventing a split would make the cheapest
        // source look expensive.
        creditsPerRecord: entry.returned ? Number((entry.credits / entry.returned).toFixed(2)) : null,
    }));

    const costPerLead = totals.emailsFound ? Number((totals.credits / totals.emailsFound).toFixed(1)) : null;
    const qualifyRate = totals.sourced ? Number((totals.qualified / totals.sourced).toFixed(3)) : null;

    return {
        totals: { ...totals, costPerLead, qualifyRate },
        sources: sources.sort((a, b) => b.returned - a.returned),
        replyDataProvided: Boolean(replyStats),
    };
}

export function formatReport(report, agentId) {
    const lines = [`Agent: ${agentId}`, `Runs recorded: ${report.totals.runs}`];
    lines.push(
        `Sourced ${report.totals.sourced} · qualified ${report.totals.qualified}` +
            (report.totals.qualifyRate !== null ? ` (${Math.round(report.totals.qualifyRate * 100)}%)` : '') +
            ` · emails ${report.totals.emailsFound} · pushed ${report.totals.pushed}`,
    );
    lines.push(`Credits ${report.totals.credits}${report.totals.costPerLead ? ` — ${report.totals.costPerLead} per lead with an email` : ''}`);
    lines.push('');
    lines.push('Source                          records  credits  replies');
    for (const source of report.sources) {
        const label = (source.label ?? source.id).slice(0, 30).padEnd(30);
        const replies = source.replies === undefined ? (report.replyDataProvided ? '0' : 'n/a') : String(source.replies);
        lines.push(`${label} ${String(source.returned).padStart(7)} ${String(source.credits).padStart(8)} ${replies.padStart(8)}`);
    }
    if (!report.replyDataProvided) {
        lines.push('');
        lines.push('Replies are unknown here — they live in the outreach tool. Pass --stats to join them in.');
    }
    return lines.join('\n');
}
