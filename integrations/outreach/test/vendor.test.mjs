/**
 * The Supabase Edge Function does not import integrations/outreach/ directly — Deno
 * resolves relative imports from the deploy bundle, not from this repo — so it runs
 * off `supabase/functions/outreach-push/vendor/outreach.mjs`, a generated copy. If a
 * destination adapter changes here and nobody re-runs `vendor.mjs`, the deployed
 * function silently keeps running the old code. This is what would have caught it:
 * a source change with no matching bundle regeneration fails the suite.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { renderBundle } from '../vendor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = path.join(HERE, '..', '..', '..', 'supabase', 'functions', 'outreach-push', 'vendor', 'outreach.mjs');

test('the committed vendor bundle matches what vendor.mjs would generate right now', () => {
    assert.ok(existsSync(BUNDLE_PATH), `${BUNDLE_PATH} is missing — run node integrations/outreach/vendor.mjs`);
    const committed = readFileSync(BUNDLE_PATH, 'utf8');
    const fresh = renderBundle();
    assert.strictEqual(committed, fresh,
        'vendor/outreach.mjs is stale — run "node integrations/outreach/vendor.mjs" and commit the result, then redeploy the edge function');
});

test('the bundle is syntactically valid and exports what the edge function imports', async () => {
    const mod = await import(BUNDLE_PATH);
    for (const name of ['pushLeads', 'checkDestination', 'DESTINATIONS', 'BUNDLE_SHA']) {
        assert.ok(name in mod, `bundle does not export "${name}", which index.ts imports`);
    }
    assert.strictEqual(Object.keys(mod.DESTINATIONS).length, 12);
});
