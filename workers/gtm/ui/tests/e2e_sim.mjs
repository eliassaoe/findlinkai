// Run every Code node in sequence, from a realistic Explee company response
// through to the Instantly payload, with all HTTP faked from REAL response
// shapes seen in this session (Explee people row, LinkFinder employees row,
// LinkFinder email result, Explee agent run).
import fs from 'fs';
import { fileURLToPath } from 'url'; import path from 'path';
const N = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nodes') + '/';
const mk = f => new Function('$','$input','console',`return (async function(){${fs.readFileSync(N+f,'utf8')}}).call(this)`);
const log = { log: m => console.log('    ⋮ ' + String(m).split('\n')[0].slice(0, 150)) };
const items = a => ({ all: () => a.map(json => ({ json })), first: () => ({ json: a[0] }) });

const CFG = {
  explee_key:'ex', linkfinder_key:'lf', instantly_key:'in', dry_run:true,
  instantly_campaign_id:'PUT_INSTANTLY_CAMPAIGN_ID_HERE',
  icp:'organisme de formation or centre de formation in France, Belgique, Luxembourg',
  definition:'organisme de formation, centre de formation', countries:['FR','BE','LU'], page_size:40,
  criteria:['Vente B2B active','Equipe commerciale de moins de 5','is NOT: Formation purement subventionnee'],
  min_criterion_score:3, min_company_size:0, domains:[],
  job_titles:['Dirigeant','responsable commercial'], seniority:'director', per_company:4, people_budget_seconds:200,
  title_keywords:[], title_exclude:[], max_leads:30,
  signal_agents:['active_hiring'], signal_budget_seconds:120, signal_max_companies:25,
  linkfinder_max:30, linkfinder_budget_seconds:240, linkfinder_concurrency:3, language:'fr',
};
const store = { Config: [CFG] };
const $ = name => ({ first: () => ({ json: store[name][0] }), all: () => store[name].map(json => ({ json })) });
const run = async (label, file, input, ctx = {}) => {
  process.stdout.write(`\n▶ ${label}\n`);
  const out = await mk(file).call(ctx, $, items(input), log);
  store[label] = out.map(i => i.json);
  return store[label];
};

// ---- fixtures from real shapes --------------------------------------------
const nlToFilters = { filters: { definition: 'professional training company', countries: ['FR','BE','LU'], employee_count: { min: 5, max: 200 } } };
const companies = { companies: [
  { name:'Demos', domain:'demos.fr', country:'FR', employee_count:'201-500', description:'Organisme de formation professionnelle', criteria:[{score:5},{score:4},{score:5}] },
  { name:'Cegos', domain:'https://www.cegos.fr/', country:'FR', employee_count:'1001-5000', description:'Formation professionnelle et management', criteria:[{score:4},{score:2},{score:4}] },
  { name:'Microsoft', domain:'microsoft.com', country:'US', employee_count:'10,001+', description:'Global tech giant', criteria:[{score:1},{score:1},{score:1}] },
  { name:'Petite Ecole', domain:'petite-ecole.be', country:'BE', employee_count:'11-50', description:'Centre de formation continue', criteria:[{score:5},{score:5},{score:2}] },
  { name:'NoDomain Corp', country:'FR' },
]};
// Explee people row: the real Yury Sychev shape, adapted per company
const expleePerson = (first, last, title, dom, company, geo, sc) => ({ first_name:first, last_name:last, title, headline:`${title} @ ${company}`,
  linkedin_url:`https://www.linkedin.com/in/${first.toLowerCase()}`, geo, company_name:company, company_domain:dom, company_size:'201-500',
  company_description:'Organisme de formation', follower_count:120, company_industries_nace:[{code:'P85.5.9'}], criteria:[{score:sc}] });
const peopleAt = {
  'demos.fr': [ expleePerson('Claire','Martin','Directrice commerciale','demos.fr','Demos','FR',5),
                expleePerson('Marc','Dupont','Sales Manager','demos.fr','Demos','FR',2),
                expleePerson('Yury','Sychev','Commercial Director SME&C','demos.fr','Demos','IE',4) ],
  'cegos.fr':  [ expleePerson('Anne','Leroy','Dirigeante','cegos.fr','Cegos','FR',5) ],
  'petite-ecole.be': [],   // Explee has nobody -> LinkFinder fallback
};
// LinkFinder employees row: the real demos.fr shape
const lfEmployees = [{ name:'Pascale Greiner', firstName:'Pascale', lastName:'Greiner', jobTitle:'Responsable commerciale', seniority:'director',
  email:'pascale@petite-ecole.be', linkedinUrl:'http://www.linkedin.com/in/pascale-greiner', country:'Belgium', company:'Petite Ecole', companyWebsite:'petite-ecole.be' }];

