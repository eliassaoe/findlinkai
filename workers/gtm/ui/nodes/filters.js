// Turn the ICP into Explee's own structured filter object.
//
// The previous flow sent the ICP as a prose `definition` with the geography
// mashed into the sentence, and Explee returned Microsoft for a French
// training-company ICP. `definition` is meant to be a company type ("real
// estate company"); countries and size are separate filters. nl-to-filters
// is Explee's free converter from prose to that object, and their own agent
// uses it — so use it, and fall back to prose only if it fails.
const cfg = $('Config').first().json;
const nl = $input.first().json || {};

// The HTTP node before this one continues on error, so a failure arrives
// here as { error } rather than stopping the flow.
const fromNl = !nl.error && (nl.filters || nl.company_filters ||
  (nl.definition || nl.countries || nl.industries ? nl : null));

let filters;
if (fromNl && typeof fromNl === 'object') {
  filters = { ...fromNl };
  for (const k of ['query', 'explanation', 'reasoning', 'people_filters']) delete filters[k];
  console.log('Filters from nl-to-filters: ' + JSON.stringify(filters).slice(0, 300));
} else {
  filters = { definition: cfg.definition };
  console.log('nl-to-filters gave nothing usable' + (nl.error ? ' (' + JSON.stringify(nl.error).slice(0, 120) + ')' : '') +
              ' — falling back to definition: ' + cfg.definition);
}
if (!filters.definition) filters.definition = cfg.definition;

// Criteria score companies 0-5 each. Explee 400s above three.
const criteria = (cfg.criteria || []).slice(0, 3);
if (criteria.length) filters.criteria = criteria;

return [{ json: { filters, page_size: cfg.page_size } }];
