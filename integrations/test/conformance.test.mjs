/**
 * The check that makes "one source of truth" true rather than aspirational.
 *
 * Each platform has its own tests for its own behaviour. This asserts the thing none
 * of them can see on their own: that all four generated integrations describe the
 * *same* set of operations as the spec, and that the generators would refuse to run
 * if the spec and the overlay ever disagreed.
 */
import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(ROOT);

const spec = JSON.parse(readFileSync(join(REPO, 'openapi.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog', 'operations.json'), 'utf8'));

const types = catalog.operations.map((o) => o.type).sort();

test('the catalog covers exactly the operations the spec declares', () => {
    assert.deepStrictEqual(types, Object.keys(spec['x-linkfinder-operations']).sort());
    assert.deepStrictEqual(types, [...spec.components.schemas.EnrichmentRequest.properties.type.enum].sort());
});

test('the committed catalog is what the generator produces', () => {
    // Guards against someone editing operations.json by hand, which would make every
    // downstream integration disagree with the spec while still looking generated.
    const before = readFileSync(join(ROOT, 'catalog', 'operations.json'), 'utf8');
    execFileSync('node', [join(ROOT, 'catalog', 'build.mjs')], { stdio: 'pipe' });
    assert.strictEqual(readFileSync(join(ROOT, 'catalog', 'operations.json'), 'utf8'), before);
});

test('credit costs match the spec, including the expensive ones', () => {
    for (const op of catalog.operations) {
        assert.strictEqual(op.credits, spec['x-linkfinder-operations'][op.type].credits, `${op.type} cost drifted`);
    }
    // The three the public docs page currently gets wrong, pinned so they cannot
    // quietly become 1 again.
    const cost = Object.fromEntries(catalog.operations.map((o) => [o.type, o.credits]));
    assert.strictEqual(cost.linkedin_profile_to_phone, 50);
    assert.strictEqual(cost.linkedin_profile_to_email, 10);
    assert.strictEqual(cost.lead_full_name_to_email, 7);
});

test('Zapier has one search per operation, posting the right type', () => {
    const searches = readdirSync(join(ROOT, 'zapier', 'searches')).filter((f) => f !== 'index.js');
    assert.strictEqual(searches.length, catalog.operations.length);

    for (const op of catalog.operations) {
        const source = readFileSync(join(ROOT, 'zapier', 'searches', `${op.key}.js`), 'utf8');
        assert.match(source, new RegExp(`"type": "${op.type}"`), `${op.key} does not post ${op.type}`);
    }
});

test('Make has one module per operation, posting the right type', () => {
    const modules = readdirSync(join(ROOT, 'make', 'modules'));
    assert.strictEqual(modules.length, catalog.operations.length);

    for (const op of catalog.operations) {
        const api = JSON.parse(readFileSync(join(ROOT, 'make', 'modules', op.key, 'api.imljson'), 'utf8'));
        assert.strictEqual(api[0].body.type, op.type);
    }
});

test('the n8n node maps every operation, and none it should not', () => {
    const source = readFileSync(join(REPO, 'n8n-nodes-linkfinderai', 'nodes', 'LinkFinderAi', 'generated', 'operations.ts'), 'utf8');
    const map = JSON.parse(source.match(/OPERATION_TYPE_MAP: Record<string, Record<string, string>> = (\{.*?\});$/ms)[1]);
    const mapped = Object.values(map).flatMap((operations) => Object.values(operations));

    assert.strictEqual(mapped.length, catalog.operations.length, 'n8n maps a different number of operations');

    for (const op of catalog.operations) {
        assert.ok(mapped.includes(op.type), `n8n does not map ${op.type}`);
    }
    // The published node used to post a type the API does not accept.
    assert.ok(!source.includes('instagram_profile_to_instagram_info'), 'n8n still maps the invalid Instagram type');
});

test('every always-async operation is marked as such everywhere', () => {
    const specAsync = Object.entries(spec['x-linkfinder-operations'])
        .filter(([, v]) => v.async)
        .map(([k]) => k)
        .sort();

    assert.deepStrictEqual(catalog.operations.filter((o) => o.alwaysAsync).map((o) => o.type).sort(), specAsync);

    const n8nSource = readFileSync(join(REPO, 'n8n-nodes-linkfinderai', 'nodes', 'LinkFinderAi', 'generated', 'operations.ts'), 'utf8');
    const declared = JSON.parse(n8nSource.match(/ALWAYS_ASYNC_TYPES = new Set<string>\((\[[^\]]*\])\)/)[1]);
    assert.deepStrictEqual([...declared].sort(), specAsync);
});

test('optional params reach every operation that accepts them', () => {
    // All three employee-list operations take the filters, not just the domain one —
    // which is what the hand-written n8n node got wrong.
    const withFilters = catalog.operations
        .filter((o) => o.params.some((p) => p.name === 'department'))
        .map((o) => o.type)
        .sort();

    assert.deepStrictEqual(withFilters, [
        'company_domain_to_employees',
        'company_name_to_employees',
        'linkedin_company_to_employees',
    ]);

    for (const op of catalog.operations.filter((o) => o.params.length)) {
        const api = JSON.parse(readFileSync(join(ROOT, 'make', 'modules', op.key, 'api.imljson'), 'utf8'));
        for (const param of op.params) {
            assert.strictEqual(api[0].body[param.name], `{{parameters.${param.name}}}`, `Make ${op.key} drops ${param.name}`);
        }
    }
});

test('the catalog build refuses to run when the spec and the overlay disagree', () => {
    // The drift guard is the reason any of this holds. Prove it actually fires by
    // removing an operation from a throwaway copy of the overlay.
    const scratch = mkdtempSync(join(tmpdir(), 'lf-catalog-'));
    cpSync(REPO, scratch, {
        recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('/.git'),
    });

    const overlayPath = join(scratch, 'integrations', 'catalog', 'overlay.json');
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
    delete overlay.operations.linkedin_profile_to_phone;
    writeFileSync(overlayPath, JSON.stringify(overlay, null, 2));

    assert.throws(
        () => execFileSync('node', [join(scratch, 'integrations', 'catalog', 'build.mjs')], { stdio: 'pipe' }),
        (error) => {
            assert.match(error.stderr.toString(), /linkedin_profile_to_phone.*not described in overlay/s);
            return true;
        },
        'the catalog build accepted an operation missing from the overlay',
    );
});
