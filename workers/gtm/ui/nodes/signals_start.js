// Start one Explee agent run per surviving company. Collection happens two
// nodes later, after a Wait — start-everything, wait, collect-everything is
// how a thousand async jobs fit inside n8n's per-node time limit without a
// polling loop. 1 credit per run. Fails soft: no key or no agents configured
// passes the people through untouched.
const cfg = $('Config').first().json;
const people = $input.first().json.people || [];
const passthrough = () => [{ json: { people, runs: [] } }];
const wanted = (cfg.signal_agents || []).filter(Boolean);
if (!wanted.length || !cfg.explee_key || cfg.explee_key.startsWith('PUT_') || !this.helpers || !this.helpers.httpRequest) return passthrough();

const http = opts => this.helpers.httpRequest(opts);
const API = 'https://api.explee.com/public/api/v1';
const headers = { 'X-API-Key': cfg.explee_key };
const deadline = Date.now() + (Number(cfg.signal_budget_seconds) || 200) * 1000;
const left = () => deadline - Date.now();

let agents;
try { agents = ((await http({ method: 'GET', url: API + '/agents', headers, json: true })) || {}).agents || []; }
catch (e) { console.log('Could not list Explee agents: ' + e.message); return passthrough(); }
const match = w => agents.find(a => String(a.id).toLowerCase() === String(w).toLowerCase() ||
  String(a.id).toLowerCase().endsWith('/' + String(w).toLowerCase()) || String(a.name || '').toLowerCase() === String(w).toLowerCase());
const chosen = wanted.map(w => [w, match(w)]);
const missing = chosen.filter(([, a]) => !a).map(([w]) => w);
if (missing.length) throw new Error('No Explee agent matches ' + missing.join(', ') + '. Available ids: ' + agents.map(a => a.id).join(', '));

const domains = [...new Set(people.map(p => String(p.company_domain || '').toLowerCase()).filter(Boolean))]
  .slice(0, Number(cfg.signal_max_companies) || 400);
const jobs = [];
for (const domain of domains) for (const [, agent] of chosen) jobs.push({ domain, agent: agent.id, key: agent.id.split('/').pop() });

const runs = [];
let next = 0, failed = 0;
async function lane() {
  while (next < jobs.length && left() > 10000) {
    const j = jobs[next++];
    try {
      const s = await http({ method: 'POST', url: API + '/agents/' + encodeURIComponent(j.agent) + '/runs', headers, json: true, body: { input_data: { domain: j.domain } } });
      if (s && s.run_id) runs.push({ ...j, run_id: s.run_id }); else failed++;
    } catch (e) { failed++; }
  }
}
await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, lane));
console.log('Signals: started ' + runs.length + ' of ' + jobs.length + ' runs across ' + domains.length + ' companies (' + failed + ' failed to start, ~' + runs.length + ' credits)');
return [{ json: { people, runs } }];
