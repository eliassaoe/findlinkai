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
const PROPERTY_NAME_RE = /^[a-zA-Z0-9_]{1,100}$/;

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
function sanitizeSettings(input) {
  const out = { maxPerRun: DEFAULT_MAX_PER_RUN, fields: {} };
  const src = (input && typeof input === 'object') ? input : {};

  const maxPerRun = parseInt(src.maxPerRun, 10);
  out.maxPerRun = Number.isFinite(maxPerRun) ? Math.min(HARD_MAX_PER_RUN, Math.max(1, maxPerRun)) : DEFAULT_MAX_PER_RUN;

  for (const key of VALID_FIELD_KEYS) {
    const f = (src.fields && src.fields[key]) || {};
    const defaultProp = DEFAULT_SETTINGS.fields[key].hubspotProperty;
    const prop = (typeof f.hubspotProperty === 'string' && PROPERTY_NAME_RE.test(f.hubspotProperty.trim()))
      ? f.hubspotProperty.trim()
      : defaultProp;
    out.fields[key] = { enabled: !!f.enabled, hubspotProperty: prop };
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
      allowed_integrations: [HUBSPOT_INTEGRATION_ID],
    }),
  });
  if (!r.ok) throw new Error(`Nango create session failed: ${r.status} ${await r.text().catch(() => '')}`);
  return r.json();
}

async function nangoProxy(env, connectionId, path, options = {}) {
  const r = await fetch(`${NANGO_API_BASE}/proxy${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.NANGO_SECRET_KEY}`,
      'Connection-Id': connectionId,
      'Provider-Config-Key': HUBSPOT_INTEGRATION_ID,
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
  if (!token || !connectionId) {
    return json({ error: 'Missing token or connectionId' }, 400, origin);
  }

  // Preserve existing settings if this is a reconnect, otherwise start fresh.
  const existingRaw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  const existingSettings = existingRaw ? JSON.parse(existingRaw).settings : null;

  await env.CRM_CONNECTIONS.put(`conn:${token}`, JSON.stringify({
    connectionId,
    providerConfigKey: HUBSPOT_INTEGRATION_ID,
    connectedAt: new Date().toISOString(),
    lastSyncedAt: null,
    lastSyncResult: null,
    afterCursor: null,
    settings: existingSettings || DEFAULT_SETTINGS,
  }));

  return json({ ok: true }, 200, origin);
}

async function handleStatus(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ ok: true, connected: false, settings: DEFAULT_SETTINGS }, 200, origin);
  const record = JSON.parse(raw);
  return json({
    ok: true,
    connected: true,
    connectedAt: record.connectedAt,
    lastSyncedAt: record.lastSyncedAt || null,
    lastSyncResult: record.lastSyncResult || null,
    settings: record.settings || DEFAULT_SETTINGS,
  }, 200, origin);
}

