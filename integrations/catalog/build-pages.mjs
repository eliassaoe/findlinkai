/**
 * Fills the generated blocks in the public documentation pages from
 * integrations/catalog/operations.json.
 *
 * The Google Sheets page told people it cost "1 credit per API request, so one
 * row costs 1 credit" for as long as it existed. Thirteen of the twenty lookups
 * cost more than that, and one costs fifty. That is not a typo anyone would
 * catch by rereading — it is what happens when a price is typed into a marketing
 * page by hand and the catalog moves on without it.
 *
 * So the price table is generated. A page opts in by marking a region:
 *
 *   <!-- LF:CREDIT-TABLE:START -->
 *   <!-- LF:CREDIT-TABLE:END -->
 *
 * CI fails if regenerating changes a committed file, which means a price shown
 * to a customer and a price charged to their account cannot disagree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const catalog = JSON.parse(readFileSync(join(HERE, 'operations.json'), 'utf8'));

const PAGES = ['linkedIn-enrichment-google-sheets.html'];

const START = '<!-- LF:CREDIT-TABLE:START -->';
const END = '<!-- LF:CREDIT-TABLE:END -->';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const price = (op) =>
  op.perEmployeeBilling ? '0.5 &times; employees' : `${op.credits}`;

// What a spreadsheet user actually needs from a column of their own: which of
// their columns feeds it, not the API's phrasing of the input.
const takes = (op) =>
  op.compositeInput
    ? op.compositeInput.parts
        .map((p) => (p.required ? esc(p.label) : `${esc(p.label)}<span style="color:var(--gray-400)"> (optional)</span>`))
        .join(' + ')
    : esc(op.input.label);

const groups = [];
for (const op of catalog.operations) {
  const group = groups.find((g) => g.label === op.categoryLabel);
  if (group) group.operations.push(op);
  else groups.push({ label: op.categoryLabel, operations: [op] });
}

const rows = groups
  .map(
    ({ label, operations }) =>
      `        <tr class="price-group"><td colspan="3">${esc(label)}</td></tr>\n` +
      operations
        .map(
          (op) =>
            `        <tr>\n` +
            `          <td>${esc(op.label)}<br><code>${esc(op.type)}</code></td>\n` +
            `          <td>${takes(op)}</td>\n` +
            `          <td>${price(op)}</td>\n` +
            `        </tr>`,
        )
        .join('\n'),
  )
  .join('\n');

const table =
  `      <table class="price-table">\n` +
  `        <tr><th>Lookup</th><th>Columns it reads</th><th>Credits per row</th></tr>\n` +
  `${rows}\n` +
  `      </table>`;

let changed = 0;
for (const page of PAGES) {
  const path = join(REPO_ROOT, page);
  const html = readFileSync(path, 'utf8');

  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from === -1 || to === -1) {
    console.error(`${page} has no ${START} / ${END} block.`);
    process.exit(1);
  }

  const next = `${html.slice(0, from + START.length)}\n${table}\n${html.slice(to)}`;
  if (next !== html) {
    writeFileSync(path, next);
    changed++;
  }
}

console.log(
  `pages: credit table for ${catalog.operations.length} lookups into ${PAGES.length} page(s)` +
    (changed ? ` (${changed} updated)` : ' (already current)'),
);
