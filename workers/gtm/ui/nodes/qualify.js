// The gate. Runs before anything that costs credits per person.
//
// Semantic title matching is how Explee finds people and why it over-returns;
// Explee's own AutoGTM log shows "Head of Sales Operations" bleeding into 32k
// generic "Head of Sales", fixed by requiring a literal on-target word in the
// real title. This does that, plus country, size, the criterion score, and a
// ranking so the cap downstream keeps the best rather than the first.
const cfg = $('Config').first().json;
const people = $input.first().json.people || [];
const norm = s => String(s || '').toLowerCase();

// Title words: configured, else derived from the target roles so the gate
// is on by default. Short function words are not evidence of anything.
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'of', 'the', 'and', 'in', 'at', 'for', 'en', 'a', 'à']);
const derived = (cfg.job_titles || []).flatMap(t => norm(t).split(/[\s\-\/,]+/))
  .filter(w => w.length > 2 && !STOP.has(w));
const want = ((cfg.title_keywords || []).length ? cfg.title_keywords : derived).map(norm).filter(Boolean);
const banned = (cfg.title_exclude || []).map(norm).filter(Boolean);
const allowed = (cfg.countries || []).map(c => String(c).toUpperCase());
const floor = Number(cfg.min_company_size) || 0;
const minScore = Number(cfg.min_criterion_score) || 0;

const titleOf = p => norm(p.job_title || p.jobTitle || p.title) + ' ' + norm(p.headline);
// Country as an ISO code whatever form it arrives in. "Belgium" sliced to two
// letters is "BE" by luck; "Germany" would be "GE". Map names, keep codes.
const ISO = { france:'FR', belgium:'BE', belgique:'BE', luxembourg:'LU', switzerland:'CH', suisse:'CH', germany:'DE',
  allemagne:'DE', spain:'ES', espagne:'ES', italy:'IT', italie:'IT', netherlands:'NL', 'pays-bas':'NL', portugal:'PT',
  ireland:'IE', irlande:'IE', 'united kingdom':'GB', uk:'GB', 'united states':'US', usa:'US', canada:'CA',
  russia:'RU', china:'CN', india:'IN', poland:'PL', austria:'AT', sweden:'SE', denmark:'DK', norway:'NO' };
const iso = v => { const s = String(v || '').trim(); if (!s) return '';
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase(); return ISO[s.toLowerCase()] || ''; };
const countryOf = p => iso(p.geo || p.country_code || p.country || p._company_country);
const size = p => {
  const nums = String(p.company_size || p.companySize || '').replace(/[,\s]/g, '').match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : null;
};
// Score against the FIRST criterion only. Summing buries a hard no under
// two soft yeses — their log calls that out too.
const score = p => {
  const c = p.criteria || p.criteria_scores || p.scores;
  if (!Array.isArray(c) || !c.length) return null;
  const v = c[0];
  const n = Number(typeof v === 'object' ? (v.score ?? v.value) : v);
  return isNaN(n) ? null : n;
};

const dropped = { title: 0, banned: 0, country: 0, size: 0, score: 0, noname: 0 };
const kept = [];
for (const p of people) {
  const name = p.full_name || p.name || [p.first_name || p.firstName, p.last_name || p.lastName].filter(Boolean).join(' ');
  if (!name) { dropped.noname++; continue; }
  const t = titleOf(p);
  if (want.length && !want.some(w => t.includes(w))) { dropped.title++; continue; }
  if (banned.some(b => t.includes(b))) { dropped.banned++; continue; }
  const cc = countryOf(p);
  if (allowed.length && cc && !allowed.includes(cc)) { dropped.country++; continue; }
  const n = size(p);
  if (floor && n !== null && n < floor) { dropped.size++; continue; }
  const sc = score(p);
  if (minScore && sc !== null && sc < minScore) { dropped.score++; continue; }
  kept.push({ ...p, _score: sc, _name: name });
}

// Best first: person score, then company score, then the ones Explee found.
kept.sort((a, b) =>
  ((b._score ?? 2.5) - (a._score ?? 2.5)) ||
  ((b._company_score ?? 2.5) - (a._company_score ?? 2.5)) ||
  ((a.source === 'explee' ? 0 : 1) - (b.source === 'explee' ? 0 : 1)));

const cap = Number(cfg.max_leads) || kept.length;
const final = kept.slice(0, cap);

console.log('Qualify: kept ' + final.length + ' of ' + people.length +
  ' (dropped ' + JSON.stringify(dropped) + (kept.length > cap ? ', ' + (kept.length - cap) + ' past max_leads' : '') +
  '); title words: ' + want.join('|'));

if (!final.length) {
  throw new Error('Nothing survived Qualify. ' + people.length + ' in, dropped ' + JSON.stringify(dropped) +
    '. Title words were [' + want.join(', ') + '], countries [' + allowed.join(', ') + ']. Titles seen: ' +
    [...new Set(people.map(p => p.job_title || p.jobTitle || p.title))].slice(0, 12).join(' | '));
}
return [{ json: { people: final } }];
