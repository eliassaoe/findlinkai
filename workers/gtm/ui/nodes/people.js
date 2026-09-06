// Who to write to at each company. Explee first, LinkFinder second.
//
// Explee matches job titles semantically against the campaign's target roles.
// LinkFinder's company_domain_to_employees takes a seniority bucket: a live
// call on demos.fr returned a Technical Director in Russia and a CFO — real
// directors, wrong people. So Explee leads and LinkFinder covers the domains
// Explee has nobody for. Never both for one domain.
const cfg = $('Config').first().json;
if (!this.helpers || !this.helpers.httpRequest) {
  throw new Error('This n8n has no this.helpers.httpRequest in Code nodes.');
}
const http = opts => this.helpers.httpRequest(opts);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LF = 'https://api.linkfinderai.com';
const hasExplee = cfg.explee_key && !cfg.explee_key.startsWith('PUT_');
const hasLf = cfg.linkfinder_key && !cfg.linkfinder_key.startsWith('PUT_');
if (!hasExplee && !hasLf) throw new Error('No Explee or LinkFinder key in Config.');
const deadline = Date.now() + (Number(cfg.people_budget_seconds) || 200) * 1000;
const left = () => deadline - Date.now();

async function explee(domain) {
  if (!hasExplee) return [];
  try {
    const x = await http({ method: 'POST', json: true, timeout: 45000,
      url: 'https://api.explee.com/public/api/v1/search/people-by-domains',
      headers: { 'X-API-Key': cfg.explee_key },
      body: { domains: [domain],
              job_titles: (cfg.job_titles || ['Founder', 'Director']).slice(0, 20),
              criteria: (cfg.criteria || []).slice(0, 3),
              people_per_company: cfg.per_company } });
    return (x && (x.people || x.results || x.items)) || [];
  } catch (e) { console.log(domain + ' explee: ' + e.message); return []; }
}

// Always async on LinkFinder's side: post, then poll the job inline.
async function linkfinder(domain) {
  if (!hasLf) return [];
  const auth = { Authorization: 'Bearer ' + cfg.linkfinder_key };
  let r;
  try {
    r = await http({ method: 'POST', url: LF, headers: auth, json: true, timeout: 30000, body: {
      type: 'company_domain_to_employees', input_data: domain,
      seniority: cfg.seniority, employee_count: cfg.per_company } });
  } catch (e) { console.log(domain + ' linkfinder: ' + e.message); return []; }
  for (let n = 0; r && r.job_id && !r.result && n < 8 && left() > 20000; n++) {
    await sleep(8000);
    try { r = await http({ method: 'GET', headers: auth, json: true,
      url: r.poll_url || LF + '/status/' + r.job_id }); }
    catch (e) { return []; }
  }
  return (r && r.result) || [];
}

const out = [];
const companies = $input.all().map(i => i.json);
let stopped = '';
for (const c of companies) {
  if (left() < 25000) { stopped = 'out of time after ' + out.length + ' people'; break; }
  const domain = c.domain;
  let rows = await explee(domain), via = 'explee';
  if (!rows.length) { rows = await linkfinder(domain); via = 'linkfinder'; }
  for (const p of rows.slice(0, cfg.per_company)) {
    out.push({ ...p, source: via, _company: c.company, _company_score: c.score,
               _company_what: c.what, _company_country: c.country,
               company_domain: p.company_domain || p.companyWebsite || domain });
  }
  await sleep(700);
}
console.log('People: ' + out.length + ' across ' + companies.length + ' companies (' +
  out.filter(p => p.source === 'explee').length + ' explee, ' +
  out.filter(p => p.source === 'linkfinder').length + ' linkfinder)' + (stopped ? '; ' + stopped : ''));
if (!out.length) {
  throw new Error('Neither Explee nor LinkFinder found anyone at: ' + companies.map(c => c.domain).join(', '));
}
return [{ json: { people: out } }];
