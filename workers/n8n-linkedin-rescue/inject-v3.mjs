// Replaces the code of the existing rescue nodes in place (same names, same wiring).
import { LI_PREP, LI_LINKEDIN, FT_PREP, FT_LINKEDIN2 } from './build.mjs';
import { writeFileSync } from 'node:fs';
const mk = (store, map) => `const S = window.${store}, by = n => S.getNodeByName(n);
const want = ${JSON.stringify(map)};
const out = [];
for (const [name, jsCode] of Object.entries(want)) {
  const node = by(name); if (!node) { out.push(name + ': MISSING'); continue; }
  try { S.setNodeParameters({ name, value: { ...JSON.parse(JSON.stringify(node.parameters)), jsCode } }); } catch (e) { out.push(name + ': setNodeParameters failed ' + e.message); }
  out.push(name + ': ' + (by(name).parameters.jsCode === jsCode ? 'updated' : 'NOT updated'));
}
JSON.stringify(out);`;
const dir = process.argv[2];
writeFileSync(dir + '/v3-app.js', mk('__S', { 'LI rescue: prepare': LI_PREP, 'LI rescue: pick LinkedIn search': LI_LINKEDIN }));
writeFileSync(dir + '/v3-free.js', mk('__S2', { 'FT rescue: prepare': FT_PREP, 'FT rescue: pick LinkedIn search': FT_LINKEDIN2 }));
