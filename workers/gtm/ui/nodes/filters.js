// Turn the ICP into Explee's own structured filter object.
//
// The first real search proved the point: a prose definition matched
// 1,143,676 companies and the geography inside the sentence was ignored.
// nl-to-filters is Explee's free converter from prose to the structured
// object their own agent uses. This keeps BOTH halves it may return —
// company_filters and people_filters — and falls back to prose only if it
// gave nothing, saying so in the log.
const cfg = $('Config').first().json;
const nl = $input.first().json || {};

const pick = o => {
  if (!o || typeof o !== 'object' || o.error) return null;
  if (o.company_filters || o.people_filters) return { company_filters: o.company_filters || {}, people_filters: o.people_filters || {} };
  if (o.filters && typeof o.filters === 'object') return { company_filters: o.filters, people_filters: {} };
  // A flat object of filter fields
  const keys = Object.keys(o).filter(k => !['query', 'explanation', 'reasoning', 'success', 'meta'].includes(k));
  return keys.length ? { company_filters: Object.fromEntries(keys.map(k => [k, o[k]])), people_filters: {} } : null;
};

let out = pick(nl);
if (out) {
  console.log('Filters from nl-to-filters — company: ' + JSON.stringify(out.company_filters).slice(0, 400) +
              ' | people: ' + JSON.stringify(out.people_filters).slice(0, 200));
} else {
  out = { company_filters: { definition: cfg.definition }, people_filters: {} };
  console.log('nl-to-filters gave nothing usable' + (nl.error ? ' (' + JSON.stringify(nl.error).slice(0, 200) + ')' : ' (response: ' + JSON.stringify(nl).slice(0, 200) + ')') +
              ' — FALLING BACK TO PROSE. The country and size will not be applied in the request; expect a very large match count.');
}
if (!out.company_filters.definition) out.company_filters.definition = cfg.definition;
// Belt and braces: if the converter did not produce a country filter, add
// the one field we are sure of the value for. The key name is the converter's
// to decide; when it returned countries we keep its name, else we try the
// plain one and the request log will show whether Explee accepted it.
const hasCountry = Object.keys(out.company_filters).some(k => /countr|geo|location/i.test(k));
if (!hasCountry && (cfg.countries || []).length) out.company_filters.countries = cfg.countries;

return [{ json: { ...out, filters: out.company_filters, page_size: cfg.page_size } }];
