// Prints the browser-side script that adds the rescue nodes to "linkfinder ai app v 4".
import { LI_TOP10, LI_RETRY, LI_LINKEDIN, CO_LINKEDIN } from './build.mjs';
const script = `
const S = window.__S, by = n => S.getNodeByName(n);
if (by('LI rescue: top 10') || by('Co rescue: pick')) { 'ALREADY APPLIED' } else {
const uid = () => crypto.randomUUID();
const ifNode = (name, pos, left, op) => ({ id: uid(), name, type: 'n8n-nodes-base.if', typeVersion: 2.3, position: pos, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 }, conditions: [{ id: uid(), leftValue: left, rightValue: op.right ?? '', operator: op.operator }], combinator: 'and' }, looseTypeValidation: true, options: {} } });
const isTrue = { operator: { type: 'boolean', operation: 'true', singleValue: true } };
const isFalse = { operator: { type: 'boolean', operation: 'false', singleValue: true } };
const code = (name, pos, jsCode) => ({ id: uid(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode } });
const apifyCred = JSON.parse(JSON.stringify(by('HTTP Request84').credentials));
const apify = (name, pos, actor, body) => ({ id: uid(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput', alwaysOutputData: true,
  credentials: apifyCred, parameters: { method: 'POST', url: 'https://api.apify.com/v2/acts/' + actor + '/run-sync-get-dataset-items', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth', sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: body, options: { timeout: 30000 } } });
const serperHeaders = JSON.parse(JSON.stringify(by('HTTP Request64').parameters.headerParameters));
const [x, y] = [41300, 15650];
const nodes = [
  code('LI rescue: top 10', [x, y], ${JSON.stringify(LI_TOP10)}),
  ifNode('LI rescue: found in top 10?', [x + 220, y], '={{ $json.found }}', isTrue),
  ifNode('LI rescue: has company?', [x + 440, y + 120], '={{ $json.skip }}', isFalse),
  { id: uid(), name: 'LI rescue: Serper retry', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x + 660, y + 120], onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: { method: 'POST', url: 'https://google.serper.dev/search', sendHeaders: true, specifyHeaders: 'keypair', headerParameters: serperHeaders, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.queries) }}', options: { timeout: 15000 } } },
  code('LI rescue: pick retry', [x + 880, y + 120], ${JSON.stringify(LI_RETRY)}),
  ifNode('LI rescue: found by retry?', [x + 1100, y + 120], '={{ $json.found }}', isTrue),
  apify('LI rescue: LinkedIn search', [x + 1320, y + 240], 'harvestapi~linkedin-profile-search-by-name', '={{ JSON.stringify({ profileScraperMode: "Short", firstName: $json.firstName, lastName: $json.lastName, strictSearch: true, maxPages: 1 }) }}'),
  code('LI rescue: pick LinkedIn search', [x + 1540, y + 240], ${JSON.stringify(LI_LINKEDIN)}),
  ifNode('LI rescue: found by LinkedIn search?', [x + 1760, y + 240], '={{ $json.found }}', isTrue),
  apify('Co rescue: LinkedIn company search', [39600, 2900], 'harvestapi~linkedin-company', '={{ JSON.stringify({ searches: [ $("Webhook1").first().json.body.input_data ] }) }}'),
  code('Co rescue: pick', [39820, 2900], ${JSON.stringify(CO_LINKEDIN)}),
  ifNode('Co rescue: found?', [40040, 2900], '={{ $json.bestUrl }}', { right: 'Not found', operator: { type: 'string', operation: 'equals' } })
];
for (const n of nodes) S.addNode(n);
const C = (a, ai, b) => S.addConnection({ connection: [{ node: a, type: 'main', index: ai }, { node: b, type: 'main', index: 0 }] });
S.removeConnection({ connection: [{ node: 'If35', type: 'main', index: 1 }, { node: 'Respond to Webhook88', type: 'main', index: 0 }] });
S.removeConnection({ connection: [{ node: 'If34', type: 'main', index: 0 }, { node: 'Respond to Webhook65', type: 'main', index: 0 }] });
C('If35', 1, 'LI rescue: top 10');
C('LI rescue: top 10', 0, 'LI rescue: found in top 10?');
C('LI rescue: found in top 10?', 0, 'Respond to Webhook86');
C('LI rescue: found in top 10?', 1, 'LI rescue: has company?');
C('LI rescue: has company?', 0, 'LI rescue: Serper retry');
C('LI rescue: has company?', 1, 'Respond to Webhook88');
C('LI rescue: Serper retry', 0, 'LI rescue: pick retry');
C('LI rescue: pick retry', 0, 'LI rescue: found by retry?');
C('LI rescue: found by retry?', 0, 'Respond to Webhook86');
C('LI rescue: found by retry?', 1, 'LI rescue: LinkedIn search');
C('LI rescue: LinkedIn search', 0, 'LI rescue: pick LinkedIn search');
C('LI rescue: pick LinkedIn search', 0, 'LI rescue: found by LinkedIn search?');
C('LI rescue: found by LinkedIn search?', 0, 'Respond to Webhook86');
C('LI rescue: found by LinkedIn search?', 1, 'Respond to Webhook88');
C('If34', 0, 'Co rescue: LinkedIn company search');
C('Co rescue: LinkedIn company search', 0, 'Co rescue: pick');
C('Co rescue: pick', 0, 'Co rescue: found?');
C('Co rescue: found?', 0, 'Respond to Webhook65');
C('Co rescue: found?', 1, 'Respond to Webhook29');
'APPLIED ' + S.allNodes.length;
}`;
process.stdout.write(script);
