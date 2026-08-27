/**
 * Generates nodes/LinkFinderAi/generated/operations.ts from
 * integrations/catalog/operations.json.
 *
 * The node used to carry a hand-maintained operation map, which had drifted: four
 * operations were missing entirely, Instagram pointed at a type the API does not
 * accept, and the employee filters were wired to only one of the three operations
 * that take them. Generating it means the node cannot fall behind the spec again.
 *
 * Run `node build.mjs` after the catalog changes, then `npm run build`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(HERE, '..', 'integrations', 'catalog', 'operations.json'), 'utf8'));

const OUT_DIR = join(HERE, 'nodes', 'LinkFinderAi', 'generated');
mkdirSync(OUT_DIR, { recursive: true });

const q = (v) => JSON.stringify(v);
const credits = (n) => (n === 1 ? '1 credit' : `${n} credits`);

const byResource = new Map();
for (const op of catalog.operations) {
  if (!byResource.has(op.n8n.resource)) byResource.set(op.n8n.resource, []);
  byResource.get(op.n8n.resource).push(op);
}

// n8n's lint rules want option lists alphabetised by display name.
const alphabetical = (a, b) => a.n8n.name.localeCompare(b.n8n.name);

// ── resource picker ─────────────────────────────────────────────────────────────
// "Job" is not a catalog operation — it is the node's own way to resume an async
// lookup from a later node — so it is appended by hand rather than generated.

const resourceOptions = Object.entries(catalog.n8nResources)
  .map(([value, meta]) => ({ name: meta.label, value }))
  .concat([{ name: 'Job', value: 'job' }])
  .sort((a, b) => a.name.localeCompare(b.name));

// ── operation pickers, one per resource ─────────────────────────────────────────

const operationProperties = Object.entries(catalog.n8nResources).map(([resource, meta]) => {
  const ops = [...(byResource.get(resource) ?? [])].sort(alphabetical);

  const options = ops.map((op) => {
    // Cost belongs in the picker: someone choosing "URL → Phone" over "URL → Email"
    // is choosing 50 credits over 10, and the node is where they decide.
    const cost = op.perEmployeeBilling ? '0.5 credits per employee returned' : credits(op.credits);
    const description = [op.n8n.description, `Costs ${cost}`].filter(Boolean).join('. ');

    return {
      name: op.n8n.name,
      value: op.n8n.operation,
      description: `${description}.`,
      action: op.n8n.action,
    };
  });

  return {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: [resource] } },
    default: meta.default,
    options,
  };
});

// n8n parameter names are camelCase by convention; the catalog's part names are
// the API's snake_case. One place converts, so the property and the run-time map
// cannot disagree.
const partParameter = (name) => name.replace(/_(\w)/g, (_, c) => c.toUpperCase());

// ── per-operation input labelling ───────────────────────────────────────────────
// One shared Input field would have to describe every operation at once. Instead each
// operation gets its own, shown only for its resource/operation pair, so the label and
// placeholder say exactly what to paste in.

// A composite lookup takes ONE string built from several fields. A single Input
// box meant a workflow could only ever send the name, while app.html sends the
// name, the company, the location and the job title — same price, far better
// match. Each part gets its own field, named after the part so the node's own
// runtime can join them back in the catalog's order.
const inputProperties = catalog.operations.flatMap((op) => {
  const show = { resource: [op.n8n.resource], operation: [op.n8n.operation] };

  if (!op.compositeInput) {
    return [
      {
        displayName: op.input.label,
        name: 'inputData',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show },
        description: op.input.help,
        placeholder: `e.g. ${op.input.example}`,
      },
    ];
  }

  return op.compositeInput.parts.map((part) => ({
    displayName: part.label,
    name: partParameter(part.name),
    type: 'string',
    default: '',
    ...(part.required ? { required: true } : {}),
    displayOptions: { show },
    description: part.required
      ? part.help
      : `${part.help} Optional and free — it costs no extra credits and narrows the match.`,
    placeholder: `e.g. ${part.example}`,
  }));
});

// ── optional params, shown only where the API accepts them ──────────────────────

const PARAM_FIELD = {
  department: { displayName: 'Department', name: 'department', type: 'string', default: '' },
  seniority: { displayName: 'Seniority', name: 'seniority', type: 'string', default: '' },
  employee_count: {
    displayName: 'Max Employees',
    name: 'employeeCount',
    type: 'number',
    default: 20,
    typeOptions: { minValue: 1 },
  },
  fetch_count: {
    displayName: 'Number of Leads',
    name: 'fetchCount',
    type: 'number',
    default: 10,
    typeOptions: { minValue: 1, maxValue: 100 },
  },
};

const paramUsage = new Map();
for (const op of catalog.operations) {
  for (const param of op.params) {
    if (!paramUsage.has(param.name)) paramUsage.set(param.name, { param, ops: [] });
    paramUsage.get(param.name).ops.push(op);
  }
}

const paramProperties = [...paramUsage.entries()].map(([name, { param, ops }]) => ({
  ...PARAM_FIELD[name],
  description: param.help,
  displayOptions: {
    show: {
      resource: [...new Set(ops.map((o) => o.n8n.resource))],
      operation: [...new Set(ops.map((o) => o.n8n.operation))],
    },
  },
}));

// ── run-time maps ───────────────────────────────────────────────────────────────

const typeMap = {};
for (const op of catalog.operations) {
  typeMap[op.n8n.resource] ??= {};
  typeMap[op.n8n.resource][op.n8n.operation] = op.type;
}

// Which API field each n8n parameter maps to, and which types accept it.
const paramMap = catalog.operations
  .filter((op) => op.params.length)
  .reduce((acc, op) => {
    acc[op.type] = op.params.map((p) => ({ api: p.name, node: PARAM_FIELD[p.name].name }));
    return acc;
  }, {});

// Which node parameters to join, in order, for each composite lookup.
const compositeMap = Object.fromEntries(
  catalog.operations
    .filter((op) => op.compositeInput)
    .map((op) => [
      op.type,
      {
        joinWith: op.compositeInput.joinWith ?? ' ',
        parts: op.compositeInput.parts.map((part) => ({
          api: part.name,
          node: partParameter(part.name),
          label: part.label,
          required: Boolean(part.required),
        })),
      },
    ]),
);

const alwaysAsync = catalog.operations.filter((op) => op.alwaysAsync).map((op) => op.type);

// Only populated where the sources disagree about an operation's name.
const altTypes = Object.fromEntries(
  catalog.operations.filter((op) => op.altType).map((op) => [op.type, op.altType]),
);

const source = `// GENERATED by build.mjs from integrations/catalog/operations.json. Do not edit.
//
// Spec version ${catalog.specVersion} — ${catalog.operations.length} operations.

import type { INodeProperties } from 'n8n-workflow';

/** resource/operation -> the \`type\` value LinkFinder AI's single endpoint expects. */
export const OPERATION_TYPE_MAP: Record<string, Record<string, string>> = ${q(typeMap)
  .replace(/","/g, '", "')};

