#!/usr/bin/env node
/**
 * Bundles the outreach library into a single dependency-free ESM file the
 * `outreach-push` Supabase Edge Function can import — Deno's edge runtime resolves
 * relative imports from the deploy bundle, not from this repo, so the twelve
 * destination adapters plus their shared helpers are inlined into one file rather
 * than shipped as separate modules.
 *
 * Run: node integrations/outreach/vendor.mjs
 * Output: supabase/functions/outreach-push/vendor/outreach.mjs
 *
 * After running this, redeploy the function so the live copy matches the bundle —
 * the function hashes its own bundle (`BUNDLE_SHA`) and exposes it via the
 * `{"action":"version"}` request specifically so a stale deploy is detectable
 * instead of silent.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(HERE, '..', '..', 'supabase', 'functions', 'outreach-push', 'vendor', 'outreach.mjs');

// Order matters: each file's top-level `const`/`function`/`class` must already be
// in scope by the time a later file references it, since imports between them are
// stripped rather than resolved.
const FILES = [
    'destinations/_http.mjs',
    'destinations/activecampaign.mjs',
    'destinations/clay.mjs',
    'destinations/emailbison.mjs',
    'destinations/instantly.mjs',
    'destinations/justcall.mjs',
    'destinations/lemlist.mjs',
    'destinations/outreach.mjs',
    'destinations/reply.mjs',
    'destinations/salesforge.mjs',
    'destinations/salesloft.mjs',
    'destinations/smartlead.mjs',
    'destinations/woodpecker.mjs',
    'destinations/index.mjs',
    'lead.mjs',
    'push-leads.mjs',
];

// What the edge function is allowed to import from the bundle. Deliberately
// curated rather than "everything each file happened to export" — `_http.mjs`'s
// `json` helper, for example, is unused and has no reason to leak into the
// deploy artifact.
const PUBLIC_EXPORTS = ['DestinationError', 'send', 'DESTINATIONS', 'getDestination', 'toLead', 'toLeads', 'checkDestination', 'pushLeads'];

const IMPORT_LINE = /^import\s*\{[^}]*\}\s*from\s*'\.{1,2}\/[^']*';?\s*$/;
const EXPORT_PREFIX = /^export\s+(?=(const|function|async function|class)\s)/;

function bundleFile(relativePath) {
    const source = readFileSync(path.join(HERE, relativePath), 'utf8');
    const lines = source.split('\n').filter((line) => !IMPORT_LINE.test(line.trim()));
    const stripped = lines.map((line) => line.replace(EXPORT_PREFIX, '')).join('\n').trim();
    return `// ── ${relativePath}\n${stripped}\n`;
}

/** Builds the bundle text. Exported so a test can check it without writing anything. */
export function renderBundle() {
    const header =
        '// GENERATED — do not edit. Bundled from integrations/outreach/ by vendor.mjs.\n' +
        '// Regenerate with: node integrations/outreach/vendor.mjs\n' +
        '// The comments live in the library; this is a deploy artifact.\n\n';

    const sections = FILES.map(bundleFile).join('\n');
    const exportLine = `\nexport { ${PUBLIC_EXPORTS.join(', ')} };\n`;

    // The hash covers the bundle content only, so BUNDLE_SHA is stable across
    // regenerations that don't change behavior and changes whenever they do.
    const hash = createHash('sha256').update(header + sections + exportLine).digest('hex').slice(0, 16);
    return `${header}${sections}${exportLine}export const BUNDLE_SHA = '${hash}';\n`;
}

function build() {
    const bundle = renderBundle();

    // --check compares against what is already on disk (and committed) instead of
    // writing, so CI can catch a source change whose bundle was never regenerated —
    // the deploy artifact is derived, and derived files drift silently otherwise.
    if (process.argv.includes('--check')) {
        const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : null;
        if (current !== bundle) {
            console.error(`outreach: vendor/outreach.mjs is stale — run "node integrations/outreach/vendor.mjs" and commit the result.`);
            process.exit(1);
        }
        console.log('outreach: vendor/outreach.mjs is up to date');
        return;
    }

    mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, bundle);
    console.log(`outreach: bundled ${FILES.length} files into ${path.relative(process.cwd(), OUT_PATH)}`);
}

build();
