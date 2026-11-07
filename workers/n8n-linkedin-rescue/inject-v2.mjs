// Editor scripts that strip the Google top-10 / retry nodes and leave only the Apify backup.
import { LI_PREP, FT_PREP, FT_LINKEDIN2 } from './build.mjs';
const common = `
const uid = () => crypto.randomUUID(), by = n => S.getNodeByName(n);
const C = (a, ai, b) => S.addConnection({ connection: [{ node: a, type: 'main', index: ai }, { node: b, type: 'main', index: 0 }] });
const drop = names => { const kill = new Set(names); const c = JSON.parse(JSON.stringify(S.connectionsBySourceNode)); for (const n of names) delete c[n]; for (const src of Object.keys(c)) for (const type of Object.keys(c[src])) c[src][type] = (c[src][type] || []).map(arr => (arr || []).filter(x => !kill.has(x.node))); S.setConnections(c); for (const n of names) { const node = by(n); if (node) S.removeNode(node); } };
const o = n => (S.outgoingConnectionsByNodeName(n).main||[]).map(a=>(a||[]).map(c=>c.node).join('+')).join(' | ');
const code = (name, pos, jsCode) => ({ id: uid(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode } });
`;
const v4 = `const S = window.__S;${common}
if (by('LI rescue: prepare')) { 'ALREADY v2' } else {
const pos = by('LI rescue: top 10').position;
drop(['LI rescue: top 10', 'LI rescue: found in top 10?', 'LI rescue: Serper retry', 'LI rescue: pick retry', 'LI rescue: found by retry?']);
S.addNode(code('LI rescue: prepare', pos, ${JSON.stringify(LI_PREP)}));
C('If35', 1, 'LI rescue: prepare');
C('LI rescue: prepare', 0, 'LI rescue: has company?');
C('LI rescue: has company?', 0, 'LI rescue: LinkedIn search');
JSON.stringify(['If35','LI rescue: prepare','LI rescue: has company?','LI rescue: LinkedIn search','LI rescue: pick LinkedIn search','LI rescue: found by LinkedIn search?','If34','Co rescue: found?'].map(n => n + ' => ' + o(n)).concat([S.allNodes.filter(n=>/rescue/.test(n.name)).length + ' rescue nodes']));
}`;
const free = `const S = window.__S2;${common}
if (by('FT rescue: prepare')) { 'ALREADY v2' } else {
const pos = by('FT rescue: top 10').position, posPick = by('FT rescue: pick LinkedIn search').position;
drop(['FT rescue: top 10', 'FT rescue: Serper retry', 'FT rescue: pick retry', 'FT rescue: found by retry?', 'FT rescue: pick LinkedIn search']);
S.addNode(code('FT rescue: prepare', pos, ${JSON.stringify(FT_PREP)}));
S.addNode(code('FT rescue: pick LinkedIn search', posPick, ${JSON.stringify(FT_LINKEDIN2)}));
C('HTTP Request63', 0, 'FT rescue: prepare');
C('FT rescue: prepare', 0, 'FT rescue: done?');
C('FT rescue: done?', 1, 'FT rescue: LinkedIn search');
C('FT rescue: LinkedIn search', 0, 'FT rescue: pick LinkedIn search');
C('FT rescue: pick LinkedIn search', 0, 'Respond to Webhook80');
JSON.stringify(['HTTP Request63','FT rescue: prepare','FT rescue: done?','FT rescue: LinkedIn search','FT rescue: pick LinkedIn search','If5','Co rescue: found?'].map(n => n + ' => ' + o(n)).concat([S.allNodes.filter(n=>/rescue/.test(n.name)).length + ' rescue nodes']));
}`;
import { writeFileSync } from 'node:fs';
const dir = process.argv[2];
writeFileSync(dir + '/v2-app.js', v4); writeFileSync(dir + '/v2-free.js', free);
