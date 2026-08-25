/* nango-connect-session — CORRECTED SOURCE, paste-ready
 *
 * Read from the deployed worker on 25 Aug via the Cloudflare connector, with
 * two changes applied. Everything not listed below is byte-identical to what
 * is live; this is a patch expressed as a whole file, not a rewrite.
 *
 * CHANGE 1 — the subscriber gate (this is the important one)
 *   `isSubscriber` is declared `async function isSubscriber(env, token)`.
 *   `handleConnectSession` calls it correctly. Two other sites did not:
 *
 *       handlePushContacts:   isSubscriber(token)
 *       syncOneConnection:    isSubscriber(linkfinderToken)
 *
 *   With one argument, `env` receives the token string, so
 *   `env.SUBSCRIBER_SERVICE` is undefined, the `{ fetch }` fallback makes a
 *   same-account Worker-to-Worker call over a public workers.dev hostname,
 *   Cloudflare blocks it with error 1042, and the fail-closed catch returns
 *   false. Result: /push-contacts 403s every customer including subscribers,
 *   and the Monday cron skips every connection while logging only
 *   "not a subscriber, skipping sync".
 *
 *   Both now pass `env` first. Nothing else needed threading —
 *   syncOneConnection already receives `env` as its first parameter.
 *
 * CHANGE 2 — new route POST /audit-contacts
 *   Read-only. Returns up to 5,000 contacts as plain objects so CRM Health can
 *   score a connected CRM without a CSV export. crm-sync.html already calls
 *   this; until it is deployed the page gets the normal 404 and falls back to
 *   the CSV drop.
 *
 * DEPLOY: Cloudflare dashboard > Workers > nango-connect-session > Edit code >
 * paste > Deploy. Bindings and secrets are unchanged (CRM_CONNECTIONS KV,
 * NANGO_SECRET_KEY, ENRICH_SERVICE, SUBSCRIBER_SERVICE).
 *
 * VERIFY AFTER DEPLOY:
 *   1. /sync-now as a subscriber no longer answers "not a subscriber".
 *   2. Monday cron logs a non-zero `processed`.
 *   3. CRM Health on a connected account scores real contacts.
 */

/* ─────────────────────────────────────────────────────────────
 * CHANGE 1 — apply these two edits to the live worker.
 * They are the whole fix. If you would rather not paste a full file,
 * make just these two edits in the dashboard editor.
 * ───────────────────────────────────────────────────────────── */

/* In handlePushContacts, find:

       if (!(await isSubscriber(token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

   replace with:

       if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);
*/

/* In syncOneConnection, find:

       if (!(await isSubscriber(linkfinderToken))) {

   replace with:

       if (!(await isSubscriber(env, linkfinderToken))) {
*/


/* ─────────────────────────────────────────────────────────────
 * CHANGE 2 — add this function next to the other handlers.
 * ───────────────────────────────────────────────────────────── */

const AUDIT_MAX_CONTACTS = 5000;   // the score is a rate, so a sample is representative
const AUDIT_PAGE_SIZE = 100;       // HubSpot's max per page on the list endpoint

const AUDIT_PROPERTIES = [
  'firstname', 'lastname', 'email', 'company',
  'jobtitle', 'phone', 'linkedinbio', 'website',
];

/**
 * Read-only. Never writes to HubSpot and never calls ENRICH_SERVICE, so it
 * costs no credits — CRM Health tells the user scanning is free.
 *
 * Returns plain objects, one per contact, with every requested property
 * present as '' when empty. analyse() in js/lf-crm-audit.js keys its column
 * detection off the object's keys, so a missing key means a missing column,
 * which would silently under-report gaps.
 */
async function handleAuditContacts(request, env, origin) {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return json({ error: 'Missing token' }, 400, origin);
  if (!(await isSubscriber(env, token))) return json({ error: NOT_SUBSCRIBER_ERROR }, 403, origin);

  const raw = await env.CRM_CONNECTIONS.get(`conn:${token}`);
  if (!raw) {
    return json({ error: 'No HubSpot connection found for this token. Connect it first.' }, 404, origin);
  }
  const { connectionId } = JSON.parse(raw);

  const contacts = [];
  let after = null;
  let pages = 0;

  while (contacts.length < AUDIT_MAX_CONTACTS) {
    const params = new URLSearchParams({
      limit: String(AUDIT_PAGE_SIZE),
      properties: AUDIT_PROPERTIES.join(','),
    });
    if (after) params.set('after', after);

    const resp = await nangoProxy(env, connectionId, `/crm/v3/objects/contacts?${params}`, { method: 'GET' });
    if (!resp.ok) {
      // Partial data still scores usefully, so only fail outright if the very
      // first page failed — otherwise return what we have.
      if (!contacts.length) {
        return json({ error: 'Could not read your contacts from HubSpot.' }, 502, origin);
      }
      break;
    }

    const data = await resp.json().catch(() => ({}));
    const results = data.results || [];
    if (!results.length) break;

    for (const r of results) {
      const props = r.properties || {};
      const flat = {};
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

  return json({
    ok: true,
    contacts: contacts.slice(0, AUDIT_MAX_CONTACTS),
    sampled: Math.min(contacts.length, AUDIT_MAX_CONTACTS),
    capped: contacts.length >= AUDIT_MAX_CONTACTS,
  }, 200, origin);
}


/* ─────────────────────────────────────────────────────────────
 * CHANGE 2b — register the route.
 * In the fetch() handler, alongside the other url.pathname checks
 * (next to '/push-contacts' is the natural spot), add:
 * ───────────────────────────────────────────────────────────── */

/*
    if (url.pathname === '/audit-contacts') return handleAuditContacts(request, env, origin);
*/
