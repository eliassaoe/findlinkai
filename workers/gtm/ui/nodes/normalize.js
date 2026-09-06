// One item per lead, in one shape, with a brief the writer can use.
//
// Explee answers in snake_case, LinkFinder in camelCase; the brief is the
// curated subset the writer is allowed to notice. The raw row also carries
// NACE sector scores, follower counts, photo urls and a company_geo that said
// CN for Microsoft — noise that dilutes the signal and invites invention.
const cfg = $('Config').first().json;
const j = $input.first().json || {};
let rows = j.people || j.results || j.items || j.contacts || [];
if (!rows.length) throw new Error('No people reached the writer. Upstream answered: ' + JSON.stringify(j).slice(0, 400));

// Only pay to reach people with a live trigger. Signal-based email runs
// 5-18% reply against 1-3% generic, and every lead past this point costs an
// address lookup and a model call — so a lead with nothing happening at their
// company is the most expensive kind to keep. On by default whenever trigger
// agents are configured; the drop is logged and, if it takes everyone, the
// error says so rather than sending nothing quietly.
// A trigger is anything current and true about the company: what the agents
// found, or what the search itself said — hiring, a recent round, growth.
const builtIn = r => {
  const s = {};
  if (r._company_hiring === true) s.hiring = 'the company is hiring right now';
  if (r._company_funding_date && /^\d{4}-\d{2}/.test(String(r._company_funding_date))) {
    const months = (Date.now() - new Date(r._company_funding_date).getTime()) / 2.6e9;
    if (months <= 18) s.funding = 'raised' + (r._company_funding_amount ? ' ' + Math.round(r._company_funding_amount / 1e6) + 'M' : '') + ' in ' + String(r._company_funding_date).slice(0, 7);
  }
  if (typeof r._company_traffic_growth === 'number' && r._company_traffic_growth >= 30) s.growth = 'web traffic up ' + r._company_traffic_growth + '% year on year';
  return s;
};
rows = rows.map(r => { const b = builtIn(r); const sig = { ...b, ...(r.signal || {}) }; return Object.keys(sig).length ? { ...r, signal: sig } : r; });

const withSignal = rows.filter(r => r.signal && Object.keys(r.signal).length);
const agentsOn = (cfg.signal_agents || []).length > 0;
if (cfg.require_signal && !agentsOn && !withSignal.length) {
  // Nothing can feed the gate: no agents were run and the search reported no
  // hiring / funding / growth on any company. Applying it would drop everyone
  // for lack of data, not for lack of a trigger — so it is skipped, loudly.
  console.log('Signal gate skipped: require_signal is on but no agents are configured and the search reported no trigger on any of ' + rows.length + ' companies. Add a signal agent in the console to filter on intent.');
} else if (cfg.require_signal) {
  console.log('Signal gate: ' + withSignal.length + ' of ' + rows.length + ' leads have a live trigger; the rest are not emailed');
  if (!withSignal.length) {
    throw new Error('None of ' + rows.length + ' qualified leads has a trigger — not hiring, no recent round, no traffic growth, and nothing from ' +
      ((cfg.signal_agents || []).join(', ') || 'the agents (none configured)') +
      '. Check the Signals: collect log (was the Wait long enough?), or set require_signal false in Config to email them anyway.');
  }
  rows = withSignal;
}

const pick = (...v) => v.find(x => x != null && x !== '') ?? '';
const NAME = { FR:'France', BE:'Belgium', LU:'Luxembourg', CH:'Switzerland', DE:'Germany', ES:'Spain', IT:'Italy',
  NL:'Netherlands', PT:'Portugal', IE:'Ireland', GB:'United Kingdom', US:'United States', CA:'Canada' };
const placeName = v => { const s = String(v || ''); return /^[A-Za-z]{2}$/.test(s) ? (NAME[s.toUpperCase()] || s) : s; };
return rows.map(c => {
  const first = pick(c.first_name, c.firstName);
  const last = pick(c.last_name, c.lastName);
  const full = pick(c._name, c.full_name, c.name, [first, last].filter(Boolean).join(' '));
  const lead = {
    full_name: full,
    first_name: first || String(full).split(' ')[0] || '',
    last_name: last || String(full).split(' ').slice(1).join(' '),
    email: pick(c.email),
    linkedin_url: pick(c.linkedin_url, c.linkedinUrl, c.linkedin),
    job_title: pick(c.job_title, c.jobTitle, c.title),
    company_name: pick(c.company_name, c.company, c._company),
    company_domain: pick(c.company_domain, c.companyWebsite, c.domain),
    location: placeName(pick(c.city, c.location, c.country, c.geo)),
    source: c.source || '',
    score: c._score ?? null,
  };
  const brief = Object.fromEntries(Object.entries({
    name: full,
    title: lead.job_title,
    headline: c.headline,
    company: lead.company_name,
    what_the_company_does: pick(c.company_description, c._company_what),
    industry: pick(c.company_industry, c.industry),
    company_size: pick(c.company_size, c.companySize),
    where: lead.location,
    // The buying trigger, already compacted by the signals node.
    whats_happening_there: c.signal,
  }).filter(([, v]) => v != null && v !== ''));
  return { json: { ...lead, brief, language: cfg.language || 'lead' } };
});
