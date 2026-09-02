#!/usr/bin/env node
/**
 * The command line the assistant drives.
 *
 * Four verbs, and the split between them is a spending decision:
 *
 *   plan    reads the agent file and prices the run.       Never spends.
 *   run     sources, qualifies, enriches, pushes.          Spends only with --live.
 *   export  writes the last run's leads to CSV.            Never spends.
 *   report  what the runs so far actually produced.        Never spends.
 *
 * `run` is a dry run unless `--live` is passed. A dry run makes the sourcing calls (there
 * is no way to know who is out there without them) but stops before the ten-credit
 * enrichments, and tells you exactly who it would have enriched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgent } from '../src/config.mjs';
import { estimateRun, Budget } from '../src/budget.mjs';
import { createClient } from '../src/client.mjs';
import { runAgent } from '../src/run.mjs';
import { loadState, saveState } from '../src/state.mjs';
import { toCsv } from '../src/csv.mjs';
import { formatReport, summarizeRuns } from '../src/report.mjs';
import { getDestination } from '../../integrations/outreach/destinations/index.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [, , command, agentPath, ...rest] = process.argv;

const flag = (name) => rest.includes(`--${name}`);
const option = (name, fallback) => {
    const index = rest.indexOf(`--${name}`);
    return index === -1 ? fallback : rest[index + 1];
};

const statePath = (agent) => join(root, 'runs', `${agent.id}.state.json`);
const leadsPath = (agent) => join(root, 'runs', `${agent.id}.leads.json`);

function usage() {
    console.log(`Usage:
  lead-finder plan   <agent.json>
  lead-finder run    <agent.json> [--live] [--max-credits N] [--csv out.csv]
  lead-finder export <agent.json> [--out leads.csv]
  lead-finder report <agent.json> [--stats stats.json]`);
    process.exit(1);
}

if (!command || !agentPath) usage();
const agent = loadAgent(agentPath);

if (command === 'plan') {
    const estimate = estimateRun(agent);
    console.log(`Agent: ${agent.id} — ${agent.label ?? ''}`);
    console.log(`Sources: ${agent.sources.map((s) => `${s.label ?? s.id} (${s.kind}, up to ${s.maxItems})`).join(', ')}`);
    console.log('');
    for (const line of estimate.lines) {
        console.log(`  ${line.phase.padEnd(11)} ${(line.label ?? '').padEnd(34)} ${String(line.credits).padStart(6)}  ${line.detail}`);
    }
    console.log('');
    console.log(`  Worst case: ${estimate.total} credits. Ceiling: ${estimate.ceiling}.`);
    if (estimate.capped) {
        console.log('  The ceiling is lower than the worst case, so the run will stop when it hits the ceiling.');
    }
    console.log('  Nothing has been spent. Add --live to `run` to spend.');
    process.exit(0);
}

if (command === 'report') {
    const state = loadState(statePath(agent), agent.id);
    const replyStats = option('stats') ? JSON.parse(readFileSync(option('stats'), 'utf8')) : undefined;
    console.log(formatReport(summarizeRuns(state.runs, { replyStats }), agent.id));
    process.exit(0);
}

if (command === 'export') {
    if (!existsSync(leadsPath(agent))) {
        console.error(`No run to export yet for ${agent.id}. Run \`lead-finder run ${agentPath}\` first.`);
        process.exit(1);
    }
    const leads = JSON.parse(readFileSync(leadsPath(agent), 'utf8'));
    const out = option('out', join(root, 'runs', `${agent.id}.csv`));
    writeFileSync(out, toCsv(leads));
    console.log(`${leads.length} leads written to ${out}`);
    process.exit(0);
}

if (command !== 'run') usage();

const live = flag('live');
const maxCredits = Number(option('max-credits', agent.budget.maxCreditsPerRun));
const state = loadState(statePath(agent), agent.id);
const client = createClient(process.env.LINKFINDER_API_KEY);

let pushLead;
if (live && agent.destination) {
    const destination = getDestination(agent.destination.id);
    const credentials = { apiKey: process.env[agent.destination.apiKeyEnv ?? 'INSTANTLY_API_KEY'] };
    if (!credentials.apiKey) {
        console.error(`Set ${agent.destination.apiKeyEnv ?? 'INSTANTLY_API_KEY'} to push into ${destination.label}, or drop "destination" from the agent to only export a CSV.`);
        process.exit(1);
    }
    pushLead = (lead) => destination.addLead({ credentials, target: agent.destination.target, lead });
}

const { summary, leads, skipped } = await runAgent(agent, {
    client,
    state,
    dryRun: !live,
    pushLead,
    budget: new Budget(maxCredits),
});

mkdirSync(join(root, 'runs'), { recursive: true });
saveState(statePath(agent), state);
writeFileSync(leadsPath(agent), `${JSON.stringify(leads, null, 2)}\n`);
if (option('csv')) writeFileSync(option('csv'), toCsv(leads));

console.log(`${live ? 'Live run' : 'Dry run'} — ${agent.id}`);
console.log(`  sourced ${summary.sourced} · qualified ${summary.qualified} · below threshold ${summary.belowThreshold} · rejected ${summary.rejected}`);
if (summary.rejected) console.log(`  rejected by: ${Object.entries(summary.rejectedBy).map(([rule, n]) => `${rule} ${n}`).join(', ')}`);
console.log(`  already enriched in an earlier run: ${summary.alreadyEnriched}`);
console.log(`  emails: ${summary.emailsFound}${live ? ` (${summary.enrichedNow} looked up now)` : ''} · pushed ${summary.pushed}`);
console.log(`  credits: ${summary.creditsSpent} of ${summary.creditCeiling}${summary.stoppedBy ? ` — stopped by ${summary.stoppedBy}` : ''}`);
for (const warning of summary.warnings) console.log(`  ! ${warning}`);
if (!live) {
    const would = skipped.filter((s) => s.reason === 'dry_run');
    console.log(`  would enrich ${would.length} profile(s) at 10 credits each = ${would.length * 10} credits.`);
    console.log('  Re-run with --live to spend that.');
}
