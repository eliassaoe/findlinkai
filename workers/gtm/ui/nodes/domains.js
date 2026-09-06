// From the company search to a ranked list of domains.
//
// Three things the earlier version did not do: read the criteria scores it
// paid for, check the country, and rank. It took whatever came back in
// whatever order and the resolution cap downstream then kept the first N.
const cfg = $('Config').first().json;

if (cfg.domains && cfg.domains.length) {
  return cfg.domains.map(domain => ({ json: { domain, source: 'manual' } }));
}

const j = $input.first().json || {};
const rows = j.companies || j.results || j.items || j.data || [];
const clean = d => String(d || '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

const allowed = (cfg.countries || []).map(c => String(c).toUpperCase());
// Country as an ISO code whatever form it arrives in. "Belgium" sliced to two
// letters is "BE" by luck; "Germany" would be "GE". Map names, keep codes.
const ISO = { france:'FR', belgium:'BE', belgique:'BE', luxembourg:'LU', switzerland:'CH', suisse:'CH', germany:'DE',
  allemagne:'DE', spain:'ES', espagne:'ES', italy:'IT', italie:'IT', netherlands:'NL', 'pays-bas':'NL', portugal:'PT',
  ireland:'IE', irlande:'IE', 'united kingdom':'GB', uk:'GB', 'united states':'US', usa:'US', canada:'CA',
  russia:'RU', china:'CN', india:'IN', poland:'PL', austria:'AT', sweden:'SE', denmark:'DK', norway:'NO' };
const iso = v => { const s = String(v || '').trim(); if (!s) return '';
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase(); return ISO[s.toLowerCase()] || ''; };
const country = r => iso(r.country_code || r.country || r.company_country || r.geo);
const size = r => {
  const nums = String(r.employee_count || r.company_size || r.size || '').replace(/[,\s]/g, '').match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : null;
};
// Explee attaches criteria scores 0-5 (with reasoning) when criteria are
// sent. Average them; a company with no scores is neutral, not zero.
const score = r => {
  const c = r.criteria || r.criteria_scores || r.scores;
  if (!Array.isArray(c) || !c.length) return null;
  const vals = c.map(v => Number(typeof v === 'object' ? (v.score ?? v.value) : v)).filter(n => !isNaN(n));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

const dropped = { nodomain: 0, country: 0, size: 0, score: 0 };
const seen = new Set();
const kept = [];
for (const r of rows) {
  const domain = clean(r.domain || r.website || r.company_domain || r.companyWebsite || r.company_website || r.url);
  if (!domain || !domain.includes('.') || seen.has(domain)) { if (!seen.has(domain)) dropped.nodomain++; continue; }
  const cc = country(r);
  if (allowed.length && cc && !allowed.includes(cc)) { dropped.country++; continue; }
  const n = size(r);
  if (cfg.min_company_size && n !== null && n < cfg.min_company_size) { dropped.size++; continue; }
  const sc = score(r);
  if (cfg.min_criterion_score && sc !== null && sc < cfg.min_criterion_score) { dropped.score++; continue; }
  seen.add(domain);
  kept.push({ domain, company: r.name || r.company_name || '', country: cc, score: sc,
              what: r.description || r.company_description || '' });
}
kept.sort((a, b) => (b.score ?? 2.5) - (a.score ?? 2.5));

console.log('Domains: ' + kept.length + ' of ' + rows.length + ' companies kept ' + JSON.stringify(dropped) +
  (kept.length ? '; top: ' + kept.slice(0, 5).map(k => k.domain + (k.score != null ? '(' + k.score.toFixed(1) + ')' : '')).join(', ') : ''));

if (!kept.length) {
  throw new Error('No usable companies. ' + rows.length + ' returned, dropped ' + JSON.stringify(dropped) +
    '. Response keys: ' + Object.keys(j).join(', ') + '. First row: ' + JSON.stringify(rows[0] || j).slice(0, 400));
}
return kept.map(k => ({ json: k }));
