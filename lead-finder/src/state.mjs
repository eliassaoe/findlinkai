/**
 * What the agent already knows, so a weekly run is not a weekly re-purchase.
 *
 * The expensive mistake this prevents: the same competitor post is read every Monday,
 * the same 60 people come back, and every one of them costs ten credits to enrich
 * again. Anyone already enriched is skipped outright.
 *
 * Someone seen but *not* enriched is deliberately not skipped. They were below the
 * score threshold last week; if they turn up in a second source this week they cross it,
 * and that is exactly the lead worth having.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function emptyState(agentId) {
    return { agentId, version: 1, seen: {}, runs: [] };
}

export function loadState(path, agentId) {
    if (!existsSync(path)) return emptyState(agentId);
    const state = JSON.parse(readFileSync(path, 'utf8'));
    if (state.agentId !== agentId) {
        throw new Error(`State file ${path} belongs to agent "${state.agentId}", not "${agentId}".`);
    }
    return { ...emptyState(agentId), ...state };
}

export function saveState(path, state) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

/** True when this person has already been paid for and does not need finding twice. */
export function alreadyEnriched(state, key) {
    return Boolean(state.seen[key]?.enriched);
}

export function noteSeen(state, candidate, { at }) {
    const entry = state.seen[candidate.key] ?? { firstSeen: at, sources: [] };
    entry.lastSeen = at;
    entry.name = candidate.fullName ?? entry.name;
    for (const source of candidate.sources) {
        if (!entry.sources.includes(source.id)) entry.sources.push(source.id);
    }
    state.seen[candidate.key] = entry;
    return entry;
}

export function noteEnriched(state, key, { at, email, pushed }) {
    const entry = state.seen[key] ?? { firstSeen: at, sources: [] };
    entry.enriched = true;
    entry.enrichedAt = at;
    entry.hasEmail = Boolean(email);
    if (pushed !== undefined) entry.pushed = pushed;
    state.seen[key] = entry;
    return entry;
}

/** Run records are what `report` reads; the leads themselves are not kept here. */
export function noteRun(state, summary, { keep = 100 } = {}) {
    state.runs.push(summary);
    if (state.runs.length > keep) state.runs = state.runs.slice(-keep);
    return state;
}
