import { FT_TOP10, FT_RETRY, FT_LINKEDIN, FT_CO_LINKEDIN } from './build.mjs';
process.stdout.write(`
const S = window.__S2, by = n => S.getNodeByName(n);
if (by('FT rescue: top 10') || by('Co rescue: pick')) { 'ALREADY APPLIED' } else {
const uid = () => crypto.randomUUID();
const ifNode = (name, pos, cond, combinator) => ({ id: uid(), name, type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 }, conditions: cond.map(c => ({ id: uid(), leftValue: c[0], rightValue: c[2] ?? '', operator: c[1] })), combinator: combinator || 'and' }, looseTypeValidation: true, options: {} } });
const T = { type: 'boolean', operation: 'true', singleValue: true };
const code = (name, pos, jsCode) => ({ id: uid(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode } });
const cred = JSON.parse(JSON.stringify(by('HTTP Request41').credentials));
const apify = (name, pos, actor, body) => ({ id: uid(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput', alwaysOutputData: true, credentials: cred,
  parameters: { method: 'POST', url: 'https://api.apify.com/v2/acts/' + actor + '/run-sync-get-dataset-items', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: body, options: { timeout: 30000 } } });
const hdr = JSON.parse(JSON.stringify(by('HTTP Request63').parameters.headerParameters));
const [x, y] = [1000, 18400];
const p5 = by('If5').position;
const nodes = [
  code('FT rescue: top 10', [x, y], ${JSON.stringify(FT_TOP10)}),
  ifNode('FT rescue: done?', [x + 220, y], [['={{ $json.found }}', T], ['={{ $json.skip }}', T]], 'or'),
  { id: uid(), name: 'FT rescue: Serper retry', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 440, y + 120], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: { method: 'POST', url: 'https://google.serper.dev/search', sendHeaders: true, specifyHeaders: 'keypair', headerParameters: hdr, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.queries) }}', options: { timeout: 15000 } } },
  code('FT rescue: pick retry', [x + 660, y + 120], ${JSON.stringify(FT_RETRY)}),
  ifNode('FT rescue: found by retry?', [x + 880, y + 120], [['={{ $json.found }}', T]]),
  apify('FT rescue: LinkedIn search', [x + 1100, y + 240], 'harvestapi~linkedin-profile-search-by-name', '={{ JSON.stringify({ profileScraperMode: "Short", firstName: $json.firstName, lastName: $json.lastName, strictSearch: true, maxPages: 1 }) }}'),
  code('FT rescue: pick LinkedIn search', [x + 1320, y + 240], ${JSON.stringify(FT_LINKEDIN)}),
  apify('Co rescue: LinkedIn company search', [p5[0] + 200, p5[1] + 350], 'harvestapi~linkedin-company', '={{ JSON.stringify({ searches: [ $("Webhook").first().json.body.input_data ] }) }}'),
  code('Co rescue: pick', [p5[0] + 420, p5[1] + 350], ${JSON.stringify(FT_CO_LINKEDIN)}),
  ifNode('Co rescue: found?', [p5[0] + 640, p5[1] + 350], [['={{ $json.bestUrl }}', { type: 'string', operation: 'equals' }, 'Not found']])
];
for (const n of nodes) S.addNode(n);
const C = (a, ai, b) => S.addConnection({ connection: [{ node: a, type: 'main', index: ai }, { node: b, type: 'main', index: 0 }] });
S.removeConnection({ connection: [{ node: 'HTTP Request63', type: 'main', index: 0 }, { node: 'Respond to Webhook80', type: 'main', index: 0 }] });
S.removeConnection({ connection: [{ node: 'If5', type: 'main', index: 1 }, { node: 'Respond to Webhook14', type: 'main', index: 0 }] });
C('HTTP Request63', 0, 'FT rescue: top 10');
C('FT rescue: top 10', 0, 'FT rescue: done?');
C('FT rescue: done?', 0, 'Respond to Webhook80');
C('FT rescue: done?', 1, 'FT rescue: Serper retry');
C('FT rescue: Serper retry', 0, 'FT rescue: pick retry');
C('FT rescue: pick retry', 0, 'FT rescue: found by retry?');
C('FT rescue: found by retry?', 0, 'Respond to Webhook80');
C('FT rescue: found by retry?', 1, 'FT rescue: LinkedIn search');
C('FT rescue: LinkedIn search', 0, 'FT rescue: pick LinkedIn search');
C('FT rescue: pick LinkedIn search', 0, 'Respond to Webhook80');
C('If5', 1, 'Co rescue: LinkedIn company search');
C('Co rescue: LinkedIn company search', 0, 'Co rescue: pick');
C('Co rescue: pick', 0, 'Co rescue: found?');
C('Co rescue: found?', 0, 'Respond to Webhook14');
C('Co rescue: found?', 1, 'Respond to Webhook6');
const o = n => (S.outgoingConnectionsByNodeName(n).main||[]).map(a=>(a||[]).map(c=>c.node).join('+')).join(' | ');
JSON.stringify(['HTTP Request63','FT rescue: done?','FT rescue: found by retry?','FT rescue: pick LinkedIn search','If5','Co rescue: found?'].map(n => n + ' => ' + o(n)));
}`);