const calls = [];
const httpFake = async o => {
  calls.push(o.method + ' ' + o.url.replace(/^https?:\/\//,'').slice(0,60) + (o.body?.type ? ' ' + o.body.type : ''));
  const u = o.url;
  if (u.includes('/people-by-domains')) return { people: peopleAt[o.body.domains[0]] || [] };
  if (u.endsWith('api.linkfinderai.com') && o.body.type === 'company_domain_to_employees') return { job_id:'j1', poll_url:'https://api.linkfinderai.com/status/j1' };
  if (u.includes('/status/j1')) return { status:'done', result: lfEmployees };
  if (u.endsWith('api.linkfinderai.com') && o.body.type === 'linkedin_profile_to_email') {
    // real shape: result is a bare string; empty = not found
    return { status:'success', result: o.body.input_data.includes('claire') ? 'claire.martin@demos.fr' : (o.body.input_data.includes('anne') ? 'a.leroy@cegos.fr' : '') };
  }
  if (u.endsWith('/agents')) return { agents:[{ id:'dev/active_hiring', name:'Active Hiring' },{ id:'dev/recent_news', name:'Recent News' }] };
  if (u.includes('/agents/') && u.endsWith('/runs')) return { run_id:'run-' + o.body.input_data.domain };
  if (u.includes('/agents/runs/')) return { result:{ is_actively_hiring:true, total_open_positions:2, job_postings:[{title:'Formateur management', url:'https://x'},{title:'Business developer', url:'https://y'}], trajectory_url:'https://t' }, meta:{ status:'completed' } };
  throw new Error('unexpected ' + o.method + ' ' + u);
};
const ctx = { helpers: { httpRequest: httpFake } };

await run('Instantly: check campaign', 'check_campaign.js', [CFG], ctx);
await run('Filters', 'filters.js', [nlToFilters], ctx);
console.log('    filters sent:', JSON.stringify(store['Filters'][0]));
await run('Domains', 'domains.js', [companies], ctx);
console.log('    domains:', store['Domains'].map(d => d.domain + (d.score!=null?'('+d.score.toFixed(1)+')':'')));
await run('People at each domain', 'people.js', store['Domains'], ctx);
await run('Qualify', 'qualify.js', store['People at each domain'], ctx);
console.log('    kept:', store['Qualify'][0].people.map(p => (p.first_name||p.firstName)+' '+(p.title||p.jobTitle)+' ['+(p.geo||p.country)+'] s='+p._score));
await run('Explee: signals per company', 'signals.js', store['Qualify'], ctx);
await run('One item per lead', 'normalize.js', store['Explee: signals per company'], ctx);
console.log('    brief[0]:', JSON.stringify(store['One item per lead'][0].brief));
await run('LinkFinder: fill missing emails', 'resolve.js', store['One item per lead'], ctx);
console.log('    sendable:', store['LinkFinder: fill missing emails'].map(l => l.full_name+' <'+l.email+'>'));

// the writer, faked as the agent would answer — one with a preamble, one fenced, one clean
const drafts = store['LinkFinder: fill missing emails'].map((l, i) => ({ output:
  (i===0 ? 'Voici l\'email :\n' : i===1 ? '```json\n' : '') +
  JSON.stringify({ email: l.email, subject: 'vos formateurs prospectent entre deux sessions ?', body: `Bonjour ${l.first_name},\n\nVous recrutez en ce moment.\n\nOn construit la liste et on envoie.\n\nÇa vaut un test ?\n\nElias` }) +
  (i===1 ? '\n```' : '') }));
await run('Build the lead', 'build_lead.js', drafts, ctx);
console.log('\n=== INSTANTLY PAYLOAD (what would be posted) ===');
for (const l of store['Build the lead']) { const { _preview, ...rest } = l; console.log(JSON.stringify(rest, null, 1).slice(0, 420)); }
console.log('\n=== PREVIEW ===\n' + store['Build the lead'][0]._preview);
console.log('\n=== HTTP calls made (' + calls.length + ') ===\n' + calls.join('\n'));
