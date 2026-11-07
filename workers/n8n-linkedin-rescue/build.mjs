// Builds the Code-node bodies added to the n8n workflows "linkfinder ai app v 4"
// and "Linkfinderai free tools" on 7 Nov 2026. Purely additive: they only run
// on a lookup the existing branch already answered "not found".
// `node build.mjs` writes nodes.json; `node --test test.mjs` checks the logic.
import { writeFileSync } from 'node:fs';

// Shared helpers, pasted at the top of each Code node (n8n Code nodes can't import).
export const LIB = String.raw`
const MAXC = 10;
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/ı/g,'i').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
const JOIN = new Set(['de','da','do','dos','das','del','della','di','du','la','le','van','von','der','den','ter','bin','bint','al','el','ibn','st','mc','mac']);
const LEGAL = new Set(['inc','incorporated','llc','ltd','limited','gmbh','mbh','corp','corporation','co','company','sro','srl','spa','sas','sarl','sa','pvt','private','plc','ag','kg','bv','nv','oy','oyj','ab','as','asa','pty','lp','llp','pllc','bhd','sdn','kft','zrt','sti','ltda','sl','se','holding','holdings','the']);
const GENERIC = new Set(['group','services','solutions','international','global','enterprises','partners','consulting','systems','technologies','technology','brands','foods','family','and']);
function parsePerson(raw){
  const toks = String(raw||'').trim().split(/\s+/).filter(Boolean); let domain=null; const rest=[];
  for (const t0 of toks){ const t=t0.replace(/[),.]+$/,'');
    if(domain===null && /@/.test(t)){domain=t.split('@').pop().toLowerCase();continue;}
    if(domain===null && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t) && !/^[a-z]\.$/i.test(t)){domain=t.toLowerCase();continue;}
    rest.push(t);}
  let n; const j = s => { s=String(s||'').toLowerCase().replace(/\.$/,''); return s.length===1||JOIN.has(s); };
  if(domain!==null) n=Math.min(rest.length,4); else if(rest.length>=3&&j(rest[1])) n=3; else n=Math.min(rest.length,2);
  const name=rest.slice(0,n).map(norm).filter(Boolean);
  const company=rest.slice(n).map(norm).join(' ').split(' ').filter(Boolean);
  const companyKey=company.filter((w,i)=>w.length>2&&!LEGAL.has(w)&&!GENERIC.has(w));
  if(domain){const b=domain.split('.')[0]; if(b.length>2) companyKey.push(b);}
  return {name, company, companyKey, domain};
}
function isProfile(l){return /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\/in\/[^/?#\s]+/i.test(String(l||''));}
// A rescue match needs the whole name AND the company in the title or snippet:
// Google's first result already failed, so a same-name stranger is the risk.
function scorePerson(p, item){
  if(!item||!isProfile(item.link)) return 0;
  const title=norm(item.title), text=title+' '+norm(item.snippet); if(!title) return 0;
  const words=new Set(title.split(' '));
  let s=0; for(const t of p.name){ if(words.has(t)) s+=1; else if(t.length===1&&[...words].some(w=>w.startsWith(t))) s+=0.5; else if(t.length>2&&title.includes(t)) s+=0.5; }
  if(s<Math.min(2,p.name.length)) return 0;
  if(!p.companyKey.some(w=>text.includes(w))) return 0;
  return s+1;
}
function pickPerson(p, organic){
  let best=null; (organic||[]).slice(0,MAXC).forEach(it=>{const s=scorePerson(p,it); if(s>0&&(!best||s>best.s)) best={s,link:String(it.link).split('?')[0],title:it.title};}); return best;
}
`;

// 1. After the original If35 says "not found": look at Serper's top 10 that
//    the first check ignored, and plan two more query shapes.
export const LI_TOP10 = LIB + String.raw`
const raw = $('Webhook1').first().json.body.input_data || '';
const p = parsePerson(raw);
const organic = ($input.first().json || {}).organic || [];
const hasCompany = p.companyKey.length > 0;
const best = hasCompany ? pickPerson(p, organic) : null;
const nm = p.name.join(' '), co = p.company.filter(w=>!LEGAL.has(w)).join(' ') || (p.domain ? p.domain.split('.')[0] : '');
const queries = hasCompany ? [
  { q: '"' + nm + '" "' + co + '" linkedin', num: 10 },
  { q: nm + ' ' + (co.split(' ')[0] || '') + ' site:linkedin.com/in', num: 10 }
] : [];
return [{ json: {
  found: !!best, skip: !hasCompany,
  organic: [{ title: best ? best.title : '', link: best ? best.link : '' }],
  queries, firstName: p.name[0] || '', lastName: p.name.slice(1).join(' '),
  rescue: best ? 'google_top10' : null
}}];
`;

