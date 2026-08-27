/**
 * Generates Operations.gs and Help.html for the published Marketplace add-on from
 * integrations/catalog/operations.json.
 *
 * Same catalog the rest of the integrations are built from, so the add-on
 * cannot offer a lookup the API does not have, or price one wrong. The help
 * table is generated for the same reason — a documented price that disagrees
 * with the one charged is worse than no table at all.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(HERE, '..', 'catalog', 'operations.json'), 'utf8'));

const operations = catalog.operations.map((op) => ({
  type: op.type,
  label: op.label,
  category: op.categoryLabel,
  credits: op.credits,
  perEmployeeBilling: op.perEmployeeBilling,
  alwaysAsync: op.alwaysAsync,
  altType: op.altType,
  inputLabel: op.input.label,
  inputHelp: op.input.help,
  example: String(op.input.example),
  outputField: op.output.field,
  outputKind: op.output.kind,
  // A result with many fields is spread across columns rather than stringified
  // into one. `columns.default` is what is ticked when the panel opens;
  // `labels` is every field it will offer, and the header each one writes.
  columns: op.output.columns ?? null,
  labels: op.outputLabels ?? null,
  // Name lookups read several columns and join them — see buildLookupInput.
  compositeInput: op.compositeInput,
  params: op.params.map((p) => ({ name: p.name, label: p.label, type: p.type, help: p.help })),
}));

writeFileSync(
  join(HERE, 'Operations.gs'),
  `/**
 * GENERATED from integrations/catalog/operations.json. Do not edit by hand.
 * Spec version ${catalog.specVersion} — ${operations.length} lookups.
 *
 * Regenerate with: node build.mjs
 */

var LINKFINDER_API_BASE = ${JSON.stringify(catalog.apiBase)};

var LINKFINDER_OPERATIONS = ${JSON.stringify(operations, null, 2)};

/** One lookup, by its API type. */
function lfOperation(type) {
  for (var i = 0; i < LINKFINDER_OPERATIONS.length; i++) {
    if (LINKFINDER_OPERATIONS[i].type === type) return LINKFINDER_OPERATIONS[i];
  }
  return null;
}

/** The lookups, for the sidebar dropdown. */
function getOperations() {
  return LINKFINDER_OPERATIONS;
}
`,
);

// ---------------------------------------------------------------------------
// Help.html
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const priceOf = (op) =>
  op.perEmployeeBilling
    ? '0.5 / employee'
    : `${op.credits} credit${op.credits === 1 ? '' : 's'}`;

const inputOf = (op) =>
  op.compositeInput
    ? op.compositeInput.parts
        .map((p) => (p.required ? esc(p.label) : `${esc(p.label)} <span class="opt">(optional)</span>`))
        .join(' + ')
    : esc(op.inputLabel);

const byCategory = [];
for (const op of operations) {
  const group = byCategory.find((g) => g.category === op.category);
  if (group) group.operations.push(op);
  else byCategory.push({ category: op.category, operations: [op] });
}

const tables = byCategory
  .map(
    ({ category, operations: ops }) => `
<h3>${esc(category)}</h3>
<table>
  <tr><th>Lookup</th><th>Columns it reads</th><th>Cost per row</th></tr>
  ${ops
    .map(
      (op) => `<tr>
    <td>${esc(op.label)}</td>
    <td>${inputOf(op)}</td>
    <td class="price">${priceOf(op)}</td>
  </tr>`,
    )
    .join('\n  ')}
</table>`,
  )
  .join('\n');

const alwaysAsync = operations.filter((o) => o.alwaysAsync);

const cheapest = operations.reduce((a, b) => (a.credits <= b.credits ? a : b));
const dearest = operations.filter((o) => !o.perEmployeeBilling).reduce((a, b) => (a.credits >= b.credits ? a : b));

writeFileSync(
  join(HERE, 'Help.html'),
  `<!DOCTYPE html>
<html>
<head>
<base target="_top">
<!--
  GENERATED from integrations/catalog/operations.json by build.mjs. Do not edit
  by hand — the prose lives in build.mjs, the table comes from the catalog.
  Spec version ${catalog.specVersion}.