/**
 * Operations that ALWAYS return 202 with a job id. Everything else is normally sync
 * but can fall back to the same shape once a lookup runs past the API's sync window,
 * so the async branch is still taken on the response, not on this list. What this list
 * changes is the default wait: an always-async operation needs a longer one.
 */
export const ALWAYS_ASYNC_TYPES = new Set<string>(${q(alwaysAsync)});

/**
 * Fallback type names, for operations whose name differs between the spec and the
 * published docs. The node sends the key and retries the value once on a 422.
 */
export const ALT_TYPES: Record<string, string> = ${q(altTypes)};

/**
 * Lookups whose single \`input_data\` is built from several node parameters, in this
 * order. Empty parts are dropped — the same string app.html builds.
 */
export const COMPOSITE_INPUTS: Record<
  string,
  { joinWith: string; parts: Array<{ api: string; node: string; label: string; required: boolean }> }
> = ${q(compositeMap)};

/** Optional request fields, per type, with the node parameter each reads from. */
export const OPTIONAL_PARAMS: Record<string, Array<{ api: string; node: string }>> = ${q(paramMap)};

/** Credits per call, for the run-time note attached to each result. */
export const CREDIT_COST: Record<string, number> = ${q(
  Object.fromEntries(catalog.operations.map((op) => [op.type, op.credits])),
)};

export const RESOURCE_PROPERTY: INodeProperties = ${q({
  displayName: 'Resource',
  name: 'resource',
  type: 'options',
  noDataExpression: true,
  default: 'lead',
  options: resourceOptions,
})} as INodeProperties;

export const OPERATION_PROPERTIES: INodeProperties[] = ${q(operationProperties)} as INodeProperties[];

export const INPUT_PROPERTIES: INodeProperties[] = ${q(inputProperties)} as INodeProperties[];

export const PARAM_PROPERTIES: INodeProperties[] = ${q(paramProperties)} as INodeProperties[];
`;

writeFileSync(join(OUT_DIR, 'operations.ts'), source);

console.log(
  `n8n: generated ${catalog.operations.length} operations across ` +
    `${Object.keys(catalog.n8nResources).length} resources (spec v${catalog.specVersion})`,
);
