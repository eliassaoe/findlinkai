// Who to write to at each company. Explee first, LinkFinder for the gaps.
//
// people-by-domains is a BULK endpoint (up to 1000 domains a request), so at
// scale this is a handful of calls, not one per company. Explee matches job
// titles semantically against the target roles and scores each person against
// the criteria; LinkFinder's seniority bucket covers domains Explee returns
// nobody for — a live call showed it returning a CFO for "director", so it is
// the fallback, not the lead.
const cfg = $('Config').first().json;
if (!this.helpers || !this.helpers.httpRequest) throw new Error('This n8n has no this.helpers.httpRequest in Code nodes.');
const http = opts => this.helpers.httpRequest(opts);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasExplee = cfg.explee_key && !cfg.explee_key.startsWith('PUT_');
const hasLf = cfg.linkfinder_key && !cfg.linkfinder_key.startsWith('PUT_');
if (!hasExplee && !hasLf) throw new Error('No Explee or LinkFinder key in Config.');
const deadline = Date.now() + (Number(cfg.people_budget_seconds) || 240) * 1000;
const left = () => deadline - Date.now();

const companies = $input.all().map(i => i.json);
const meta = Object.fromEntries(companies.map(c => [c.domain, c]));
const clean = d => String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const out = [];
const covered = new Set();
const push = (p, via, domain) => {
  const m = meta[domain] || {};
  out.push({ ...p, source: via, company_domain: domain, _company: m.company, _company_score: m.score,
             _company_what: m.what, _company_country: m.country });
};

// 1. Explee, in chunks of domains.
if (hasExplee) {
  const CHUNK = Number(cfg.people_chunk) || 100;
  for (let i = 0; i < companies.length && left() > 30000; i += CHUNK) {
    const domains = companies.slice(i, i + CHUNK).map(c => c.domain);
    try {
      const x = await http({ method: 'POST', json: true, timeout: Math.min(120000, left() - 5000),
        url: 'https://api.explee.com/public/api/v1/search/people-by-domains',
        headers: { 'X-API-Key': cfg.explee_key },
        body: { domains, job_titles: (cfg.job_titles || ['Founder', 'Director']).slice(0, 20),
                criteria: (cfg.criteria || []).slice(0, 3), people_per_company: cfg.per_company } });
      const rows = (x && (x.people || x.results || x.items)) || [];
      const perDomain = {};
      for (const p of rows) {
        const d = clean(p.company_domain || p.domain || p.company_website) || domains.find(dm => String(p.company_url || '').includes(dm)) || '';
        if (!d) continue;
        (perDomain[d] = perDomain[d] || []).push(p);
      }
      for (const [d, ps] of Object.entries(perDomain)) {
        covered.add(d);
        for (const p of ps.slice(0, cfg.per_company)) push(p, 'explee', d);
      }
      console.log('Explee people: chunk ' + (i / CHUNK + 1) + ' -> ' + rows.length + ' people across ' + Object.keys(perDomain).length + ' of ' + domains.length + ' domains');
    } catch (e) { console.log('Explee people chunk ' + (i / CHUNK + 1) + ': ' + e.message); }
    await sleep(500);
  }
}

// 2. LinkFinder for the domains Explee left empty — capped, because each is
//    an async job of its own.
const gaps = companies.map(c => c.domain).filter(d => !covered.has(d));
const lfCap = Number(cfg.linkfinder_fallback_max) || 40;
if (hasLf && gaps.length) {
  const auth = { Authorization: 'Bearer ' + cfg.linkfinder_key };
  const LF = 'https://api.linkfinderai.com';
  let done = 0;
  for (const domain of gaps.slice(0, lfCap)) {
    if (left() < 30000) break;
    let r;
    try {
      r = await http({ method: 'POST', url: LF, headers: auth, json: true, timeout: 30000, body: {
        type: 'company_domain_to_employees', input_data: domain, seniority: cfg.seniority, employee_count: cfg.per_company } });
    } catch (e) { continue; }
    for (let n = 0; r && r.job_id && !r.result && n < 6 && left() > 25000; n++) {
      await sleep(8000);
      try { r = await http({ method: 'GET', headers: auth, json: true, url: r.poll_url || LF + '/status/' + r.job_id }); }
      catch (e) { r = null; }
    }
    const rows = (r && r.result) || [];
    for (const p of rows.slice(0, cfg.per_company)) push(p, 'linkfinder', domain);
    done++;
    await sleep(600);
  }
  console.log('LinkFinder fallback: ' + done + ' of ' + gaps.length + ' uncovered domains tried' + (gaps.length > lfCap ? ' (cap ' + lfCap + ')' : ''));
}

console.log('People: ' + out.length + ' across ' + companies.length + ' companies (' +
  out.filter(p => p.source === 'explee').length + ' explee, ' + out.filter(p => p.source === 'linkfinder').length + ' linkfinder)');
if (!out.length) throw new Error('Neither Explee nor LinkFinder found anyone at ' + companies.length + ' companies, e.g. ' + companies.slice(0, 8).map(c => c.domain).join(', '));
return [{ json: { people: out } }];