-->
<style>
  body{font-family:Roboto,Arial,sans-serif;font-size:13px;color:#202124;margin:0;padding:18px;line-height:1.5;}
  h1{font-size:16px;font-weight:500;margin:0 0 4px;}
  h2{font-size:14px;font-weight:500;margin:22px 0 6px;}
  h3{font-size:12px;font-weight:500;margin:16px 0 4px;color:#5f6368;text-transform:uppercase;letter-spacing:.4px;}
  p,li{color:#3c4043;}
  ul{margin:6px 0 0;padding-left:20px;}
  table{border-collapse:collapse;width:100%;font-size:12px;margin-top:4px;}
  th{text-align:left;font-weight:500;color:#5f6368;border-bottom:1px solid #dadce0;padding:5px 8px 5px 0;}
  td{border-bottom:1px solid #f1f3f4;padding:5px 8px 5px 0;vertical-align:top;}
  td.price,th:last-child{white-space:nowrap;text-align:right;padding-right:0;}
  .opt{color:#80868b;}
  code{background:#f1f3f4;border-radius:3px;padding:1px 4px;font-size:11.5px;}
  .note{background:#fef7e0;color:#7a4f01;padding:9px 11px;border-radius:4px;margin-top:10px;}
  a{color:#1a73e8;}
</style>
</head>
<body>

<h1>LinkFinder AI for Google Sheets</h1>
<p>Turns a column of names, emails, domains or LinkedIn URLs into the contact detail you are missing.</p>

<h2>Running a lookup</h2>
<ul>
  <li>Open <b>Extensions &rsaquo; LinkFinder AI &rsaquo; Enrich a column</b> and paste your API key
      at the top of the panel. It is saved to your Google account and asked for once.</li>
  <li>Put your data in a sheet with a header row — the add-on always starts at row&nbsp;2.</li>
  <li>Open <b>Enrich a column</b>, choose the lookup, name the columns it should read, and name an
      empty column for the answer.</li>
  <li>Answers are written row by row as they arrive, so a run that is interrupted keeps everything
      it had already found.</li>
</ul>

<h2>Matching people accurately</h2>
<p>
  The name lookups read up to four columns — name, company, location, job title — and send them as one
  description of the person. <b>Extra columns cost nothing and change the answer.</b> A name on its own
  matches thousands of people; <code>John Smith · Acme · Berlin · VP Sales</code> matches one.
</p>
<p>
  Names exported from a CRM as <code>Doe, John</code> are flipped to <code>John Doe</code> automatically.
  You do not need to clean them first.
</p>

<h2>What each lookup costs</h2>
<p>
  Prices are in credits, per row. <b>A row is charged whether or not anything is found</b> — the search
  runs either way. The cheapest lookup is ${esc(cheapest.label)} at ${priceOf(cheapest)};
  the most expensive is ${esc(dearest.label)} at ${priceOf(dearest)}.
</p>
${tables}

<h2>Not paying twice</h2>
<p>
  Any row that already has a value in the answer column is skipped and costs nothing. That is what makes
  re-running safe: fix the ten rows that failed, run it again, and only those ten are charged.
</p>

<h2>Long sheets</h2>
<p>
  Google stops any add-on after six minutes. A long run stops itself just before that, tells you the row it
  reached, and keeps everything written so far. Run it again to carry on — the finished rows are skipped.
  Expect roughly 400–600 rows per run.
</p>
<p>
  ${esc(alwaysAsync.map((o) => o.label).join(', '))} run in the background and are waited on for up to a
  minute each, so those manage nearer 5–10 rows per run. Everything else answers immediately.
</p>

<h2>What a cell can tell you</h2>
<ul>
  <li><b>A value</b> — found.</li>
  <li><b>Not found</b> — the search ran and returned nothing. This row was still charged.</li>
  <li><b>ERROR: …</b> — that row failed for a reason worth reading; the rest of the run carried on.</li>
</ul>
<div class="note">
  A rejected API key or an empty credit balance stops the whole run instead of writing the same message into
  every remaining row. The sidebar says which of the two it was.
</div>

<h2>Help</h2>
<p>
  <a href="https://linkfinderai.com/integrations.html" target="_blank" rel="noopener">Integrations and docs</a>
  · <a href="mailto:support@unlimited-leads.online">support@unlimited-leads.online</a>
</p>

</body>
</html>
`,
);

console.log(
  `add-on: generated ${operations.length} lookups and a help table from spec v${catalog.specVersion}`,
);
