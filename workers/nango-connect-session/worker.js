/**
 * crm-sync-worker.js
 *
 * Findymail "Datacare"-style feature: connect a HubSpot account, and on a
 * weekly cron this worker finds contacts missing whichever fields the user
 * chose to track — email, LinkedIn URL, and/or phone — looks them up via
 * LinkFinder's own enrichment API, and writes them back to HubSpot. ONLY
 * into empty fields, never overwriting something a human already entered
 * ("no override", same behavior Datacare advertises).
 *
 * WHY THIS EXISTS: PostHog data showed 41% of stated cancellation reasons
 * are "notUsing" — people churn because they stopped opening the product,
 * not because of price or a missing feature. A live CRM connection creates
 * value in the background, without requiring the user to remember the tool
 * exists. That's the intended fix for that specific churn segment.
 *
 * FIELDS SUPPORTED (validated against app.html's actual dataConfigurations
 * — `lead_full_name` only supports `email` and `linkedin_url` as direct
 * outputs; phone requires a name -> linkedin_url -> phone chain since
 * `linkedin_profile` is the only input type that yields a phone number):
 *   - email        1 credit  (lead_full_name_to_email)
 *   - linkedin_url 1 credit  (lead_full_name_to_linkedin_url)
 *   - phone        1-2 credits (reuses a LinkedIn URL if already found/on
 *                  file this run, otherwise derives one first, then looks
 *                  up the phone from it)
 * Each field's target HubSpot property name is user-configurable (property
 * internal names vary per HubSpot account), and the max contacts processed
 * per weekly run is user-configurable too (clamped 1-100 server-side).
 *
 * ARCHITECTURE: uses Nango (nango.dev) purely for OAuth token storage +
 * a proxied HubSpot API — NOT Nango's own hosted Functions/Syncs runtime
 * (that pauses every 2 weeks on the free tier). Everything here is plain
 * REST calls to api.nango.dev via fetch(), run on this worker's own cron.
 *
 * Enrichment calls to LinkFinder's own API go through a SERVICE BINDING
 * (env.ENRICH_SERVICE), not a plain fetch() to the public workers.dev URL.
 * A real test run showed every single lookup — including one for someone
 * as findable as "Bill Gates" — failing with Cloudflare error 1042, which
 * is Cloudflare blocking a Worker from fetching another Worker in the SAME
 * account over its public *.workers.dev hostname (a loop-prevention rule,
 * not an application error). A Service Binding calls the other Worker
 * directly over Cloudflare's internal network instead, which sidesteps
 * this restriction entirely — see deployment step 6 below.
 *
 * ─────────────────────────────────────────────────────────────
 * FIXED 2026-08-25 — the subscriber gate refused every paying customer.
 *
 * isSubscriber is declared `isSubscriber(env, token)`. Two call sites passed
 * only one argument, so `env` received the token string, `env.SUBSCRIBER_SERVICE`
 * was undefined, the `{ fetch }` fallback made a same-account Worker-to-Worker
 * call over a public workers.dev hostname, Cloudflare blocked it with error
 * 1042, and the fail-closed catch returned false. Effect: /push-contacts 403'd
 * every customer including subscribers, and the Monday cron skipped every
 * connection while logging only "not a subscriber, skipping sync".
 *
 * Both now pass `env` first — see handlePushContacts and syncOneConnection.
 * Nothing else in this file changed.
 * ─────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────
 * DEPLOYMENT REQUIREMENTS:
 * 1. Create a Cloudflare Worker and name it EXACTLY `nango-connect-session`
 *    — account.html and crm-sync.html already have this worker's expected
 *    URL hardcoded as `https://nango-connect-session.hamoureliasse.workers.dev/`.
 * 2. Create a Cloudflare KV namespace, bind it as `CRM_CONNECTIONS`.
 * 3. Set the `NANGO_SECRET_KEY` secret (Settings > Variables and secrets >
 *    Add > mark as Secret). NEVER commit this value to any file.
 * 3b. OPTIONAL, to offer more than HubSpot: set the plain variable
 *    `CRM_INTEGRATIONS` to a comma-separated list of Nango integration ids,
 *    e.g. `hubspot-9mj3,salesforce,zoho`. Left unset, only HubSpot is offered.
 *
 *    Add an id here ONLY after creating that integration in the Nango
 *    dashboard with the CRM's own OAuth credentials. Nango rejects a Connect
 *    session naming an integration that does not exist, which would break
 *    connecting entirely — HubSpot included, not just the new CRM.
 *
 *    Supported ids are the keys of CRM_ADAPTERS below: hubspot-9mj3,
 *    salesforce, pipedrive, zoho, close. Connecting and on-demand enrichment
 *    work for all of them; the weekly cron below runs for HubSpot only (see
 *    syncSupported).
 * 4. Add a Cron Trigger: Settings > Triggers > Cron Triggers > `0 10 * * 1`
 *    (weekly, Monday 10am UTC — an hour after the saved-search-alerts run,
 *    to spread out load).
 * 5. Primary connection-tracking path: the frontend's `onEvent` 'connect'
 *    handler calls this worker's `/finalize-connection` directly with the
 *    connectionId Nango's Connect UI hands back client-side — reliable, no
 *    extra dashboard config needed. `/nango-webhook` below is a defensive
 *    fallback ONLY — not required to ship.
 * 6. REQUIRED for enrichment to actually work: on this worker's Settings >
 *    Bindings > Add binding > Service binding:
 *      - Variable name: ENRICH_SERVICE
 *      - Service: the Worker that serves linkfinderapp.hamoureliasse.workers.dev
 *        (its Cloudflare Worker name — almost certainly `linkfinderapp`,
 *        matching the subdomain, but confirm against the actual Worker list)
 *      - Environment: production
 *    Without this binding, every enrichment lookup will fail with error 1042.
 * 7. SUBSCRIBER_SERVICE must also be bound (Service binding -> upgrade-intent).
 *    It already is, but the same 1042 rule applies if it is ever removed.
 * ─────────────────────────────────────────────────────────────
 */

const ALLOWED_ORIGINS = [
  'https://linkfinderai.com',
  'https://www.linkfinderai.com',
];

const NANGO_API_BASE = 'https://api.nango.dev';
const HUBSPOT_INTEGRATION_ID = 'hubspot-9mj3'; // from the Nango dashboard — update if you recreate the integration

