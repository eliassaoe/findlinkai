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

  // A composite input must name a required first part, or a wrapper would build
  // its joined string entirely out of optional fields and post an empty input.
  const composite = entry.compositeInput;
  if (composite) {
    if (!Array.isArray(composite.parts) || !composite.parts.length) {
      fail(`"${type}" has a compositeInput with no parts.`);
    } else {
      if (!composite.parts[0].required) fail(`"${type}" has a compositeInput whose first part is not required.`);
      for (const part of composite.parts) {
        if (!part.name || !part.label) fail(`"${type}" has a compositeInput part missing a name or label.`);
      }
    }
  }

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

  // A result with many fields has to be spread across columns, so each one needs
  // to say which fields are worth a column and which cannot live in a cell at all.
  // Without this a 10-credit profile lookup lands as JSON in a single cell.
  if (output && output.kind !== 'scalar') {
    const columns = output.columns;
    const sample = Array.isArray(output.sample) ? output.sample[0] : output.sample;
    const keys = Object.keys(sample ?? {});

    if (!columns) {
      fail(`"${type}" returns a ${output.kind} but names no columns — see output.columns in overlay.json.`);
    } else if (!Array.isArray(columns.default) || !columns.default.length) {
      fail(`"${type}" has no default columns, so it would write nothing by default.`);
    } else {
      for (const field of [...columns.default, ...(columns.skip ?? [])]) {
        if (!keys.includes(field)) fail(`"${type}" names column "${field}", which its sample output does not have.`);
      }
      for (const field of columns.default) {
        if ((columns.skip ?? []).includes(field)) fail(`"${type}" both defaults to and skips "${field}".`);
      }
      const offered = keys.filter((k) => !(columns.skip ?? []).includes(k));
      if (!offered.length) fail(`"${type}" skips every field it returns.`);
    }
  }


  // A resource/operation pair is a public identifier that saved n8n workflows store,
  // so renaming one silently breaks every workflow using it. They are pinned here and
  // checked rather than derived from the label. (The node is not on npm yet, so no
  // published workflow depends on them today — but the moment it is, this is what
  // stops a label tidy-up from becoming a breaking change.)
  const n8n = entry.n8n;
  if (!n8n) {
    fail(`"${type}" has no n8n resource/operation mapping.`);
  } else if (!overlay.n8nResources[n8n.resource]) {
    fail(`"${type}" maps to unknown n8n resource "${n8n.resource}".`);
  }
}

const seenN8n = new Map();
for (const [type, entry] of Object.entries(overlay.operations)) {
  if (!entry.n8n) continue;
  const pair = `${entry.n8n.resource}/${entry.n8n.operation}`;
  if (seenN8n.has(pair)) fail(`n8n pair "${pair}" is claimed by both ${seenN8n.get(pair)} and ${type}.`);
  seenN8n.set(pair, type);
}

for (const [resource, meta] of Object.entries(overlay.n8nResources)) {
  const pair = `${resource}/${meta.default}`;
  if (!seenN8n.has(pair)) fail(`n8n resource "${resource}" defaults to "${meta.default}", which no operation provides.`);
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

// Turns a result field name into the header a spreadsheet shows. Overrides come
// from overlay.json for the ones a machine gets wrong (`jobTitle`, `mobileNumber`).
const labelise = (key) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUrl\b/, 'URL')
    .replace(/\bLinkedin\b/, 'LinkedIn');

function labelsFor(output) {
  const sample = Array.isArray(output.sample) ? output.sample[0] : output.sample;
  const skip = new Set(output.columns?.skip ?? []);
  const labels = {};
  for (const key of Object.keys(sample ?? {})) {
    if (skip.has(key)) continue;
    labels[key] = overlay.fieldLabels?.[key] ?? labelise(key);
  }
  return labels;
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
      // Labels for the columns a multi-field result writes. Resolved here so no
      // wrapper has to guess that `mobileNumber` is shown to a user as "Phone".
      outputLabels: o.output.kind === 'scalar' ? null : labelsFor(o.output),
      n8n: o.n8n,
      // Only set where the sources disagree about an operation's type name. Wrappers
      // send `type` and retry `altType` once on a 422.
      altType: o.altType ?? null,
      // Present only where the API's single input_data is built from several
      // user-supplied fields rather than being one value.
      compositeInput: o.compositeInput ?? null,
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
  n8nResources: overlay.n8nResources,
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
