// Explee's people search, with the ICP as request filters. No domain hop.
//
// The company search returns entities mapped onto a parent's web domain
// ("ESIC - Centre de formation" on microsoft.com), so domain -> people hands
// you the parent's staff. This asks Explee for the PEOPLE directly — target
// roles as people_filters, the structured company filters from nl-to-filters
// as company_filters — and Explee joins person to company on its own
// identity, not on a domain. Each row comes back with its company fields.
//
// 1 credit per person (+0.1 per criterion), first 100 free. The request is
// logged in full and so is meta.total, because the last two sourcing
// attempts failed silently and that is not allowed to happen a third time.
const cfg = $('Config').first().json;
const f = $input.first().json || {};
if (!this.helpers || !this.helpers.httpRequest) throw new Error('This n8n has no this.helpers.httpRequest in Code nodes.');
if (!cfg.explee_key || cfg.explee_key.startsWith('PUT_')) throw new Error('No Explee key in Config.');

const company_filters = { ...(f.company_filters || f.filters || {}) };
delete company_filters.criteria;                       // criteria score people here, not companies
const people_filters = { ...(f.people_filters || {}) };
people_filters.job_titles = (people_filters.job_titles || cfg.job_titles || ['Founder', 'Director']).slice(0, 20);
const criteria = (cfg.criteria || []).slice(0, 3);
if (criteria.length) people_filters.criteria = criteria;

const body = { people_filters, company_filters, page_size: Number(cfg.page_size) || 100 };
console.log('People search request: ' + JSON.stringify(body));

let res;
try {
  res = await this.helpers.httpRequest({ method: 'POST', json: true, timeout: 120000,
    url: 'https://api.explee.com/public/api/v1/search/people',
    headers: { 'X-API-Key': cfg.explee_key }, body });
} catch (e) {
  // Explee's 4xx bodies name the offending field ("Maximum 3 criteria
  // allowed"); surface it verbatim rather than guessing at a fix.
  throw new Error('Explee /search/people rejected the request: ' + e.message + ' — request was ' + JSON.stringify(body).slice(0, 600));
}

const rows = (res && (res.people || res.results || res.items)) || [];
const meta = (res && res.meta) || {};
const clean = d => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const num = v => { const n = Number(String(v ?? '').replace(/[,\s]/g, '').match(/\d+(\.\d+)?/)?.[0]); return isNaN(n) ? null : n; };
// "1001-5000" -> 5000: a size range is read at its upper bound, the same way
// Qualify reads it, so a ceiling of 200 drops "201-500" and keeps "51-200".
const sizeNum = v => { const ns = String(v ?? '').replace(/[,\s]/g, '').match(/\d+/g); return ns ? Math.max(...ns.map(Number)) : null; };

const people = rows.map(p => {
  const c = p.company || {};
  return { ...p, source: 'explee',
    company_domain: clean(p.company_domain || c.domain || p.company_website),
    _company: p.company_name || c.name || '',
    // People rows carry the person's geo; the company's when the API gives it.
    _company_country: p.company_geo || c.geo || p.geo || p.country_code || '',
    _company_size: sizeNum(p.company_size ?? c.size),
    _company_what: p.company_description || c.description || '',
    _company_hiring: p.company_hiring === true || c.hiring === true,
    _company_funding_date: p.company_funding_last_round_date || c.funding_last_round_date || null,
    _company_funding_amount: num(p.company_funding_last_round_amount ?? c.funding_last_round_amount),
    _company_traffic_growth: num(p.company_traffic_growth ?? c.traffic_growth),
    _company_revenue: num(p.company_revenue_annual ?? c.revenue_annual),
    _company_sales_team: num(p.company_employees_count_sales ?? (c.employees_by_department || {}).employees_count_sales),
  };
});

const total = num(meta.total);
console.log('People search: ' + people.length + ' people returned' + (total !== null ? ' of ' + total.toLocaleString() + ' matched' : '') +
  ', credits ' + (meta.credits_charged ?? '?') + ', balance ' + (meta.remaining_balance ?? '?') +
  (people.length ? ' | e.g. ' + people.slice(0, 3).map(p => (p.first_name || p.name) + ' · ' + (p.title || p.job_title) + ' · ' + p._company + ' ' + (p.geo || '')).join(' / ') : ''));
if (total !== null && total > 200000) {
  console.log('WARNING: ' + total.toLocaleString() + ' people matched — the company_filters are not narrowing. Check the Filters node: ' +
    'if nl-to-filters gave nothing, the fallback is prose and the country is not being applied in the request.');
}
if (!people.length) {
  throw new Error('Explee /search/people returned no people. Response keys: ' + Object.keys(res || {}).join(', ') +
    ' | meta: ' + JSON.stringify(meta).slice(0, 300) + ' | request: ' + JSON.stringify(body).slice(0, 500));
}
return [{ json: { people } }];