async function handleSaveSettings(request, env, origin) {
  const { token, settings } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);

  const record = JSON.parse(raw);
  const clean = sanitizeSettings(settings);
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
  if (!raw) return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);
  const { connectionId } = JSON.parse(raw);

  const resp = await nangoProxy(env, connectionId, '/crm/v3/properties/contacts', { method: 'GET' });
  if (!resp.ok) return json({ error: 'Could not load HubSpot properties.' }, 502, origin);

  const data = await resp.json().catch(() => ({}));
  const properties = (data.results || [])
    .filter((p) => !p.calculated && !p.hidden && !p.modificationMetadata?.readOnlyValue)
    .map((p) => ({ name: p.name, label: p.label, group: p.groupName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return json({ ok: true, properties }, 200, origin);
}

// ─────────────────────────────────────────────────────────────
// Push a single enrichment result (or a whole bulk run) straight into
// HubSpot — updates an existing contact (matched by email, "no override"
// like everywhere else in this worker) or creates a new one. Independent
// of the weekly-sync field toggles: this pushes whatever the caller found,
// regardless of which fields are enabled for the background job.
// ─────────────────────────────────────────────────────────────

const STANDARD_PROPERTY_MAP = { firstName: 'firstname', lastName: 'lastname', company: 'company', jobTitle: 'jobtitle' };

async function pushOneContact(env, connectionId, settings, contact) {
  const props = {};
  if (contact.email) props[settings.fields.email.hubspotProperty] = contact.email;
  if (contact.phone) props[settings.fields.phone.hubspotProperty] = contact.phone;
  if (contact.linkedinUrl) props[settings.fields.linkedin_url.hubspotProperty] = contact.linkedinUrl;
  for (const key of ['firstName', 'lastName', 'company', 'jobTitle']) {
    if (contact[key]) props[STANDARD_PROPERTY_MAP[key]] = contact[key];
  }
  if (!Object.keys(props).length) return { action: 'skipped', reason: 'no usable fields' };

  if (contact.email) {
    const searchResp = await nangoProxy(env, connectionId, '/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: contact.email }] }],
        properties: Object.keys(props),
        limit: 1,
      }),
    });
    if (searchResp.ok) {
      const searchData = await searchResp.json().catch(() => ({}));
      const existing = (searchData.results || [])[0];
      if (existing) {
        // No override — only send properties that are actually empty on the
        // existing record, same rule as the weekly sync.
        const existingProps = existing.properties || {};
        const writeBack = {};
        for (const [k, v] of Object.entries(props)) {
          if (isEmptyValue(existingProps[k])) writeBack[k] = v;
        }
        if (!Object.keys(writeBack).length) return { action: 'skipped', reason: 'already complete', contactId: existing.id };
        const patchResp = await nangoProxy(env, connectionId, `/crm/v3/objects/contacts/${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: writeBack }),
        });
        return patchResp.ok
          ? { action: 'updated', contactId: existing.id }
          : { action: 'failed', reason: `PATCH ${patchResp.status}` };
      }
    }
  }

  // No email, or no existing match found — create a new contact. No dedupe
  // attempt possible without an email to key off of.
  const createResp = await nangoProxy(env, connectionId, '/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties: props }),
  });
  if (!createResp.ok) return { action: 'failed', reason: `CREATE ${createResp.status}` };
  const created = await createResp.json().catch(() => ({}));
  return { action: 'created', contactId: created.id };
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
  const settings = sanitizeSettings(record.settings || DEFAULT_SETTINGS);

  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const contact of contacts) {
    try {
      const result = await pushOneContact(env, record.connectionId, settings, contact);
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
  if (providerConfigKey && providerConfigKey !== HUBSPOT_INTEGRATION_ID) {
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

  const settings = sanitizeSettings(record.settings || DEFAULT_SETTINGS);
  const enabledKeys = VALID_FIELD_KEYS.filter((k) => settings.fields[k].enabled);

  if (!enabledKeys.length) {
    return { processed: 0, filled: { email: 0, linkedin_url: 0, phone: 0 }, filledTotal: 0 };
  }

  // 1. Search HubSpot for contacts missing ANY of the enabled fields
  // (each enabled field is its own OR'd filterGroup).
  const requestedProperties = new Set(['firstname', 'lastname', 'company', 'website']);
  enabledKeys.forEach((k) => requestedProperties.add(settings.fields[k].hubspotProperty));

  const searchBody = {
    filterGroups: enabledKeys.map((k) => ({
      filters: [{ propertyName: settings.fields[k].hubspotProperty, operator: 'NOT_HAS_PROPERTY' }],
    })),
    properties: Array.from(requestedProperties),
    limit: settings.maxPerRun,
    ...(afterCursor ? { after: afterCursor } : {}),
  };

  const searchResp = await nangoProxy(env, connectionId, '/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify(searchBody),
  });

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

    const missing = enabledKeys.filter((k) => isEmptyValue(props[settings.fields[k].hubspotProperty]));
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
            writeBack[settings.fields.email.hubspotProperty] = email;
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
            writeBack[settings.fields.linkedin_url.hubspotProperty] = url;
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
          || (settings.fields.linkedin_url.enabled ? props[settings.fields.linkedin_url.hubspotProperty] : null)
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
            writeBack[settings.fields.phone.hubspotProperty] = phone;
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
