// From the company search to a ranked list of domains.
//
// Built against the first real response (25 rows, total 1,143,676). What it
// taught: the prose definition does not narrow anything — geography inside
// the sentence is ignored; `criteria` comes back as an object keyed by the
// criterion text, not an array; and the row already carries geo, size,
// employees_by_department.employees_count_sales, hiring, revenue_annual and
// funding — so most of the ICP can be checked deterministically here instead
// of asked as an AI criterion (which scored 1 "not mentioned" on every row
// for the sales-team question).
const cfg = $('Config').first().json;

if (cfg.domains && cfg.domains.length) {
  return cfg.domains.map(domain => ({ json: { domain, source: 'manual' } }));
}

const j = $input.first().json || {};
const rows = j.companies || j.results || j.items || j.data || [];
const meta = j.meta || {};
const clean = d => String(d || '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

const ISO = { france:'FR', belgium:'BE', belgique:'BE', luxembourg:'LU', switzerland:'CH', suisse:'CH', germany:'DE',
  allemagne:'DE', spain:'ES', espagne:'ES', italy:'IT', italie:'IT', netherlands:'NL', 'pays-bas':'NL', portugal:'PT',
  ireland:'IE', irlande:'IE', 'united kingdom':'GB', uk:'GB', 'united states':'US', usa:'US', canada:'CA',
  russia:'RU', china:'CN', india:'IN', poland:'PL', austria:'AT', sweden:'SE', denmark:'DK', norway:'NO' };
const iso = v => { const s = String(v || '').trim(); if (!s) return ''; if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase(); return ISO[s.toLowerCase()] || ''; };
const allowed = (cfg.countries || []).map(c => String(c).toUpperCase());
const country = r => iso(r.geo || r.country_code || r.country || r.company_country);
const num = v => { const n = Number(String(v ?? '').replace(/[,\s]/g, '').match(/\d+(\.\d+)?/)?.[0]); return isNaN(n) ? null : n; };

// criteria: {"Vente B2B active": {score, reasoning}} in the real response;
// tolerate the array form too.
const scores = r => {
  const c = r.criteria || r.criteria_scores || r.scores;
  if (!c) return [];
  const list = Array.isArray(c) ? c : Object.values(c);
  return list.map(v => Number(typeof v === 'object' ? (v.score ?? v.value) : v)).filter(n => !isNaN(n));
};
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

const minSize = Number(cfg.min_company_size) || 0;
const maxSize = Number(cfg.max_company_size) || 0;
const maxSales = Number(cfg.max_sales_team) || 0;
const maxRevenue = Number(cfg.max_revenue) || 0;
const minScore = Number(cfg.min_criterion_score) || 0;

const dropped = { nodomain: 0, country: 0, size: 0, sales_team: 0, revenue: 0, score: 0 };
const seen = new Set();
const kept = [];
for (const r of rows) {
  const domain = clean(r.domain || r.website || r.company_domain || r.companyWebsite || r.company_website || r.url);
  if (!domain || !domain.includes('.')) { dropped.nodomain++; continue; }
  if (seen.has(domain)) continue;
  // With a million-row match, a row with no country is not worth a lookup.
  const cc = country(r);
  if (allowed.length && !allowed.includes(cc)) { dropped.country++; continue; }
  const size = num(r.size ?? r.employee_count ?? r.company_size);
  if (minSize && size !== null && size < minSize) { dropped.size++; continue; }
  if (maxSize && size !== null && size > maxSize) { dropped.size++; continue; }
  const sales = num(r.employees_by_department && r.employees_by_department.employees_count_sales);
  if (maxSales && sales !== null && sales > maxSales) { dropped.sales_team++; continue; }
  // A 35-person "training centre" on microsoft.com with $305B revenue is the
  // domain's revenue, and the domain is what the people search will use.
  const revenue = num(r.revenue_annual);
  if (maxRevenue && revenue !== null && revenue > maxRevenue) { dropped.revenue++; continue; }
  const sc = avg(scores(r));
  if (minScore && sc !== null && sc < minScore) { dropped.score++; continue; }
  seen.add(domain);
  kept.push({
    domain, company: r.name || r.company_name || '', country: cc, size, sales_team: sales, score: sc,
    linkedin_id: r.linkedin_id || null,
    what: r.description || r.company_description || '',
    industry: r.industry || '',
    // Signals the search already gives for free — no agent run needed.
    hiring: r.hiring === true || r.hiring_is === true,
    funding_date: r.funding_last_round_date || r.funding_date || null,
    funding_amount: num(r.funding_last_round_amount) || null,
    traffic_growth: num(r.traffic_growth),
    founded: num(r.founded),
  });
}
kept.sort((a, b) => (b.score ?? 2.5) - (a.score ?? 2.5) || (b.hiring ? 1 : 0) - (a.hiring ? 1 : 0));

const total = num(meta.total);
console.log('Domains: ' + kept.length + ' of ' + rows.length + ' companies kept ' + JSON.stringify(dropped) +
  (total !== null ? ' | definition matched ' + total.toLocaleString() + ' companies in total' : '') +
  (kept.length ? ' | top: ' + kept.slice(0, 5).map(k => k.domain + ' ' + k.country + (k.size != null ? ' ' + k.size + 'p' : '') + (k.hiring ? ' hiring' : '')).join(', ') : ''));
if (total !== null && total > 50000) {
  console.log('WARNING: the search is not narrowing (' + total.toLocaleString() + ' matches). The country and size are being applied ' +
    'here, after the fact, on ' + rows.length + ' rows. For a thousand leads the filters must go INTO the request: check the ' +
    'Explee: nl-to-filters output and the Filters node log.');
}
if (!kept.length) {
  throw new Error('No usable companies. ' + rows.length + ' returned' + (total !== null ? ' of ' + total.toLocaleString() + ' matched' : '') +
    ', dropped ' + JSON.stringify(dropped) + '. Countries wanted: ' + allowed.join(',') + '. Countries seen: ' +
    [...new Set(rows.map(country))].join(',') + '. Sizes seen: ' + rows.slice(0, 10).map(r => num(r.size)).join(','));
}
return kept.map(k => ({ json: k }));