// 2. After the Serper retry (one item per query).
export const LI_RETRY = LIB + String.raw`
const raw = $('Webhook1').first().json.body.input_data || '';
const p = parsePerson(raw);
const plan = $('LI rescue: top 10').first().json;
let organic = [];
for (const it of $input.all()) { const j = it.json || {}; if (Array.isArray(j.organic)) organic = organic.concat(j.organic.slice(0, MAXC)); }
const best = pickPerson(p, organic);
return [{ json: {
  found: !!best, organic: [{ title: best ? best.title : '', link: best ? best.link : '' }],
  firstName: plan.firstName, lastName: plan.lastName, rescue: best ? 'google_retry' : null
}}];
`;

// 3. After LinkedIn's own people search (Apify harvestapi/linkedin-profile-search-by-name).
//    Accept a row only when its headline names the company.
export const LI_LINKEDIN = LIB + String.raw`
const raw = $('Webhook1').first().json.body.input_data || '';
const p = parsePerson(raw);
let best = null;
for (const it of $input.all()) {
  const r = it.json || {};
  if (!isProfile(r.linkedinUrl)) continue;
  const head = norm(r.position), nameWords = norm(r.name).split(' ');
  const nameOk = nameWords.some(w => w.length > 1 && p.name.includes(w));
  if (nameOk && p.companyKey.some(w => head.includes(w))) { best = String(r.linkedinUrl).split('?')[0]; break; }
}
return [{ json: { found: !!best, organic: [{ title: best ? p.name.join(' ') : '', link: best || '' }], rescue: best ? 'linkedin_search' : null } }];
`;

// 4. Company branch, after the existing scorer said "Not found": LinkedIn's own
//    company search (Apify harvestapi/linkedin-company). Accept only a matching
//    name (legal forms ignored, but forms from two countries = two companies),
//    or the same website when a domain was typed.
export const CO_LINKEDIN = String.raw`
function norm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/[^a-z0-9]+/g,' ').trim();}
const LEGAL = new Set(['inc','incorporated','llc','ltd','limited','gmbh','mbh','corp','corporation','co','company','sro','srl','spa','sas','sarl','sa','pvt','private','plc','ag','kg','bv','nv','oy','oyj','ab','as','asa','pty','lp','llp','pllc','bhd','sdn','kft','zrt','sti','ltda','sl','se','the','holding','holdings']);
const COUNTRY = new Set(['us','usa','uk','gb','de','fr','it','es','nl','be','ch','at','pl','cz','hu','cn','jp','in']);
const FORM = {srl:'it-ro',spa:'it',gmbh:'de-at-ch',mbh:'de-at-ch',ag:'de-at-ch',kg:'de-at',bv:'nl',nv:'nl-be',sas:'fr',sarl:'fr-lu',pvt:'in',pty:'au-za',oy:'fi',oyj:'fi',ab:'se',asa:'no',kft:'hu',zrt:'hu',sro:'cz-sk',sti:'tr',bhd:'my',sdn:'my',ltda:'br-pt',plc:'uk-ie'};
const forms = s => [...new Set(norm(s).split(' ').map(w=>FORM[w]).filter(Boolean))];
function conflict(a,b){const x=forms(a),y=forms(b); if(!x.length||!y.length) return false; const c=new Set(x.join('-').split('-')); return !y.join('-').split('-').some(k=>c.has(k));}
const raw = String($('Webhook1').first().json.body.input_data || '').trim();
const dm = raw.toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
const domain = (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dm) && !/\s/.test(raw)) ? dm : null;
const words = norm(raw).split(' ').filter(Boolean);
const tokens = domain ? [dm.split('.')[0]] : (words.filter((w,i)=>!(i>0&&(LEGAL.has(w)||COUNTRY.has(w)))));
function slugOf(u){const m=String(u||'').match(/linkedin\.com\/company\/([^/?#]+)/i); return m?decodeURIComponent(m[1]):null;}
function nameOk(pageName, slug){
  if (conflict(raw, pageName+' '+slug)) return false;
  const page = norm(pageName).split(' ').filter(w=>w&&!LEGAL.has(w));
  const squashed = page.join('') + ' ' + norm(slug).replace(/ /g,'');
  const joined = tokens.join(''); if (joined.length>=4 && squashed.includes(joined)) return true;
  return tokens.length>0 && tokens.every(t=>page.includes(t));
}
let best = null;
for (const it of $input.all()) {
  const r = it.json || {}; const slug = slugOf(r.linkedinUrl); if (!slug) continue;
  const site = String(r.website||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (domain ? site === domain : nameOk(r.name, slug)) { best = 'https://www.linkedin.com/company/' + slug + '/'; break; }
}
return [{ json: { bestUrl: best || 'Not found', rescue: best ? 'linkedin_company_search' : null } }];
`;

