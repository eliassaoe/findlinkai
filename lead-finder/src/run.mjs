/**
 * One run of one agent: source, qualify, enrich, push.
 *
 * The order is the argument. Sourcing is cheap per record and finds far more people than
 * you want; enrichment is ten credits a head. So everything that can filter someone out
 * — the ICP rules, the intent score, the seen-list, the budget — runs *before* the first
 * enrichment call, and the enrichment loop then works down a list that is already sorted
 * by how much each lead is worth.
 *
 * Nothing here calls the network directly. `client` and `pushLead` are injected, which is
 * what makes a full run testable offline.
 */
import { Budget, priceOf } from './budget.mjs';
import { collect } from './sources.mjs';
import { mergeCandidates } from './candidates.mjs';
import { qualify } from './icp.mjs';
import { alreadyEnriched, noteEnriched, noteRun, noteSeen } from './state.mjs';

/** The shape the outreach destinations read. */
function toOutreachLead(candidate) {
    return {
        fullName: candidate.fullName,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        phone: candidate.phone,
        jobTitle: candidate.jobTitle,
        company: candidate.company,
        companyWebsite: candidate.companyWebsite,
        linkedinUrl: candidate.linkedinUrl,
        location: candidate.location ?? candidate.country,
    };
}

export async function runAgent(agent, {
    client,
    state,
    dryRun = true,
    pushLead,
    now = () => new Date(),
    budget = new Budget(agent.budget.maxCreditsPerRun),
} = {}) {
    const startedAt = now().toISOString();
    const warnings = [];
    const pending = [];

    // 1. Source. Per-record billing means this is where a run can quietly get expensive,
    //    so it happens under the same budget as everything else.
    const collected = await collect(agent, { client, budget });
    const perSource = [];
    for (const result of collected) {
        if (result.warning) warnings.push(result.warning);
        if (result.pending) pending.push({ source: result.source.id, ...result.pending });
        perSource.push({
            id: result.source.id,
            label: result.source.label ?? result.source.id,
            kind: result.source.kind,
            returned: result.returned ?? 0,
            credits: result.credits,
        });
    }

    const { candidates, dropped } = mergeCandidates(collected.flatMap((result) => result.candidates));
    if (dropped) warnings.push(`${dropped} record(s) had no LinkedIn URL and were dropped — nothing downstream can enrich or dedupe them.`);

    for (const candidate of candidates) noteSeen(state, candidate, { at: startedAt });

    // 2. Qualify. Hard ICP filters first, then the intent score decides the order.
    const { qualified, belowThreshold, rejected, rejectedBy } = qualify(candidates, agent);

    // 3. Anyone already paid for is skipped. Someone seen but never enriched is not —
    //    they may have crossed the threshold since, which is the point of scoring.
    const fresh = qualified.filter((entry) => !alreadyEnriched(state, entry.candidate.key));
    const repeats = qualified.length - fresh.length;

    // 4. Enrich, best-scoring first, until the cap or the budget stops it.
    const leads = [];
    const skipped = [];
    const maxPerRun = agent.enrich.maxPerRun;
    const emailPrice = priceOf('linkedin_profile_to_email').perCall;
    // The cap counts *lookups*, not leads. A lookup that finds no address is charged
    // exactly like one that works, so capping on leads found would let a bad run pay
    // for far more than the plan quoted.
    let lookups = 0;
    let stoppedBy = null;

    for (const entry of fresh) {
        const { candidate } = entry;

        if (lookups >= maxPerRun) {
            stoppedBy = stoppedBy ?? 'enrich.maxPerRun';
            skipped.push({ key: candidate.key, reason: 'over_max_per_run', score: entry.score });
            continue;
        }

        // Employee lists sometimes already carry a work email. Paying ten credits for
        // one the API has handed over for free is the easiest waste in the system.
        if (candidate.email) {
            leads.push({ key: candidate.key, ...toOutreachLead(candidate), score: entry.score, sources: candidate.sources.map((s) => s.id), enrichedNow: false });
            noteEnriched(state, candidate.key, { at: startedAt, email: true });
            continue;
        }

        if (agent.enrich.email === false) {
            skipped.push({ key: candidate.key, reason: 'no_email_and_enrichment_disabled', score: entry.score });
            continue;
        }

        if (!budget.canAfford(emailPrice)) {
            stoppedBy = stoppedBy ?? 'budget';
            skipped.push({ key: candidate.key, reason: 'over_budget', score: entry.score });
            continue;
        }

        if (dryRun) {
            // A dry run is allowed to say who it *would* enrich, but must not spend a
            // credit doing it, so no lookup happens and no budget moves.
            skipped.push({ key: candidate.key, reason: 'dry_run', score: entry.score, name: candidate.fullName });
            continue;
        }

        let response;
        lookups += 1;
        try {
            response = await client.enrich('linkedin_profile_to_email', candidate.linkedinUrl);
        } catch (error) {
            // Some failures happen before the lookup runs and cost nothing; anything
            // else has already been charged. Assume charged unless the error says
            // otherwise, because under-counting the spend is the dangerous direction.
            const refunded = ['unauthorized', 'insufficient_credits', 'rate_limited', 'invalid_request'].includes(error.code);
            if (!refunded) budget.charge(emailPrice, `email:${candidate.key}`);
            // One bad profile must not abandon the leads still queued behind it.
            warnings.push(`Email lookup failed for ${candidate.fullName ?? candidate.key}: ${error.message}`);
            skipped.push({ key: candidate.key, reason: 'lookup_failed', score: entry.score });
            continue;
        }

        // Charged whether or not an address came back.
        budget.charge(emailPrice, `email:${candidate.key}`);

        const email = typeof response.result === 'string' ? response.result : response.result?.email;
        if (!email) {
            noteEnriched(state, candidate.key, { at: startedAt, email: false });
            skipped.push({ key: candidate.key, reason: 'no_email_found', score: entry.score });
            continue;
        }

        candidate.email = email;
        leads.push({ key: candidate.key, ...toOutreachLead(candidate), score: entry.score, sources: candidate.sources.map((s) => s.id), enrichedNow: true });
        noteEnriched(state, candidate.key, { at: startedAt, email: true });
    }

    // 5. Push. Only leads with an address, and only when this is not a dry run.
    let pushed = 0;
    const pushFailures = [];
    if (!dryRun && agent.destination && pushLead) {
        for (const lead of leads) {
            try {
                await pushLead(lead);
                pushed += 1;
                noteEnriched(state, lead.key, { at: startedAt, email: true, pushed: true });
            } catch (error) {
                pushFailures.push({ email: lead.email, error: error.message });
                warnings.push(`Push failed for ${lead.email}: ${error.message}`);
            }
        }
    }

    const summary = {
        agentId: agent.id,
        startedAt,
        finishedAt: now().toISOString(),
        dryRun,
        sources: perSource,
        sourced: candidates.length,
        qualified: qualified.length,
        belowThreshold: belowThreshold.length,
        rejected: rejected.length,
        rejectedBy,
        alreadyEnriched: repeats,
        enrichedNow: leads.filter((lead) => lead.enrichedNow).length,
        lookups,
        emailsFound: leads.length,
        pushed,
        creditsSpent: budget.spent,
        creditCeiling: budget.max,
        stoppedBy,
        warnings,
        pending,
        pushFailures,
    };

    noteRun(state, summary);

    return { summary, leads, skipped, qualified, belowThreshold, rejected, budget };
}