// ─────────────────────────────────────────────────────────────
// CRM adapters
//
// Everything below the connect step is the same three operations in every CRM:
// list a page of contacts, find one by email, write fields onto it. Only the
// request shapes differ — HubSpot wraps fields in `properties`, Zoho in
// `data[0]`, Pipedrive keeps email and phone as arrays of objects, Salesforce
// answers SOQL. So that difference is all an adapter is.
//
// Each adapter is handed a `proxy(path, options)` bound to one connection, so
// none of them touch Nango or env directly — which is what makes them testable
// without a worker runtime.
//
// IMPORTANT: an entry here is not the same as an enabled CRM. Every one needs an
// integration created in the Nango dashboard with that CRM's OAuth credentials
// first. `enabledIntegrations()` reads the CRM_INTEGRATIONS env var, so a CRM is
// offered only once someone has actually configured it — a missing integration
// id in allowed_integrations fails the whole Connect session, including HubSpot's.
// ─────────────────────────────────────────────────────────────

const CRM_ADAPTERS = {
  // ── HubSpot ────────────────────────────────────────────────
  'hubspot-9mj3': {
    id: 'hubspot-9mj3',
    label: 'HubSpot',
    object: 'contact',
    defaultFields: { email: 'email', linkedin_url: 'linkedinbio', phone: 'phone' },
    standardMap: { firstName: 'firstname', lastName: 'lastname', company: 'company', jobTitle: 'jobtitle' },
    // Only set where the weekly sync can run: it needs a first/last name and a
    // company domain ON the contact to build an enrichment input. The other
    // CRMs keep company on a related record, so they get connect and on-demand
    // enrichment but not the unattended job — see syncSupported().
    syncReadMap: { firstName: 'firstname', lastName: 'lastname', company: 'company', website: 'website' },

    async listProperties(proxy) {
      const r = await proxy('/crm/v3/properties/contacts', { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return (d.results || []).map((p) => ({ name: p.name, label: p.label || p.name }));
    },

    async listContacts(proxy, { limit, properties, cursor }) {
      const params = new URLSearchParams({ limit: String(limit), properties: properties.join(',') });
      if (cursor) params.set('after', cursor);
      const r = await proxy(`/crm/v3/objects/contacts?${params}`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return {
        contacts: (d.results || []).map((x) => ({ id: x.id, props: x.properties || {} })),
        cursor: d.paging?.next?.after || null,
      };
    },

    async findByEmail(proxy, email, properties) {
      const r = await proxy('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
          properties,
          limit: 1,
        }),
      });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      const hit = (d.results || [])[0];
      return hit ? { id: hit.id, props: hit.properties || {} } : null;
    },

    patch: (proxy, id, props) =>
      proxy(`/crm/v3/objects/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ properties: props }) }),

    async create(proxy, props) {
      const r = await proxy('/crm/v3/objects/contacts', { method: 'POST', body: JSON.stringify({ properties: props }) });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json().catch(() => ({}));
      return { ok: true, id: d.id };
    },
  },

  // ── Salesforce ─────────────────────────────────────────────
  // Contact has no Company field — that lives on the related Account — so
  // `company` is deliberately absent from standardMap rather than mapped to
  // something that would silently fail to write.
  'salesforce': {
    id: 'salesforce',
    label: 'Salesforce',
    object: 'Contact',
    apiVersion: 'v59.0',
    defaultFields: { email: 'Email', linkedin_url: 'LinkedIn_URL__c', phone: 'Phone' },
    standardMap: { firstName: 'FirstName', lastName: 'LastName', jobTitle: 'Title' },

    async listProperties(proxy) {
      const r = await proxy('/services/data/v59.0/sobjects/Contact/describe', { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return (d.fields || [])
        .filter((f) => f.updateable)
        .map((f) => ({ name: f.name, label: f.label || f.name }));
    },

    async listContacts(proxy, { limit, properties, cursor }) {
      // Salesforce paginates with a nextRecordsUrl rather than a cursor param.
      const path = cursor || `/services/data/v59.0/query?q=${encodeURIComponent(
        `SELECT Id, ${properties.join(', ')} FROM Contact LIMIT ${limit}`,
      )}`;
      const r = await proxy(path, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return {
        contacts: (d.records || []).map((x) => {
          const { Id, attributes, ...props } = x;
          return { id: Id, props };
        }),
        cursor: d.done === false ? d.nextRecordsUrl : null,
      };
    },

    async findByEmail(proxy, email, properties) {
      // Escape single quotes; a SOQL string literal breaks on an unescaped one.
      const safe = String(email).replace(/'/g, "\\'");
      const q = `SELECT Id, ${properties.join(', ')} FROM Contact WHERE Email = '${safe}' LIMIT 1`;
      const r = await proxy(`/services/data/v59.0/query?q=${encodeURIComponent(q)}`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      const hit = (d.records || [])[0];
      if (!hit) return null;
      const { Id, attributes, ...props } = hit;
      return { id: Id, props };
    },

    // Salesforce takes the field map as the bare body and answers 204 No Content.
    patch: (proxy, id, props) =>
      proxy(`/services/data/v59.0/sobjects/Contact/${id}`, { method: 'PATCH', body: JSON.stringify(props) }),

    async create(proxy, props) {
      const r = await proxy('/services/data/v59.0/sobjects/Contact', { method: 'POST', body: JSON.stringify(props) });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json().catch(() => ({}));
      return { ok: true, id: d.id };
    },
  },

  // ── Pipedrive ──────────────────────────────────────────────
  // email and phone are arrays of { value, primary } rather than strings, both
  // on read and on write, so this adapter normalises in both directions.
  'pipedrive': {
    id: 'pipedrive',
    label: 'Pipedrive',
    object: 'person',
    defaultFields: { email: 'email', linkedin_url: 'linkedin_url', phone: 'phone' },
    standardMap: { jobTitle: 'job_title' },
    arrayFields: ['email', 'phone'],

    async listProperties(proxy) {
      const r = await proxy('/v1/personFields', { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      // Custom fields are addressed by a 40-char hash, not a readable name, so
      // the key is what must be written back even though the label is shown.
      return (d.data || []).map((f) => ({ name: f.key, label: f.name || f.key }));
    },

    async listContacts(proxy, { limit, cursor }) {
      const params = new URLSearchParams({ limit: String(limit), start: String(cursor || 0) });
      const r = await proxy(`/v1/persons?${params}`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      const more = d.additional_data?.pagination;
      return {
        contacts: (d.data || []).map((x) => ({ id: x.id, props: flattenPipedrive(x) })),
        cursor: more?.more_items_in_collection ? more.next_start : null,
      };
    },

    async findByEmail(proxy, email) {
      const params = new URLSearchParams({ term: email, fields: 'email', exact_match: 'true', limit: '1' });
      const r = await proxy(`/v1/persons/search?${params}`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      const hit = (d.data?.items || [])[0]?.item;
      return hit ? { id: hit.id, props: flattenPipedrive(hit) } : null;
    },

    patch: (proxy, id, props) =>
      proxy(`/v1/persons/${id}`, { method: 'PUT', body: JSON.stringify(shapePipedrive(props)) }),

    async create(proxy, props) {
      const r = await proxy('/v1/persons', { method: 'POST', body: JSON.stringify(shapePipedrive(props)) });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json().catch(() => ({}));
      return { ok: true, id: d.data?.id };
    },
  },

  // ── Zoho CRM ───────────────────────────────────────────────
  // Every read and write wraps records in a `data` array, even for one record.
  'zoho': {
    id: 'zoho',
    label: 'Zoho CRM',
    object: 'Contacts',
    defaultFields: { email: 'Email', linkedin_url: 'LinkedIn_URL', phone: 'Phone' },
    standardMap: { firstName: 'First_Name', lastName: 'Last_Name', company: 'Account_Name', jobTitle: 'Title' },

    async listProperties(proxy) {
      const r = await proxy('/crm/v2/settings/fields?module=Contacts', { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return (d.fields || [])
        .filter((f) => !f.read_only)
        .map((f) => ({ name: f.api_name, label: f.field_label || f.api_name }));
    },

    async listContacts(proxy, { limit, properties, cursor }) {
      const params = new URLSearchParams({ per_page: String(limit), page: String(cursor || 1), fields: properties.join(',') });
      const r = await proxy(`/crm/v2/Contacts?${params}`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return {
        contacts: (d.data || []).map((x) => ({ id: x.id, props: x })),
        cursor: d.info?.more_records ? Number(cursor || 1) + 1 : null,
      };
    },

    async findByEmail(proxy, email) {
      const r = await proxy(`/crm/v2/Contacts/search?email=${encodeURIComponent(email)}`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      const hit = (d.data || [])[0];
      return hit ? { id: hit.id, props: hit } : null;
    },

    patch: (proxy, id, props) =>
      proxy(`/crm/v2/Contacts/${id}`, { method: 'PUT', body: JSON.stringify({ data: [props] }) }),

    async create(proxy, props) {
      const r = await proxy('/crm/v2/Contacts', { method: 'POST', body: JSON.stringify({ data: [props] }) });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json().catch(() => ({}));
      return { ok: true, id: (d.data || [])[0]?.details?.id };
    },
  },

  // ── Close ──────────────────────────────────────────────────
  // Endpoints keep their trailing slash — dropping it redirects. Emails and
  // phones are arrays of objects, like Pipedrive but with different keys.
  'close': {
    id: 'close',
    label: 'Close',
    object: 'contact',
    defaultFields: { email: 'email', linkedin_url: 'custom.linkedin_url', phone: 'phone' },
    standardMap: { jobTitle: 'title' },
    arrayFields: ['email', 'phone'],

    async listProperties(proxy) {
      const r = await proxy('/api/v1/custom_field/contact/', { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      const custom = (d.data || []).map((f) => ({ name: `custom.${f.id}`, label: f.name || f.id }));
      return [
        { name: 'email', label: 'Email' },
        { name: 'phone', label: 'Phone' },
        { name: 'title', label: 'Title' },
        ...custom,
      ];
    },

    async listContacts(proxy, { limit, cursor }) {
      const params = new URLSearchParams({ _limit: String(limit), _skip: String(cursor || 0) });
      const r = await proxy(`/api/v1/contact/?${params}`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return {
        contacts: (d.data || []).map((x) => ({ id: x.id, props: flattenClose(x) })),
        cursor: d.has_more ? Number(cursor || 0) + limit : null,
      };
    },

    async findByEmail(proxy, email) {
      const r = await proxy(`/api/v1/contact/?query=${encodeURIComponent('email:' + email)}&_limit=1`, { method: 'GET' });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      const hit = (d.data || [])[0];
      return hit ? { id: hit.id, props: flattenClose(hit) } : null;
    },

    patch: (proxy, id, props) =>
      proxy(`/api/v1/contact/${id}/`, { method: 'PUT', body: JSON.stringify(shapeClose(props)) }),

    async create(proxy, props) {
      const r = await proxy('/api/v1/contact/', { method: 'POST', body: JSON.stringify(shapeClose(props)) });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json().catch(() => ({}));
      return { ok: true, id: d.id };
    },
  },
};

// Pipedrive returns [{ value, primary }] for email/phone; the rest of this
// worker compares plain strings, so read the primary entry (or the first).
function flattenPipedrive(person) {
  const pick = (v) => (Array.isArray(v) ? (v.find((e) => e.primary) || v[0] || {}).value : v);
  return { ...person, email: pick(person.email), phone: pick(person.phone) };
}

function shapePipedrive(props) {
  const out = { ...props };
  for (const key of ['email', 'phone']) {
    if (out[key] !== undefined) out[key] = [{ value: out[key], primary: true }];
  }
  return out;
}

function flattenClose(contact) {
  const first = (arr, key) => (Array.isArray(arr) ? (arr[0] || {})[key] : undefined);
  return { ...contact, email: first(contact.emails, 'email'), phone: first(contact.phones, 'phone') };
}

function shapeClose(props) {
  const out = { ...props };
  if (out.email !== undefined) { out.emails = [{ email: out.email, type: 'office' }]; delete out.email; }
  if (out.phone !== undefined) { out.phones = [{ phone: out.phone, type: 'office' }]; delete out.phone; }
  return out;
}

/** Whether the unattended weekly sync can run against this CRM. */
function syncSupported(providerConfigKey) {
  return Boolean(adapterFor(providerConfigKey).syncReadMap);
}

/** The integration a connection was made against, falling back to HubSpot for
 *  records written before this worker knew about more than one CRM. */
function adapterFor(providerConfigKey) {
  return CRM_ADAPTERS[providerConfigKey] || CRM_ADAPTERS[HUBSPOT_INTEGRATION_ID];
}

/** Which CRMs to offer in the Connect modal. Driven by env so a CRM appears only
 *  once its Nango integration exists — an unknown id fails the whole session. */
function enabledIntegrations(env) {
  const raw = (env && env.CRM_INTEGRATIONS) || '';
  const ids = raw.split(',').map((s) => s.trim()).filter((s) => CRM_ADAPTERS[s]);
  return ids.length ? ids : [HUBSPOT_INTEGRATION_ID];
}


// Same enrichment endpoint the app itself calls for a live lookup — a
// "sync" is a real, credit-costing enrichment, not a special free path.
const ENRICH_WORKER = 'https://linkfinderapp.hamoureliasse.workers.dev/';

const DEFAULT_MAX_PER_RUN = 25;
const HARD_MAX_PER_RUN = 1000; // guardrail against unbounded weekly credit spend, regardless of user setting

const DEFAULT_SETTINGS = {
  maxPerRun: DEFAULT_MAX_PER_RUN,
  fields: {
    email: { enabled: true, hubspotProperty: 'email' },
    // Enabled by default alongside email: both cost 1 credit, and the page's
    // own picker has always defaulted to this pair. Leaving it off here meant
    // anyone who connected without running a manual clean silently got an
    // email-only weekly sync that did not match what the UI said.
    linkedin_url: { enabled: true, hubspotProperty: 'linkedinbio' },
    // Off by default on purpose: at 50 credits it is 50x the others and would
    // dominate an unattended weekly run.
    phone: { enabled: false, hubspotProperty: 'phone' },
  },
};

const VALID_FIELD_KEYS = ['email', 'linkedin_url', 'phone'];

/** DEFAULT_SETTINGS, but with the property names of whichever CRM is connected. */
function defaultSettingsFor(providerConfigKey) {
  const crm = adapterFor(providerConfigKey);
  const fields = {};
  for (const key of VALID_FIELD_KEYS) {
    fields[key] = {
      enabled: DEFAULT_SETTINGS.fields[key].enabled,
      property: crm.defaultFields[key],
    };
  }
  return { maxPerRun: DEFAULT_MAX_PER_RUN, fields };
}

/** Settings were stored with a `hubspotProperty` key before this worker knew
 *  about other CRMs. Read either, so an existing connection keeps working. */
function fieldProperty(field) {
  if (!field) return undefined;
  return field.property !== undefined ? field.property : field.hubspotProperty;
}
// Allows a dot so Close's `custom.<id>` fields are accepted; still no slashes,
// spaces or anything that could alter a request path.
const PROPERTY_NAME_RE = /^[a-zA-Z0-9_.]{1,100}$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (origin && isAllowedOrigin(origin)) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(body), { status, headers });
}

function isEmptyValue(v) {
  return v === undefined || v === null || v === '';
}

// Merges + validates a settings payload against DEFAULT_SETTINGS. Never
// trusts the client blindly — clamps maxPerRun, restricts property names to
// a safe charset, and drops anything not in VALID_FIELD_KEYS.
function sanitizeSettings(input, providerConfigKey) {
  const out = { maxPerRun: DEFAULT_MAX_PER_RUN, fields: {} };
  const src = (input && typeof input === 'object') ? input : {};
  const defaults = defaultSettingsFor(providerConfigKey);

  const maxPerRun = parseInt(src.maxPerRun, 10);
  out.maxPerRun = Number.isFinite(maxPerRun) ? Math.min(HARD_MAX_PER_RUN, Math.max(1, maxPerRun)) : DEFAULT_MAX_PER_RUN;

  for (const key of VALID_FIELD_KEYS) {
    const f = (src.fields && src.fields[key]) || {};
    const raw = fieldProperty(f);
    const prop = (typeof raw === 'string' && PROPERTY_NAME_RE.test(raw.trim())) ? raw.trim() : defaults.fields[key].property;
    out.fields[key] = { enabled: !!f.enabled, property: prop };
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// Nango REST helpers (plain fetch — no @nangohq/node, keeps this worker
// dependency-free like the rest of this project's workers)
// ─────────────────────────────────────────────────────────────

async function nangoCreateConnectSession(env, linkfinderToken) {
  const r = await fetch(`${NANGO_API_BASE}/connect/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.NANGO_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      end_user: { id: linkfinderToken },
      allowed_integrations: enabledIntegrations(env),
    }),
  });
  if (!r.ok) throw new Error(`Nango create session failed: ${r.status} ${await r.text().catch(() => '')}`);
  return r.json();
}