writeFileSync(new URL('./nodes.json', import.meta.url), JSON.stringify({ LI_TOP10, LI_RETRY, LI_LINKEDIN, CO_LINKEDIN }, null, 1));

// ---- "Linkfinderai free tools" (the public tool pages) ----------------------
// The person branch there sends first_name / last_name / company_name, and today
// returns Google's organic[0].link with no check at all. These nodes keep that
// as the last resort (nothing that answers today goes blank) and try, in order:
// a first result that really has the name, the top 10 with name + company,
// two more queries, then LinkedIn people search.
const FT_PARSE = String.raw`
const b = $('Webhook').first().json.body || {};
const p = { name: norm((b.first_name||'') + ' ' + (b.last_name||'')).split(' ').filter(Boolean),
            company: norm(b.company_name||'').split(' ').filter(Boolean), domain: null };
p.companyKey = p.company.filter(w => w.length > 2 && !LEGAL.has(w) && !GENERIC.has(w));
`;
export const FT_TOP10 = LIB + FT_PARSE + String.raw`
const organic = ($input.first().json || {}).organic || [];
const o0 = organic[0] || {};
const original = o0.link || '';
const t0 = new Set(norm(o0.title).split(' '));
const firstOk = isProfile(o0.link) && p.name.length >= 2 && p.name.every(t => t0.has(t));
const best = firstOk ? { link: String(o0.link).split('?')[0] } : (p.companyKey.length ? pickPerson(p, organic) : null);
const nm = p.name.join(' '), co = p.company.filter(w => !LEGAL.has(w)).join(' ');
return [{ json: {
  found: !!best, skip: !p.companyKey.length || p.name.length < 2, original,
  organic: [{ link: best ? best.link : original }],
  queries: [{ q: '"' + nm + '" "' + co + '" linkedin', num: 10 }, { q: nm + ' ' + (co.split(' ')[0] || '') + ' site:linkedin.com/in', num: 10 }],
  firstName: p.name[0] || '', lastName: p.name.slice(1).join(' ')
}}];
`;
export const FT_RETRY = LIB + FT_PARSE + String.raw`
const plan = $('FT rescue: top 10').first().json;
let organic = [];
for (const it of $input.all()) { const j = it.json || {}; if (Array.isArray(j.organic)) organic = organic.concat(j.organic.slice(0, MAXC)); }
const best = pickPerson(p, organic);
return [{ json: { found: !!best, organic: [{ link: best ? best.link : plan.original }], firstName: plan.firstName, lastName: plan.lastName } }];
`;
export const FT_LINKEDIN = LIB + FT_PARSE + String.raw`
const plan = $('FT rescue: top 10').first().json;
let best = null;
for (const it of $input.all()) {
  const r = it.json || {};
  if (!isProfile(r.linkedinUrl)) continue;
  const head = norm(r.position), nameWords = norm(r.name).split(' ');
  if (nameWords.some(w => w.length > 1 && p.name.includes(w)) && p.companyKey.some(w => head.includes(w))) { best = String(r.linkedinUrl).split('?')[0]; break; }
}
return [{ json: { found: !!best, organic: [{ link: best || plan.original }] } }];
`;
export const FT_CO_LINKEDIN = CO_LINKEDIN.replace("$('Webhook1')", "$('Webhook')");
writeFileSync(new URL('./nodes.json', import.meta.url), JSON.stringify({ LI_TOP10, LI_RETRY, LI_LINKEDIN, CO_LINKEDIN, FT_TOP10, FT_RETRY, FT_LINKEDIN, FT_CO_LINKEDIN }, null, 1));

// ---- v2 (7 Nov 2026, 21:30): owner's call — keep the original Google step
// exactly as it was; the ONLY addition is LinkedIn people search (Apify) when
// that step returns nothing. No top-10 rescoring, no extra Google queries.
export const LI_PREP = LIB + String.raw`
const p = parsePerson($('Webhook1').first().json.body.input_data || '');
return [{ json: { skip: !p.companyKey.length || p.name.length < 2,
  firstName: p.name[0] || '', lastName: p.name.slice(1).join(' '), organic: [{ title: '', link: '' }] } }];
`;
export const FT_PREP = LIB + FT_PARSE + String.raw`
const organic = ($input.first().json || {}).organic || [];
const original = (organic[0] || {}).link || '';
return [{ json: {
  found: !!original, skip: !p.companyKey.length || p.name.length < 2, original,
  organic: [{ link: original }],
  firstName: p.name[0] || '', lastName: p.name.slice(1).join(' ')
}}];
`;
export const FT_LINKEDIN2 = FT_LINKEDIN.replace("$('FT rescue: top 10')", "$('FT rescue: prepare')");
