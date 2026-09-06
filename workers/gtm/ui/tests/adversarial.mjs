import fs from 'fs';
import { fileURLToPath } from 'url'; import path from 'path';
const N = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nodes') + '/';
const mk = f => new Function('$','$input','console',`return (async function(){${fs.readFileSync(N+f,'utf8')}}).call(this)`);
const quiet = { log: () => {} };
const items = a => ({ all: () => a.map(json => ({ json })), first: () => ({ json: a[0] }) });
const $of = cfg => name => ({ first: () => ({ json: cfg }), all: () => [{ json: cfg }] });
const ok = (label, cond) => console.log((cond ? '  ok   ' : '  FAIL ') + label);

// --- country handling: names, codes, unknowns ---------------------------------
{
  const cfg = { countries:['FR','BE'], job_titles:['Dirigeant'], min_criterion_score:0 };
  const people = [
    { first_name:'A', last_name:'A', title:'Dirigeant', country:'Germany' },
    { first_name:'B', last_name:'B', title:'Dirigeant', country:'Ireland' },
    { first_name:'C', last_name:'C', title:'Dirigeant', country:'Belgium' },
    { first_name:'D', last_name:'D', title:'Dirigeant', geo:'fr' },
    { first_name:'E', last_name:'E', title:'Dirigeant', country:'Atlantis' },   // unknown -> kept, not guessed
  ];
  const out = await mk('qualify.js').call({}, $of(cfg), items([{ people }]), quiet);
  const kept = out[0].json.people.map(p => p.first_name).join('');
  ok('Germany and Ireland dropped, Belgium/fr kept, unknown country kept: ' + kept, kept === 'CDE');
}
// --- filters: nl-to-filters error falls back to definition --------------------
{
  const cfg = { definition:'organisme de formation', criteria:['a','b','c','d'], page_size:40 };
  const out = await mk('filters.js').call({}, $of(cfg), items([{ error:{ message:'502' } }]), quiet);
  ok('nl-to-filters error -> definition fallback, criteria capped at 3',
     out[0].json.filters.definition === 'organisme de formation' && out[0].json.filters.criteria.length === 3);
  const out2 = await mk('filters.js').call({}, $of(cfg), items([{ definition:'training company', countries:['FR'], query:'x', explanation:'y' }]), quiet);
  ok('flat nl response used, query/explanation stripped',
     out2[0].json.filters.countries[0] === 'FR' && !('query' in out2[0].json.filters));
}
// --- signals: start then collect; titles survive compaction; pending tolerated
{
  const cfg = { explee_key:'k', signal_agents:['active_hiring','recent_news'], signal_budget_seconds:120, signal_max_companies:400 };
  let posts = 0;
  const ctx = { helpers:{ httpRequest: async o => {
    if (o.url.endsWith('/agents')) return { agents:[{ id:'dev/active_hiring' },{ id:'dev/recent_news' }] };
    if (o.method === 'POST') { posts++; return { run_id:'r' + posts }; }
    if (o.url.endsWith('/r2')) return { result:{}, meta:{ status:'running' } };   // not finished after the wait
    return { result:{ is_actively_hiring:true, job_postings:[{ title:'Formateur management', url:'u' },{ title:'Business developer', url:'u' }], trajectory_url:'t' }, meta:{ status:'completed' } };
  } } };
  const people = Array.from({ length: 120 }, (_, i) => ({ company_domain: 'c' + (i % 40) + '.fr' }));
  const started = await mk('signals_start.js').call(ctx, $of(cfg), items([{ people }]), quiet);
  ok('start: one run per agent per unique company (40 x 2 = 80), not per person', started[0].json.runs.length === 80 && posts === 80);
  const out = await mk('signals_collect.js').call(ctx, $of(cfg), items(started.map(i => i.json)), quiet);
  const sig = out[0].json.people[0].signal.active_hiring;
  ok('collect: job posting titles kept, urls dropped: ' + JSON.stringify(sig).slice(0,90), Array.isArray(sig.job_postings) && sig.job_postings[0] === 'Formateur management' && !('trajectory_url' in sig));
  ok('a run still pending after the wait leaves that key absent, nothing throws', out[0].json.people.length === 120);
  const none = await mk('signals_start.js').call(ctx, $of({ ...cfg, signal_agents:[] }), items([{ people }]), quiet);
  ok('no agents configured -> people pass through, zero runs', none[0].json.runs.length === 0 && none[0].json.people.length === 120);
}
// --- people: bulk call, rows mapped back to their domain, cap per company, gaps to LinkFinder
{
  const cfg = { explee_key:'k', linkfinder_key:'l', job_titles:['Dirigeant'], criteria:[], per_company:2, people_chunk:100, people_budget_seconds:240, linkfinder_fallback_max:40, seniority:'director' };
  const calls = [];
  const ctx = { helpers:{ httpRequest: async o => {
    calls.push(o.url.includes('people-by-domains') ? 'bulk:' + o.body.domains.length : (o.body && o.body.type) || 'poll');
    if (o.url.includes('people-by-domains')) return { people: [
      { first_name:'A', company_domain:'a.fr' }, { first_name:'B', company_domain:'a.fr' }, { first_name:'C', company_domain:'a.fr' },
      { first_name:'D', company_domain:'https://www.b.fr/about' } ] };
    if (o.body && o.body.type === 'company_domain_to_employees') return { result: [{ firstName:'Z', companyWebsite:'c.fr' }] };
    return {};
  } } };
  const companies = [{ domain:'a.fr', company:'A', score:5 }, { domain:'b.fr', company:'B', score:4 }, { domain:'c.fr', company:'C', score:3 }];
  const out = await mk('people.js').call(ctx, $of(cfg), items(companies), quiet);
  const ppl = out[0].json.people;
  ok('one bulk call for three domains: ' + calls.join(','), calls[0] === 'bulk:3');
  ok('per_company cap applied per domain (a.fr 3 -> 2)', ppl.filter(p => p.company_domain === 'a.fr').length === 2);
  ok('messy domain in a row still maps to its company', ppl.some(p => p.first_name === 'D' && p.company_domain === 'b.fr' && p._company === 'B'));
  ok('domain Explee left empty went to LinkFinder', ppl.some(p => p.firstName === 'Z' && p.source === 'linkfinder' && p.company_domain === 'c.fr'));
}
// --- build_lead: preamble, fence, pairing by email, missing subject -----------
{
  const cfg = { dry_run:true };
  const leads = [{ email:'a@x.fr', first_name:'A', last_name:'A', company_name:'X', company_domain:'x.fr', full_name:'A A', brief:{} },
                 { email:'b@y.fr', first_name:'B', last_name:'B', company_name:'Y', company_domain:'y.fr', full_name:'B B', brief:{} }];
  const $ = name => name === 'Config' ? { first:()=>({ json:cfg }) } : { all:(b)=>leads.map(json=>({ json })) };
  // replies come back in REVERSED order, second one with a preamble; pairing must follow the echoed email
  const replies = [
    { output: 'Voici :\n{"email":"b@y.fr","subject":"s-b","body":"line1\\nline2"}' },
    { output: '```json\n{"email":"a@x.fr","subject":"s-a","body":"x"}\n```' },
  ];
  const out = await mk('build_lead.js').call({}, $, items(replies), quiet);
  ok('paired by echoed email despite reversed order', out[0].json.email === 'b@y.fr' && out[0].json.custom_variables.ai_subject === 's-b');
  ok('newlines: <br> in ai_body, \\n kept in ai_body_text', out[0].json.custom_variables.ai_body === 'line1<br>line2' && out[0].json.custom_variables.ai_body_text === 'line1\nline2');
  ok('no personalization blob in the Instantly lead', !('personalization' in out[0].json));
  try { await mk('build_lead.js').call({}, $, items([{ output:'Sorry, I cannot.' }]), quiet); ok('no JSON -> throws', false); }
  catch (e) { ok('no JSON at all -> throws with the reply text', /no subject\/body JSON/.test(e.message)); }
}
// --- check_campaign: dry run passes, send mode without id throws, template check
{
  const pass = await mk('check_campaign.js').call({}, $of({}), items([{ dry_run:true }]), quiet);
  ok('dry run passes config through', pass[0].json.dry_run === true);
  try { await mk('check_campaign.js').call({}, $of({}), items([{ dry_run:false, instantly_campaign_id:'PUT_X', instantly_key:'k' }]), quiet); ok('send without id throws', false); }
  catch (e) { ok('send without campaign id throws early', /instantly_campaign_id is not set/.test(e.message)); }
  const ctxBad = { helpers:{ httpRequest: async () => ({ name:'Old campaign', sequences:[{ steps:[{ variants:[{ subject:'Hi', body:'static text' }] }] }] }) } };
  try { await mk('check_campaign.js').call(ctxBad, $of({}), items([{ dry_run:false, instantly_campaign_id:'c1', instantly_key:'k' }]), quiet); ok('static template throws', false); }
  catch (e) { ok('campaign without {{ai_body}} refused before any credit is spent', /does not use \{\{ai_body\}\}/.test(e.message)); }
  const ctxGood = { helpers:{ httpRequest: async () => ({ name:'AI campaign', sequences:[{ steps:[{ variants:[{ subject:'{{ai_subject}}', body:'{{ai_body}}' }] }] }] }) } };
  const good = await mk('check_campaign.js').call(ctxGood, $of({}), items([{ dry_run:false, instantly_campaign_id:'c1', instantly_key:'k' }]), quiet);
  ok('campaign using the variables passes', good[0].json.instantly_campaign_id === 'c1');
}
// --- domains: manual list wins, company scores ranked, low score dropped -------
{
  const out = await mk('domains.js').call({}, $of({ domains:['a.fr','b.be'] }), items([{}]), quiet);
  ok('manual domain list wins', out.map(i=>i.json.domain).join(',') === 'a.fr,b.be');
  const rows = { companies:[ { domain:'low.fr', country:'FR', criteria:[{score:1},{score:1}] }, { domain:'hi.fr', country:'FR', criteria:[{score:5},{score:4}] }, { domain:'mid.fr', country:'FR' } ] };
  const out2 = await mk('domains.js').call({}, $of({ countries:['FR'], min_criterion_score:3 }), items([rows]), quiet);
  ok('ranked by company score, low dropped: ' + out2.map(i=>i.json.domain).join(','), out2.map(i=>i.json.domain).join(',') === 'hi.fr,mid.fr');
}