// providerConfigKey defaults to HubSpot for connection records written before
// this worker supported more than one CRM — those have no key stored.
async function nangoProxy(env, connectionId, path, options = {}, providerConfigKey = HUBSPOT_INTEGRATION_ID) {
  const r = await fetch(`${NANGO_API_BASE}/proxy${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.NANGO_SECRET_KEY}`,
      'Connection-Id': connectionId,
      'Provider-Config-Key': providerConfigKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return r;
}

// Nango bills per connection ($50/mo for 20, then $1/connection beyond
// that) — that cost scales with every signup who connects, not just paying
// ones, so this checks against the same subscriber-status worker the rest
// of the app already uses before creating a connection or running a paid
// sync. Checked server-side (not just hidden in the UI) since a hidden
// button is trivially bypassed by calling this worker directly.
//
// CALL THIS AS isSubscriber(env, token) — ALWAYS pass env first. Passing only
// the token silently bypasses the SUBSCRIBER_SERVICE binding, which makes the
// call a same-account workers.dev fetch, which Cloudflare blocks with 1042,
// which the catch below turns into "not a subscriber" for everybody.
async function isSubscriber(env, token) {
  try {
    const call = env.SUBSCRIBER_SERVICE || { fetch };
    const r = await call.fetch('https://upgrade-intent.hamoureliasse.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, trigger: 'crm_sync_gate' }),
    });
    if (!r.ok) return false;
    const d = await r.json().catch(() => ({}));
    return d.issub === true;
  } catch (e) {
    return false; // fail closed — an unreachable status check should never grant access
  }
}

