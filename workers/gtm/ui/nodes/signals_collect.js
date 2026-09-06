// Collect the agent runs started two nodes ago. Each run is fetched once, in
// parallel lanes; one that is still not finished after the Wait is simply
// left without a signal. Results are compacted to what a writer can use.
const cfg = $('Config').first().json;
const { people = [], runs = [] } = $input.first().json || {};
if (!runs.length || !this.helpers || !this.helpers.httpRequest) return [{ json: { people } }];

const http = opts => this.helpers.httpRequest(opts);
const API = 'https://api.explee.com/public/api/v1';
const headers = { 'X-API-Key': cfg.explee_key };
const deadline = Date.now() + (Number(cfg.signal_budget_seconds) || 200) * 1000;
const left = () => deadline - Date.now();

const compact = (v, depth = 0) => {
  if (v == null) return undefined;
  if (typeof v === 'string') return v.length > 220 ? v.slice(0, 217) + '…' : v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 3).map(x => compact(x, depth + 1)).filter(x => x !== undefined);
  if (depth >= 2) { const l = v.title || v.name || v.role || v.headline || v.summary; return typeof l === 'string' ? l.slice(0, 120) : undefined; }
  const o = {};
  for (const [k, val] of Object.entries(v)) {
    if (/url|trajectory|confidence_reasoning|raw|html/i.test(k)) continue;
    const c = compact(val, depth + 1);
    if (c !== undefined && c !== '' && !(Array.isArray(c) && !c.length)) o[k] = c;
  }
  return Object.keys(o).length ? o : undefined;
};

const byDomain = {};
let next = 0, got = 0, pending = 0;
async function lane() {
  while (next < runs.length && left() > 8000) {
    const r = runs[next++];
    try {
      const s = await http({ method: 'GET', headers, json: true, url: API + '/agents/runs/' + encodeURIComponent(r.run_id) });
      const status = String((s.meta && s.meta.status) || '').toLowerCase();
      const res = s.result && Object.keys(s.result).length ? compact(s.result) : null;
      if (res) { (byDomain[r.domain] = byDomain[r.domain] || {})[r.key] = res; got++; }
      else if (!['failed', 'error', 'cancelled', 'completed', 'done', 'success'].includes(status)) pending++;
    } catch (e) { /* no signal for this one */ }
  }
}
await Promise.all(Array.from({ length: Math.min(8, runs.length) }, lane));
console.log('Signals: ' + got + ' of ' + runs.length + ' runs returned something for ' + Object.keys(byDomain).length + ' companies' +
  (pending ? '; ' + pending + ' still running after the wait — raise the Wait if this is high' : ''));
return [{ json: { people: people.map(p => {
  const d = String(p.company_domain || '').toLowerCase();
  return byDomain[d] ? { ...p, signal: byDomain[d] } : p;
}) } }];
