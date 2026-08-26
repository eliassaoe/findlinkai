/**
 * Builds integrations/catalog/operations.json — the single source every platform
 * wrapper (Zapier, Make, n8n, Nango, the outreach connectors) is generated from.
 *
 * Behaviour comes from openapi.json: which operations exist, what each costs,
 * whether it is async, what its input looks like. Presentation comes from
 * overlay.json: labels, categories, which extra params apply.
 *
 * The point of splitting them is drift. Five hand-written integrations diverge the
 * moment an endpoint changes; this build refuses to run when the two files disagree,
 * so adding an operation to the spec forces it through every platform at once.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

const spec = JSON.parse(readFileSync(join(REPO_ROOT, 'openapi.json'), 'utf8'));
const overlay = JSON.parse(readFileSync(join(HERE, 'overlay.json'), 'utf8'));

const problems = [];
const fail = (msg) => problems.push(msg);

const specOps = spec['x-linkfinder-operations'];
if (!specOps) fail('openapi.json has no x-linkfinder-operations block.');

const requestSchema = spec.components?.schemas?.EnrichmentRequest;
if (!requestSchema) fail('openapi.json has no EnrichmentRequest schema.');

const enumTypes = requestSchema?.properties?.type?.enum ?? [];
const specTypes = Object.keys(specOps ?? {});
const overlayTypes = Object.keys(overlay.operations);

// The three lists that must agree: the request enum, the operation detail block,
// and the overlay. Any one drifting silently would ship a broken integration.
for (const type of enumTypes) {
  if (!specTypes.includes(type)) fail(`"${type}" is in the request enum but has no x-linkfinder-operations entry.`);
}
for (const type of specTypes) {
  if (!enumTypes.includes(type)) fail(`"${type}" is documented but missing from the request type enum.`);
  if (!overlayTypes.includes(type)) fail(`"${type}" is in the spec but not described in overlay.json — add a label and category for it.`);
}
for (const type of overlayTypes) {
  if (!specTypes.includes(type)) fail(`"${type}" is in overlay.json but no longer in the spec — remove it.`);
}

// Every extra param an overlay operation claims must be a real request field.
const requestFields = Object.keys(requestSchema?.properties ?? {});
for (const [type, entry] of Object.entries(overlay.operations)) {
  for (const param of entry.params ?? []) {
    if (!requestFields.includes(param)) fail(`"${type}" claims param "${param}", which EnrichmentRequest does not accept.`);
    if (!overlay.params[param]) fail(`"${type}" claims param "${param}", which overlay.json does not describe.`);
  }
  if (!overlay.categories[entry.category]) fail(`"${type}" is in unknown category "${entry.category}".`);

  // Every platform needs sample output to render field pickers; a missing or
  // mislabelled shape ships an integration whose output mapping is a guess.
  const output = entry.output;
  if (!output) {
    fail(`"${type}" has no output shape in overlay.json.`);
  } else if (!['scalar', 'object', 'list'].includes(output.kind)) {
    fail(`"${type}" has unknown output kind "${output.kind}".`);
  } else if (output.kind === 'scalar' && !output.field) {
    fail(`"${type}" returns a scalar but names no field for it.`);
  } else if (output.sample === undefined) {
    fail(`"${type}" has no sample output.`);
  }
}

// Zapier/Make/n8n all key modules off `key`; a collision would silently shadow one.
const seenKeys = new Map();
for (const [type, entry] of Object.entries(overlay.operations)) {
  if (seenKeys.has(entry.key)) fail(`key "${entry.key}" is used by both ${seenKeys.get(entry.key)} and ${type}.`);
  seenKeys.set(entry.key, type);
}

if (problems.length) {
  console.error('Catalog build failed — openapi.json and overlay.json disagree:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const operations = specTypes
  .map((type) => {
    const s = specOps[type];
    const o = overlay.operations[type];
    return {
      type,
      key: o.key,
      label: o.label,
      category: o.category,
      categoryLabel: overlay.categories[o.category].label,
      credits: s.credits,
      // `async: true` means it ALWAYS returns 202. Everything else can still fall
      // back to 202 under load, so wrappers must handle the job branch regardless.
      alwaysAsync: Boolean(s.async),
      perEmployeeBilling: /0\.5 credits per employee/.test(s.note ?? ''),
      input: {
        label: o.inputLabel,
        help: o.inputHelp,
        // The spec's phrasing is the contract; the overlay's is the UI copy.
        specDescription: s.input,
        example: s.example,
      },
      params: (o.params ?? []).map((name) => ({ name, ...overlay.params[name] })),
      output: o.output,
      note: s.note ?? null,
    };
  })
  .sort((a, b) => {
    const byCategory = overlay.categories[a.category].order - overlay.categories[b.category].order;
    if (byCategory !== 0) return byCategory;
    return a.credits - b.credits || a.label.localeCompare(b.label);
  });

const catalog = {
  $comment: 'GENERATED by integrations/catalog/build.mjs from openapi.json + overlay.json. Do not edit by hand.',
  specVersion: spec.info.version,
  apiBase: spec.servers?.[0]?.url ?? 'https://api.linkfinderai.com',
  categories: overlay.categories,
  params: overlay.params,
  operations,
};

writeFileSync(join(HERE, 'operations.json'), `${JSON.stringify(catalog, null, 2)}\n`);

const asyncCount = operations.filter((o) => o.alwaysAsync).length;
const byKind = operations.reduce((acc, o) => {
  acc[o.output.kind] = (acc[o.output.kind] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `catalog: ${operations.length} operations from spec v${catalog.specVersion} ` +
    `(${asyncCount} always-async, ${operations.length - asyncCount} sync; ` +
    `${byKind.scalar} scalar, ${byKind.object} object, ${byKind.list} list results)`,
);