const NOT_SUBSCRIBER_ERROR = 'HubSpot CRM Sync is available on paid plans. Upgrade to connect your CRM.';

// ─────────────────────────────────────────────────────────────
// Connect flow
// ─────────────────────────────────────────────────────────────

// Matches the contract the frontend's connectHubspot() already expects:
// POST { token, integration } -> { connectSession: <token> }
async function handleConnectSession(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token || typeof token !== 'string') return json({ error: 'Missing token' }, 400, origin);
  if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

  try {
    const session = await nangoCreateConnectSession(env, token);
    if (!session?.data?.token) throw new Error('no token in Nango response');
    return json({ connectSession: session.data.token, expiresAt: session.data.expires_at }, 200, origin);
  } catch (e) {
    return json({ error: 'Could not start HubSpot connection. Please try again.' }, 502, origin);
  }
}

// Primary connection-tracking path — called directly from the frontend's
// onEvent('connect') handler with the connectionId Nango's Connect UI hands
// back client-side on success. More reliable than waiting on a webhook.
async function handleFinalizeConnection(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const { token, connectionId } = body;
  // Which CRM the user picked in the Connect modal. Unknown or absent falls
  // back to HubSpot, which is what every connection made before this was.
  const picked = CRM_ADAPTERS[body.providerConfigKey] ? body.providerConfigKey : HUBSPOT_INTEGRATION_ID;
  if (!token || !connectionId) {
    return json({ error: 'Missing token or connectionId' }, 400, origin);
  }

  // Preserve existing settings if this is a reconnect, otherwise start fresh.
  const existingRaw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  const existingSettings = existingRaw ? JSON.parse(existingRaw).settings : null;

  await env.CRM_CONNECTIONS.put(`conn:${token}`, JSON.stringify({
    connectionId,
    providerConfigKey: picked,
    connectedAt: new Date().toISOString(),
    lastSyncedAt: null,
    lastSyncResult: null,
    afterCursor: null,
    settings: existingSettings || defaultSettingsFor(picked),
  }));

  return json({ ok: true }, 200, origin);
}