// --- the signal gate: only pay to reach people with a live trigger --------
{
  const people = [
    { full_name:'A', company_name:'X', company_domain:'x.fr', signal:{ active_hiring:{ is_actively_hiring:true } } },
    { full_name:'B', company_name:'Y', company_domain:'y.fr' },
    { full_name:'C', company_name:'Z', company_domain:'z.fr', signal:{} },
  ];
  const on = await mk('normalize.js').call({}, $of({ require_signal:true, signal_agents:['active_hiring'] }), items([{ people }]), quiet);
  ok('gate on: only the lead with a real trigger goes through (1 of 3)', on.length === 1 && on[0].json.full_name === 'A');
  const off = await mk('normalize.js').call({}, $of({ require_signal:false, signal_agents:['active_hiring'] }), items([{ people }]), quiet);
  ok('gate off: everyone qualified goes through', off.length === 3);
  const noAgents = await mk('normalize.js').call({}, $of({ require_signal:true, signal_agents:[] }), items([{ people }]), quiet);
  ok('gate on but no agents configured: not applied', noAgents.length === 3);
  try { await mk('normalize.js').call({}, $of({ require_signal:true, signal_agents:['active_hiring'] }), items([{ people: people.slice(1) }]), quiet); ok('gate takes everyone -> throws', false); }
  catch (e) { ok('gate takes everyone -> throws naming the fix', /require_signal false/.test(e.message)); }
}

