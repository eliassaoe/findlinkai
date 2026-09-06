// One buying trigger per company, from Explee's pre-built agents.
//
// Signal-based cold email runs 5-18% reply against 1-3% for generic, and the
// timing of the signal moves reply rates more than framework or copy. Runs
// AFTER Qualify on the unique surviving domains: charged only on companies
// that will be emailed, one run shared by every lead there. 1 credit per
// agent per company. Everything fails soft — the leads pass through without
// a signal rather than the flow stopping.
const cfg = $('Config').first().json;
const people = $input.first().json.people || [];
const passthrough = () => [{ json: { people } }];
const wanted = (cfg.signal_agents || []).filter(Boolean);
if (!wanted.length || !cfg.explee_key || cfg.explee_key.startsWith('PUT_')
    || !this.helpers || !this.helpers.httpRequest) return passthrough();

const http = opts => this.helpers.httpRequest(opts);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const API = 'https://api.explee.com/public/api/v1';
const headers = { 'X-API-Key': cfg.explee_key };
const deadline = Date.now() + (Number(cfg.signal_budget_seconds) || 120) * 1000;
const left = () => deadline - Date.now();

let agents;
try {
  const list = await http({ method: 'GET', url: API + '/agents', headers, json: true });
  agents = (list && list.agents) || [];
} catch (e) { console.log('Could not list Explee agents: ' + e.message); return passthrough(); }
const match = w => agents.find(a =>
  String(a.id).toLowerCase() === String(w).toLowerCase() ||
  String(a.id).toLowerCase().endsWith('/' + String(w).toLowerCase()) ||
  String(a.name || '').toLowerCase() === String(w).toLowerCase());
const chosen = wanted.map(w => [w, match(w)]);
const missing = chosen.filter(([, a]) => !a).map(([w]) => w);
if (missing.length) {
  throw new Error('No Explee agent matches ' + missing.join(', ') + '. Available ids: ' + agents.map(a => a.id).join(', '));
}

// Compact the agent's answer to what a writer can use in one line. A raw
// result can carry whole job-post arrays; the writer needs the fact.
const compact = (v, depth = 0) => {
  if (v == null) return undefined;
  if (typeof v === 'string') return v.length > 220 ? v.slice(0, 217) + '…' : v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 3).map(x => compact(x, depth + 1)).filter(x => x !== undefined);
  if (depth >= 2) {
    // Deep objects collapse to the one string that names them — a job
    // posting becomes its title, not nothing.
    const label = v.title || v.name || v.role || v.headline || v.summary;
    return typeof label === 'string' ? label.slice(0, 120) : undefined;
  }
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    if (/url|trajectory|confidence_reasoning|raw|html/i.test(k)) continue;
    const c = compact(val, depth + 1);
    if (c !== undefined && c !== '' && !(Array.isArray(c) && !c.length)) o[k] = c;
  }
  return Object.keys(o).length ? o : undefined;
};

const domains = [...new Set(people.map(p => String(p.company_domain || '').toLowerCase()).filter(Boolean))]
  .slice(0, Number(cfg.signal_max_companies) || 25);

async function run(agent, domain) {
  let started;
  try {
    started = await http({ method: 'POST', url: API + '/agents/' + encodeURIComponent(agent.id) + '/runs',
                           headers, json: true, body: { input_data: { domain } } });
  } catch (e) { console.log(domain + ' ' + agent.id + ': ' + e.message); return null; }
  const runId = started && started.run_id;
  if (!runId) return null;
  for (let n = 0; n < 12 && left() > 12000; n++) {
    await sleep(6000);
    let got;
    try { got = await http({ method: 'GET', headers, json: true, url: API + '/agents/runs/' + encodeURIComponent(runId) }); }
    catch (e) { return null; }
    const status = String((got.meta && got.meta.status) || '').toLowerCase();
    if (got.result && Object.keys(got.result).length) return got.result;
    if (['failed', 'error', 'cancelled', 'completed', 'done', 'success'].includes(status)) return got.result || null;
  }
  return null;
}

const byDomain = {};
let runs = 0, hits = 0;
for (const domain of domains) {
  if (left() < 20000) { console.log('Signals: out of time at ' + domain); break; }
  const found = {};
  for (const [, agent] of chosen) {
    if (left() < 15000) break;
    runs++;
    const r = compact(await run(agent, domain));
    if (r) { found[agent.id.split('/').pop()] = r; hits++; }
  }
  if (Object.keys(found).length) byDomain[domain] = found;
  await sleep(400);
}
console.log('Signals: ' + hits + ' of ' + runs + ' runs returned something across ' + domains.length + ' companies (~' + runs + ' credits)');
return [{ json: { people: people.map(p => {
  const d = String(p.company_domain || '').toLowerCase();
  return byDomain[d] ? { ...p, signal: byDomain[d] } : p;
}) } }];