async function handleStatus(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  const available = enabledIntegrations(env).map((id) => ({ id, label: CRM_ADAPTERS[id].label }));
  if (!raw) return json({ ok: true, connected: false, settings: DEFAULT_SETTINGS, availableCrms: available }, 200, origin);
  const record = JSON.parse(raw);
  const connectedCrm = adapterFor(record.providerConfigKey);
  return json({
    ok: true,
    connected: true,
    connectedAt: record.connectedAt,
    lastSyncedAt: record.lastSyncedAt || null,
    lastSyncResult: record.lastSyncResult || null,
    settings: record.settings || DEFAULT_SETTINGS,
    crm: { id: connectedCrm.id, label: connectedCrm.label, syncSupported: syncSupported(record.providerConfigKey) },
    availableCrms: available,
  }, 200, origin);
}

async function handleSaveSettings(request, env, origin) {
  const { token, settings } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);

  const record = JSON.parse(raw);
  const clean = sanitizeSettings(settings, record.providerConfigKey);
  if (!VALID_FIELD_KEYS.some((k) => clean.fields[k].enabled)) {
    return json({ error: 'Select at least one field to sync.' }, 400, origin);
  }

  await env.CRM_CONNECTIONS.put(`conn:${token}`, JSON.stringify({ ...record, settings: clean }));
  return json({ ok: true, settings: clean }, 200, origin);
}

// Lets the frontend show a dropdown of real HubSpot contact properties
// (by their human label) instead of making users hunt down internal API
// names themselves — the internal `name` is what actually gets stored and
// used for reads/writes/search filters; the `label` is just for display.
async function handleListProperties(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ error: 'No CRM connection found for this token. Connect one first.' }, 404, origin);
  const record = JSON.parse(raw);

  // Each adapter returns { name, label } already filtered to writable fields,
  // since what counts as writable differs per CRM.
  const crm = adapterFor(record.providerConfigKey);
  const proxy = (path, options) => nangoProxy(env, record.connectionId, path, options, record.providerConfigKey);
  const listed = await crm.listProperties(proxy);
  if (!listed) return json({ error: `Could not load ${crm.label} fields.` }, 502, origin);

  const properties = listed.slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));

  return json({ ok: true, crm: crm.label, properties }, 200, origin);
}

// ─────────────────────────────────────────────────────────────
// Push a single enrichment result (or a whole bulk run) straight into
// HubSpot — updates an existing contact (matched by email, "no override"
// like everywhere else in this worker) or creates a new one. Independent
// of the weekly-sync field toggles: this pushes whatever the caller found,
// regardless of which fields are enabled for the background job.
// ─────────────────────────────────────────────────────────────

const STANDARD_PROPERTY_MAP = { firstName: 'firstname', lastName: 'lastname', company: 'company', jobTitle: 'jobtitle' };

async function pushOneContact(env, connectionId, settings, contact, providerConfigKey) {
  const crm = adapterFor(providerConfigKey);
  const proxy = (path, options) => nangoProxy(env, connectionId, path, options, providerConfigKey);

  const props = {};
  if (contact.email) props[fieldProperty(settings.fields.email)] = contact.email;
  if (contact.phone) props[fieldProperty(settings.fields.phone)] = contact.phone;
  if (contact.linkedinUrl) props[fieldProperty(settings.fields.linkedin_url)] = contact.linkedinUrl;
  // Only the standard fields this CRM actually has — Salesforce has no Company
  // on a Contact, so it is absent from that adapter's map rather than mapped to
  // a field that would fail to write.
  for (const [key, property] of Object.entries(crm.standardMap)) {
    if (contact[key]) props[property] = contact[key];
  }
  if (!Object.keys(props).length) return { action: 'skipped', reason: 'no usable fields' };

  if (contact.email) {
    const existing = await crm.findByEmail(proxy, contact.email, Object.keys(props));
    if (existing) {
      // No override — only send properties that are actually empty on the
      // existing record, same rule as the weekly sync.
      const writeBack = {};
      for (const [k, v] of Object.entries(props)) {
        if (isEmptyValue(existing.props[k])) writeBack[k] = v;
      }
      if (!Object.keys(writeBack).length) return { action: 'skipped', reason: 'already complete', contactId: existing.id };
      const patchResp = await crm.patch(proxy, existing.id, writeBack);
      return patchResp.ok
        ? { action: 'updated', contactId: existing.id }
        : { action: 'failed', reason: `PATCH ${patchResp.status}` };
    }
  }

  // No email, or no existing match found — create a new contact. No dedupe
  // attempt possible without an email to key off of.
  const created = await crm.create(proxy, props);
  return created.ok
    ? { action: 'created', contactId: created.id }
    : { action: 'failed', reason: `CREATE ${created.status}` };
}