// --- follow-ups ride as variables; lengths checked; missing ones reported ----
{
  const cfg = { dry_run:true };
  const leads = [{ full_name:'Claire Martin', first_name:'Claire', last_name:'Martin', company_name:'Demos', company_domain:'demos.fr', email:'c@demos.fr', brief:{} }];
  const logs = []; const log = { log: m => logs.push(String(m)) };
  const $ = name => name === 'Config' ? { first:()=>({ json:cfg }) } : { all:(b)=>leads.map(json=>({ json })) };
  const full = { output: JSON.stringify({ email:'c@demos.fr', subject:'s', body:'Bonjour Claire,\n\nligne.', followup_1:'Un trimestre sans prospection, c\'est un trimestre de moins. Toujours partante pour un test ?', followup_2:'Je peux vous envoyer 20 prospects de votre segment, gratuitement. Vous les voulez ?' }) };
  const out = await mk('build_lead.js').call({}, $, items([full]), log);
  const cv = out[0].json.custom_variables;
  ok('follow-ups present as ai_followup_1/2 (+ _text)', !!(cv.ai_followup_1 && cv.ai_followup_2_text && cv.ai_followup_1.includes('Un trimestre')));
  ok('preview shows all three messages', out[0].json._preview.includes('follow-up 1') && out[0].json._preview.includes('follow-up 2'));
  logs.length = 0;
  const out2 = await mk('build_lead.js').call({}, $, items([{ output: JSON.stringify({ email:'c@demos.fr', subject:'s', body:'b' }) }]), log);
  ok('missing follow-ups: lead still built, problem logged', out2.length === 1 && logs.some(l => /missing a follow-up/.test(l)));
  logs.length = 0;
  await mk('build_lead.js').call({}, $, items([{ output: JSON.stringify({ email:'c@demos.fr', subject:'s', body:'b', followup_1: Array(70).fill('mot').join(' '), followup_2:'ok' }) }]), log);
  ok('a 70-word follow-up is flagged against the 55 ceiling', logs.some(l => /follow-up 1 is 70 words/.test(l)));
}