async function handlePushContacts(request, env, origin) {
  const { token, contacts } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);
  if (!Array.isArray(contacts) || !contacts.length) return json({ error: 'No contacts provided' }, 400, origin);
  if (contacts.length > 500) return json({ error: 'Max 500 contacts per push — split into smaller batches' }, 400, origin);
  // FIX: was isSubscriber(token) — one argument bypassed the service binding
  // and 403'd every customer. env must come first.
  if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);
  const record = JSON.parse(raw);
  const settings = sanitizeSettings(record.settings || DEFAULT_SETTINGS, record.providerConfigKey);

  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const contact of contacts) {
    try {
      const result = await pushOneContact(env, record.connectionId, settings, contact, record.providerConfigKey);
      tally[result.action] = (tally[result.action] || 0) + 1;
    } catch (e) {
      tally.failed++;
      console.error('[push-contacts] failed for', contact.email || contact.linkedinUrl || '(no id)', e);
    }
  }

  return json({ ok: true, ...tally }, 200, origin);
}

// ─────────────────────────────────────────────────────────────
// CRM Health — read-only contact dump so the audit can score a connected
// CRM without asking for a CSV export. Never writes, never spends credits.
// ─────────────────────────────────────────────────────────────

const AUDIT_MAX_CONTACTS = 5000;   // the score is a rate, so a sample is representative
const AUDIT_PAGE_SIZE = 100;       // HubSpot's max per page on the list endpoint
const AUDIT_PROPERTIES = ['firstname', 'lastname', 'email', 'company', 'jobtitle', 'phone', 'linkedinbio', 'website'];

async function handleAuditContacts(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);
  if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);
  const { connectionId } = JSON.parse(raw);

  const contacts = [];
  let after = null;
  let pages = 0;

  while (contacts.length < AUDIT_MAX_CONTACTS) {
    const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), properties: AUDIT_PROPERTIES.join(',') });
    if (after) params.set('after', after);

    const resp = await nangoProxy(env, connectionId, `/crm/v3/objects/contacts?${params}`, { method: 'GET' });
    if (!resp.ok) {
      // Partial data still scores usefully — only fail outright if page 1 failed.
      if (!contacts.length) return json({ error: 'Could not read your contacts from HubSpot.' }, 502, origin);
      break;
    }

    const data = await resp.json().catch(() => ({}));
    const results = data.results || [];
    if (!results.length) break;

    for (const r of results) {
      const props = r.properties || {};
      const flat = {};
      // Every requested key must be present, '' when empty: the audit keys its
      // column detection off the object's keys, so a missing key reads as a
      // missing column and under-reports the gap.
      for (const key of AUDIT_PROPERTIES) {
        const v = props[key];
        flat[key] = (v === undefined || v === null) ? '' : String(v);
      }
      contacts.push(flat);
    }

    after = data.paging && data.paging.next && data.paging.next.after;
    if (!after) break;
    if (++pages > 60) break; // hard stop against an unbounded loop
  }

  const sampled = contacts.slice(0, AUDIT_MAX_CONTACTS);
  return json({ ok: true, contacts: sampled, sampled: sampled.length, capped: contacts.length >= AUDIT_MAX_CONTACTS }, 200, origin);
}

async function handleDisconnect(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);
  await env.CRM_CONNECTIONS.delete(`conn:${token}`);
  return json({ ok: true }, 200, origin);
}

// Nango webhook — fires when a connection is created (and other lifecycle
// events). Best-effort payload parsing; see the deployment note at the top
// of this file about verifying the exact shape on first real connection.
async function handleNangoWebhook(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return new Response('ignored', { status: 200 });

  const connectionId = body.connectionId || body.connection_id || body?.data?.connectionId;
  const providerConfigKey = body.providerConfigKey || body.provider_config_key || body?.data?.providerConfigKey;
  const endUserId = body?.endUser?.endUserId || body?.end_user?.id || body?.data?.endUser?.endUserId;
  const success = body.success !== false;

  if (!connectionId || !endUserId || !success) return new Response('ignored', { status: 200 });
  // Accept any CRM this worker has an adapter for; anything else is genuinely
  // not ours and is ignored as before.
  if (providerConfigKey && !CRM_ADAPTERS[providerConfigKey]) {
    return new Response('ignored - different integration', { status: 200 });
  }

  const existingRaw = await env.CRM_CONNECTIONS.get(`conn:${endUserId}`);
  const existingSettings = existingRaw ? JSON.parse(existingRaw).settings : null;

  await env.CRM_CONNECTIONS.put(`conn:${endUserId}`, JSON.stringify({
    connectionId,
    providerConfigKey: providerConfigKey || HUBSPOT_INTEGRATION_ID,
    connectedAt: new Date().toISOString(),
    lastSyncedAt: null,
    lastSyncResult: null,
    afterCursor: null,
    settings: existingSettings || DEFAULT_SETTINGS,
  }));

  return new Response('ok', { status: 200 });
}

// ─────────────────────────────────────────────────────────────
// Weekly sync — find contacts missing the configured fields, enrich, write
// back only into the empty fields.
// ─────────────────────────────────────────────────────────────

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

function domainFromWebsite(website) {
  if (!website) return '';
  return String(website).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

async function runEnrichment(env, linkfinderToken, payload) {
  const sentBody = { token: linkfinderToken, is_bulk: false, ...payload };
  // Service binding, not a plain fetch() — see the file-header note on
  // Cloudflare error 1042 (same-account Worker-to-Worker calls over the
  // public *.workers.dev hostname get blocked; a binding routes internally).
  const resp = await env.ENRICH_SERVICE.fetch(ENRICH_WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sentBody),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.log(`[crm-sync] enrichment call rejected: status ${resp.status}, sent ${JSON.stringify(sentBody)}, response: ${errText.slice(0, 500)}`);
    return null; // out of credits, no match, or a rejected request — logged above either way
  }
  const data = await resp.json().catch(() => null);
  return data;
}

// Response shapes vary per output type — confirmed live: a single-lookup
// call actually returns {result: "<string>", status: "success"}, i.e. a
// `result` key alongside sibling metadata, not the single-key-only wrapper
// history.html's unwrapResult assumes for its (bulk-log) use case. Recurse
// through `result` nesting regardless of sibling keys, since `result` here
// means "the value", not "the only thing in this object".
function unwrapResult(r) {
  if (r && typeof r === 'object' && !Array.isArray(r) && 'result' in r) {
    return unwrapResult(r.result);
  }
  return r;
}

function extractStringValue(data, candidateKeys) {
  const r = unwrapResult(data);
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object') {
    for (const key of candidateKeys) {
      if (typeof r[key] === 'string' && r[key]) return r[key];
    }
  }
  return null;
}

async function syncOneConnection(env, linkfinderToken, record) {
  const { connectionId, afterCursor } = record;

  // Re-checked on every sync run, not just at connect time — if someone
  // connected while subscribed and later cancels, their connection should
  // stop actively running (and costing) rather than keep syncing forever.
  //
  // FIX: was isSubscriber(linkfinderToken) — one argument bypassed the
  // service binding, so this bailed with notSubscriber for every customer
  // and the Monday cron never processed a single connection.
  if (!(await isSubscriber(env, linkfinderToken))) {
    console.log(`[crm-sync] ${linkfinderToken}: not a subscriber, skipping sync`);
    return { processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 }, filledTotal: 0, notSubscriber: true };
  }

  // The unattended job needs a name and a company domain ON the contact to build
  // an enrichment input. Only HubSpot keeps both there; Salesforce, Pipedrive and
  // Close hold company on a related record, so an unattended run would spend
  // credits looking up names with no company attached. Those CRMs connect and
  // enrich on demand — this job stays off for them until the related-record read
  // is built, rather than running badly.
  if (!syncSupported(record.providerConfigKey)) {
    const crm = adapterFor(record.providerConfigKey);
    console.log(`[crm-sync] ${linkfinderToken}: weekly sync not supported for ${crm.label}, skipping`);
    return {
      processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 }, filledTotal: 0,
      unsupportedCrm: crm.label,
    };
  }

  const settings = sanitizeSettings(record.settings || DEFAULT_SETTINGS, record.providerConfigKey);
  const enabledKeys = VALID_FIELD_KEYS.filter((k) => settings.fields[k].enabled);

  if (!enabledKeys.length) {
    return { processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 }, filledTotal: 0 };
  }

  // 1. Search HubSpot for contacts missing ANY of the enabled fields
  // (each enabled field is its own OR'd filterGroup).
  const requestedProperties = new Set(['firstname', 'lastname', 'company', 'website']);
  enabledKeys.forEach((k) => requestedProperties.add(fieldProperty(settings.fields[k])));

  const searchBody = {
    filterGroups: enabledKeys.map((k) => ({
      filters: [{ propertyName: fieldProperty(settings.fields[k]), operator: 'NOT_HAS_PROPERTY' }],
    })),
    properties: Array.from(requestedProperties),
    limit: settings.maxPerRun,
    ...(afterCursor ? { after: afterCursor } : {}),
  };

  const searchResp = await nangoProxy(env, connectionId, '/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify(searchBody),
  }, record.providerConfigKey);

  if (!searchResp.ok) {
    // Connection likely revoked/expired on the HubSpot side — skip quietly,
    // don't retry every run for a connection that can't be reached.
    console.log(`[crm-sync] search failed for ${linkfinderToken}: ${searchResp.status}`);
    return { processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 }, filledTotal: 0 };
  }

  const searchData = await searchResp.json().catch(() => ({}));
  const contacts = searchData.results || [];
  const nextAfter = searchData.paging?.next?.after || null;

  const filled = { email: 0, linkedin_url: 0, phone: 0 };
  // Per-row record of what was actually written, so the page can show the
  // values instead of only a count. Capped so a 1000-contact run cannot
  // return a megabyte of JSON.
  const details = [];
  const DETAIL_CAP = 200;

  // 2. For each contact, work out which of ITS enabled fields are actually
  // empty (the OR search only guarantees at least one is), look those up,
  // and write back only what's still missing.
  const skipped = { noName: 0, noDomainForEmail: 0, noCompanyForLinkedin: 0, alreadyComplete: 0 };
  const attempted = { email: 0, linkedin_url: 0, phone: 0 };
  const noMatch = { email: 0, linkedin_url: 0, phone: 0 };

  for (const contact of contacts) {
    const props = contact.properties || {};
    const fullName = `${props.firstname || ''} ${props.lastname || ''}`.trim();
    // Email lookup (lead_full_name_to_email) needs a company DOMAIN, derived
    // from the website property specifically — a display name like "Acme
    // Inc" isn't a domain and would produce a bogus lookup.
    const domain = domainFromWebsite(props.website);
    // LinkedIn URL lookup (lead_full_name_to_linkedin_url) takes one joined
    // "Full Name Company Name" string instead — confirmed against app.html's
    // actual request construction, which does NOT send first_name/last_name/
    // domain for this combination at all.
    const companyName = (props.company || '').trim();
    if (!fullName) { skipped.noName++; console.log(`[crm-sync] contact ${contact.id}: skipped, no name`); continue; }

    const missing = enabledKeys.filter((k) => isEmptyValue(props[fieldProperty(settings.fields[k])]));
    if (!missing.length) { skipped.alreadyComplete++; continue; }

    console.log(`[crm-sync] contact ${contact.id} "${fullName}": missing=${missing.join(',')} domain="${domain}" company="${companyName}"`);

    const writeBack = {};
    const writtenByField = {};   // field key -> value, for the details list
    let derivedLinkedinUrl = null;

    try {
      if (missing.includes('email')) {
        if (!domain) {
          skipped.noDomainForEmail++;
          console.log(`[crm-sync] contact ${contact.id}: email skipped, no website property to derive a domain from`);
        } else {
          attempted.email++;
          const { first, last } = splitName(fullName);
          const d = await runEnrichment(env, linkfinderToken, {
            type: 'lead_full_name_to_email', input_data: `${first} ${last}`, first_name: first, last_name: last,
            domain, output_type: 'email',
          });
          console.log(`[crm-sync] contact ${contact.id}: email lookup raw response:`, JSON.stringify(d).slice(0, 500));
          const email = extractStringValue(d, ['email']);
          if (email) {
            writeBack[fieldProperty(settings.fields.email)] = email;
            writtenByField.email = email;
            filled.email++;
          } else {
            noMatch.email++;
          }
        }
      }

      if (missing.includes('linkedin_url')) {
        if (!companyName) {
          skipped.noCompanyForLinkedin++;
          console.log(`[crm-sync] contact ${contact.id}: linkedin_url skipped, no company property`);
        } else {
          attempted.linkedin_url++;
          const d = await runEnrichment(env, linkfinderToken, {
            type: 'lead_full_name_to_linkedin_url', input_data: `${fullName} ${companyName}`, output_type: 'linkedin_url',
          });
          console.log(`[crm-sync] contact ${contact.id}: linkedin_url lookup raw response:`, JSON.stringify(d).slice(0, 500));
          const url = extractStringValue(d, ['linkedin_url', 'linkedinUrl', 'url']);
          if (url && url.includes('linkedin.com')) {
            writeBack[fieldProperty(settings.fields.linkedin_url)] = url;
            writtenByField.linkedin_url = url;
            filled.linkedin_url++;
            derivedLinkedinUrl = url;
          } else {
            noMatch.linkedin_url++;
          }
        }
      }

      if (missing.includes('phone')) {
        // Reuse a LinkedIn URL already on file (in the configured property,
        // if that field is tracked) or one just derived above for this same
        // contact — only fall back to deriving a fresh one (extra credit)
        // if neither is available.
        let linkedinUrlForPhone = derivedLinkedinUrl
          || (settings.fields.linkedin_url.enabled ? props[fieldProperty(settings.fields.linkedin_url)] : null)
          || null;

        if (!linkedinUrlForPhone && companyName) {
          const d = await runEnrichment(env, linkfinderToken, {
            type: 'lead_full_name_to_linkedin_url', input_data: `${fullName} ${companyName}`, output_type: 'linkedin_url',
          });
          const url = extractStringValue(d, ['linkedin_url', 'linkedinUrl', 'url']);
          if (url && url.includes('linkedin.com')) linkedinUrlForPhone = url;
        }

        if (linkedinUrlForPhone) {
          attempted.phone++;
          const d = await runEnrichment(env, linkfinderToken, {
            type: 'linkedin_profile_to_phone', input_data: linkedinUrlForPhone, output_type: 'phone',
          });
          console.log(`[crm-sync] contact ${contact.id}: phone lookup raw response:`, JSON.stringify(d).slice(0, 500));
          const phone = extractStringValue(d, ['phone', 'mobileNumber']);
          if (phone) {
            writeBack[fieldProperty(settings.fields.phone)] = phone;
            writtenByField.phone = phone;
            filled.phone++;
          } else {
            noMatch.phone++;
          }
        }
      }

      // 3. Write back — PATCH only the fields we actually found. HubSpot
      // itself won't touch a property we don't send, so only ever including
      // keys we just found a value for is "no override" by construction.
      if (Object.keys(writeBack).length) {
        const patchResp = await nangoProxy(env, connectionId, `/crm/v3/objects/contacts/${contact.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: writeBack }),
        });
        console.log(`[crm-sync] contact ${contact.id}: PATCH status ${patchResp.status}`, patchResp.ok ? '' : await patchResp.text().catch(() => ''));
        // Only report a row once HubSpot accepted the write — a failed PATCH
        // must not appear in the UI as data that landed.
        if (patchResp.ok && details.length < DETAIL_CAP) {
          for (const [fieldKey, value] of Object.entries(writtenByField)) {
            details.push({ contactId: contact.id, name: fullName, company: companyName, field: fieldKey, value: value });
          }
        }
      }
    } catch (e) {
      console.error('[crm-sync] enrichment/write-back failed for contact', contact.id, e);
    }
  }

  const filledTotal = filled.email + filled.linkedin_url + filled.phone;
  const result = { processed: contacts.length, filled, filledTotal, skipped, attempted, noMatch, details,
                   detailsTruncated: details.length >= DETAIL_CAP };

  await env.CRM_CONNECTIONS.put(`conn:${linkfinderToken}`, JSON.stringify({
    ...record,
    settings,
    lastSyncedAt: new Date().toISOString(),
    lastSyncResult: result,
    afterCursor: nextAfter,
  }));

  return result;
}

// Manual trigger — lets the "Sync now" button on the CRM Sync page run one
// connection's sync immediately instead of waiting for the weekly cron, and
// returns the result directly so the UI can show exactly what happened.
async function handleTestSync(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);

  const record = JSON.parse(raw);
  try {
    const result = await syncOneConnection(env, token, record);
    return json({ ok: true, ...result }, 200, origin);
  } catch (e) {
    return json({ error: 'Sync failed: ' + (e && e.message ? e.message : 'unknown error') }, 500, origin);
  }
}

async function runScheduledSync(env) {
  const list = await env.CRM_CONNECTIONS.list({ prefix: 'conn:' });
  for (const key of list.keys) {
    const raw = await env.CRM_CONNECTIONS.get(key.name);
    if (!raw) continue;
    const linkfinderToken = key.name.slice('conn:'.length);
    const record = JSON.parse(raw);
    try {
      const result = await syncOneConnection(env, linkfinderToken, record);
      console.log(`[crm-sync] ${linkfinderToken}: processed ${result.processed}, filled ${JSON.stringify(result.filled)}`);
    } catch (e) {
      console.error('[crm-sync] sync failed for', linkfinderToken, e);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (url.pathname === '/nango-webhook') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      return handleNangoWebhook(request, env);
    }

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (!isAllowedOrigin(origin)) {
      return json({ error: 'Origin not allowed' }, 403, origin);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }
    if (!env.CRM_CONNECTIONS) {
      return json({ error: 'CRM_CONNECTIONS KV namespace not bound - see deployment notes at top of file' }, 500, origin);
    }
    if (!env.NANGO_SECRET_KEY) {
      return json({ error: 'NANGO_SECRET_KEY not set - see deployment notes at top of file' }, 500, origin);
    }

    if (url.pathname === '/' || url.pathname === '/connect-session') return handleConnectSession(request, env, origin);
    if (url.pathname === '/finalize-connection') return handleFinalizeConnection(request, env, origin);
    if (url.pathname === '/status') return handleStatus(request, env, origin);
    if (url.pathname === '/save-settings') return handleSaveSettings(request, env, origin);
    if (url.pathname === '/list-properties') return handleListProperties(request, env, origin);
    if (url.pathname === '/push-contacts') return handlePushContacts(request, env, origin);
    if (url.pathname === '/audit-contacts') return handleAuditContacts(request, env, origin);
    if (url.pathname === '/disconnect') return handleDisconnect(request, env, origin);
    if (url.pathname === '/sync-now' || url.pathname === '/test-sync') {
      if (!env.ENRICH_SERVICE) {
        return json({ error: 'ENRICH_SERVICE binding not set — add a Service binding to the linkfinderapp worker (see deployment notes at top of file). Without it every lookup fails with Cloudflare error 1042.' }, 500, origin);
      }
      return handleTestSync(request, env, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledSync(env));
  },
};
