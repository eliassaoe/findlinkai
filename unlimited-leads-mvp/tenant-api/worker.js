/**
 * Tenant API — the only thing between your UI and Explee.
 *
 * Explee's API is organization-wide: one key, and `GET /autogtm/hot-leads`
 * with no filter returns every hot lead belonging to every customer you have.
 * Nothing server-side at Explee knows your customers exist. So this worker
 * exists to do two jobs, and it must never be bypassed:
 *
 *   1. Hold the Explee key. It never reaches a browser.
 *   2. Resolve the caller to their own campaigns and refuse everything else.
 *      A campaign id arriving from the client is a claim, not a fact — it is
 *      checked against tenant_campaigns on every single request.
 *
 * Deploy: wrangler deploy. Secrets:
 *   EXPLEE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   ADMIN_TOKEN   (for the backstage endpoints you call yourself)
 *   ALLOWED_ORIGIN (e.g. https://unlimited-leads.net)
 */

const EXPLEE = 'https://api.explee.com/public/api/v1';

const json = (body, status = 200, origin = '*') =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'cache-control': 'no-store',
    },
  });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// --------------------------------------------------------------------------
// Supabase helpers. PostgREST with the service key — this worker has already
// done the authorization, so it reads with full rights and scopes by hand.
// --------------------------------------------------------------------------
async function sb(env, path, init = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new HttpError(502, `database error (${r.status})`);
  return r.status === 204 ? null : r.json();
}

/**
 * Verify the caller's Supabase access token by asking Supabase who it is.
 * An extra round trip per request, deliberately: local JWT verification is one
 * more thing to get subtly wrong, and getting it wrong here means one customer
 * reading another's inbox.
 */
async function currentUser(req, env, ctx) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new HttpError(401, 'sign in required');

  // Cached on a hash of the token, never the token itself — a cache key is not
  // a secret store. 60s, so a revoked session dies within a minute.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const fingerprint = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');

  const u = await cached(ctx, 'auth', fingerprint, TTL.auth, async () => {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new HttpError(401, 'session expired');
    return r.json();
  });
  if (!u?.id) throw new HttpError(401, 'session expired');
  return u;
}

/** The tenant row, created on first sight so signup needs no extra step. */
async function tenantFor(user, env) {
  const found = await sb(env, `tenants?user_id=eq.${user.id}&select=*`);
  if (found.length) return found[0];
  const made = await sb(env, 'tenants', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: user.id, email: user.email }),
  });
  return made[0];
}

/**
 * The authorization check. Every campaign-scoped route calls this first.
 * Returns the row so callers also get the display status and Calendly link.
 */
async function ownedCampaign(tenant, campaignId, env) {
  if (!/^\d+$/.test(String(campaignId))) throw new HttpError(400, 'bad campaign id');
  const rows = await sb(env,
    `tenant_campaigns?campaign_id=eq.${campaignId}&tenant_id=eq.${tenant.id}&select=*`);
  if (!rows.length) throw new HttpError(404, 'campaign not found');
  // tenant_id on the row is what every cache key is scoped by downstream, and
  // it comes from this filtered read — not from the request.
  return rows[0];
}

/* ---------------------------------------------------------------------------
 * Cache.
 *
 * Explee allows 10,000 requests an hour across the WHOLE organization — every
 * customer's dashboard shares one budget. Uncached, a single left-open browser
 * tab can spend it for everyone. Cached, the worst any number of tabs can cost
 * is one upstream call per endpoint per tenant per TTL.
 *
 * The cache key is built from the tenant id resolved by currentUser(), never
 * from anything the client sent. That is the whole safety argument: a client
 * cannot name a cache entry, so it cannot read one belonging to someone else.
 * ------------------------------------------------------------------------- */
const TTL = {
  analytics: 120,   // dashboard numbers; nobody needs these to the second
  inbox: 60,        // a reply that lands is worth showing within a minute
  leads: 300,       // the contacted list barely moves
  thread: 30,       // short: people re-read a thread right after replying
  auth: 60,         // token -> user, to stop a Supabase round trip per request
};

const cacheKey = (scope, path) =>
  new Request(`https://ul-cache.internal/${scope}/${encodeURIComponent(path)}`);

async function cached(ctx, scope, path, ttl, load) {
  const store = caches.default;
  const key = cacheKey(scope, path);
  const hit = await store.match(key);
  if (hit) return hit.json();

  const data = await load();
  const body = new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json',
               'cache-control': `max-age=${ttl}` },
  });
  if (ctx?.waitUntil) ctx.waitUntil(store.put(key, body.clone()));
  return data;
}

/** Drop the entries a write just invalidated. Exact keys only — the Cache API
 *  cannot wildcard, so a deep page may stay stale for its TTL. That is a fair
 *  trade: the pages people actually look at after replying are these. */
async function invalidate(ctx, scope, paths) {
  const store = caches.default;
  const drop = Promise.all(paths.map(p => store.delete(cacheKey(scope, p)).catch(() => {})));
  if (ctx?.waitUntil) ctx.waitUntil(drop); else await drop;
}

/**
 * Call Explee. A 402 means OUR balance is empty — that is our billing problem,
 * never something to show a customer as their error, so it is translated.
 */
async function explee(env, path, init = {}) {
  const r = await fetch(`${EXPLEE}${path}`, {
    ...init,
    headers: { 'X-API-Key': env.EXPLEE_API_KEY,
               'content-type': 'application/json', ...(init.headers || {}) },
  });
  if (r.status === 402) throw new HttpError(503, 'temporarily unavailable');
  if (r.status === 429) throw new HttpError(429, 'busy, try again shortly');
  if (!r.ok) throw new HttpError(502, `upstream error (${r.status})`);
  return r.json();
}

// --------------------------------------------------------------------------
// Customer-facing routes
// --------------------------------------------------------------------------

/** Everything the shell needs on load: who they are, what their campaigns are. */
async function getMe(tenant, env) {
  const [campaigns, onboarding] = await Promise.all([
    sb(env, `tenant_campaigns?tenant_id=eq.${tenant.id}&select=*&order=created_at.desc`),
    sb(env, `onboarding_requests?tenant_id=eq.${tenant.id}&select=id,submitted_at&limit=1`),
  ]);
  return {
    email: tenant.email,
    company: tenant.company,
    onboarded: onboarding.length > 0,
    campaigns: campaigns.map(display),
  };
}

/**
 * What the customer sees instead of Explee's internal status. `waiting_leads`
 * is the state this whole design exists for: the campaign is real, you have
 * built it backstage, and there is nothing to show yet.
 */
const COPY = {
  pending_setup: { label: 'Setting up',   note: "We're building your campaign. This usually takes a few hours." },
  waiting_leads: { label: 'Finding leads', note: 'Finding people who match your brief. Come back soon to see replies here.' },
  active:        { label: 'Sending',       note: 'Your campaign is live. Replies appear in your inbox.' },
  paused:        { label: 'Paused',        note: 'Sending is paused.' },
  done:          { label: 'Finished',      note: 'This campaign has finished sending.' },
};

const display = (c) => ({
  id: c.campaign_id,
  name: c.name,
  status: c.status,
  ...COPY[c.status],
  calendly_url: c.calendly_url,
  // Only a live campaign has anything to read at Explee.
  has_data: c.status === 'active' || c.status === 'paused' || c.status === 'done',
  created_at: c.created_at,
});

/** The signup form. Stored for you to read backstage; nothing is sent yet. */
async function submitOnboarding(tenant, body, env) {
  const offer = String(body.offer || '').trim();
  if (offer.length < 20) {
    throw new HttpError(422, 'Tell us a bit more about what you sell (20+ characters).');
  }
  const calendly = String(body.calendly_url || '').trim();
  if (calendly && !/^https:\/\/(calendly\.com|cal\.com)\//.test(calendly)) {
    throw new HttpError(422, 'That does not look like a Calendly or Cal.com link.');
  }

  await sb(env, 'onboarding_requests', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenant.id,
      offer,
      customer_problem: body.customer_problem || null,
      target_role: body.target_role || null,
      target_geography: body.target_geography || null,
      target_company_size: body.target_company_size || null,
      instructions: body.instructions || null,
      followup_instructions: body.followup_instructions || null,
      language: body.language || 'en',
      calendly_url: calendly || null,
      notes: body.notes || null,
    }),
  });

  if (body.company) {
    await sb(env, `tenants?id=eq.${tenant.id}`, {
      method: 'PATCH', body: JSON.stringify({ company: body.company }),
    });
  }

  // A placeholder campaign so the customer has something to look at
  // immediately, before you have touched anything. Its id is negative so it
  // can never collide with a real Explee campaign id.
  const existing = await sb(env,
    `tenant_campaigns?tenant_id=eq.${tenant.id}&status=eq.pending_setup&select=campaign_id`);
  if (!existing.length) {
    await sb(env, 'tenant_campaigns', {
      method: 'POST',
      body: JSON.stringify({
        campaign_id: -Date.now(),
        tenant_id: tenant.id,
        name: body.company || 'Your first campaign',
        status: 'pending_setup',
        calendly_url: calendly || null,
      }),
    });
  }
  return { ok: true, ...COPY.pending_setup };
}

/** The leads list: everyone this campaign has contacted. */
async function getLeads(campaign, url, env, ctx) {
  if (!display(campaign).has_data) return { people: [], total: 0, ...COPY[campaign.status] };
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  const path = `/autogtm/campaigns/${campaign.campaign_id}/inbox?tab=sent&limit=${limit}&offset=${offset}`;
  return cached(ctx, campaign.tenant_id, path, TTL.leads, () => explee(env, path));
}

/** The inbox. `need_reply` first — that is where the money is. */
const inboxPath = (id, tab, limit = 50, offset = 0) =>
  `/autogtm/campaigns/${id}/inbox?tab=${tab}&limit=${limit}&offset=${offset}`;

async function getInbox(campaign, url, env, ctx) {
  if (!display(campaign).has_data) return { conversations: [], total: 0, ...COPY[campaign.status] };
  const tab = ['need_reply', 'replied', 'sent'].includes(url.searchParams.get('tab'))
    ? url.searchParams.get('tab') : 'need_reply';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  const path = inboxPath(campaign.campaign_id, tab, limit, offset);
  return cached(ctx, campaign.tenant_id, path, TTL.inbox, () => explee(env, path));
}

/** Hot leads — always scoped. Calling this endpoint unscoped leaks every
 *  customer's replies to whoever asked, so campaign_id is not optional here. */
async function getHot(campaign, url, env) {
  if (!display(campaign).has_data) return { leads: [], total: 0 };
  const since = url.searchParams.get('since');
  const q = new URLSearchParams({ campaign_id: String(campaign.campaign_id), limit: '100' });
  if (since) q.set('since', since);
  return explee(env, `/autogtm/hot-leads?${q}`);
}

const personId = (v) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(v))) throw new HttpError(400, 'bad person id');
  return v;
};

const threadPath = (id, pid) => `/autogtm/campaigns/${id}/inbox/${pid}`;

async function getThread(campaign, pid, env, ctx) {
  const path = threadPath(campaign.campaign_id, personId(pid));
  return cached(ctx, campaign.tenant_id, path, TTL.thread, () => explee(env, path));
}

async function postReply(campaign, pid, body, env, ctx) {
  const message = String(body.message || '').trim();
  if (!message) throw new HttpError(422, 'Write a message first.');
  if (message.length > 5000) throw new HttpError(422, 'That message is too long.');
  const id = campaign.campaign_id, person = personId(pid);

  const res = await explee(env, `/autogtm/campaigns/${id}/inbox/${person}/reply`,
    { method: 'POST', body: JSON.stringify({ message }) });

  // The reply the customer just sent must be in the thread they land back on,
  // so drop the thread and the two tabs whose contents just changed.
  await invalidate(ctx, campaign.tenant_id, [
    threadPath(id, person),
    inboxPath(id, 'need_reply'),
    inboxPath(id, 'replied'),
  ]);
  return res;
}

/** Analytics, plus the number Explee cannot give you: meetings booked. */
async function getAnalytics(tenant, campaign, url, env, ctx) {
  if (!display(campaign).has_data) return { emails_sent: 0, replies: 0, hot_leads: 0, booked: 0 };
  const period = ['24h', '7d', '30d', 'all'].includes(url.searchParams.get('period'))
    ? url.searchParams.get('period') : '7d';
  const path = `/autogtm/campaigns/${campaign.campaign_id}/analytics?period=${period}`;
  const [stats, booked] = await Promise.all([
    cached(ctx, tenant.id, path, TTL.analytics, () => explee(env, path)),
    sb(env, `bookings?tenant_id=eq.${tenant.id}&campaign_id=eq.${campaign.campaign_id}&select=id`),
  ]);
  // Spend is our cost, not their price. Never pass it through.
  const { spend, spend_usd, cost_per_lead, budget, ...safe } = stats || {};
  return { ...safe, booked: booked.length };
}

/**
 * Per-tenant ceiling, in requests per minute.
 *
 * The cache already means a hammering tab costs almost nothing upstream. This
 * is the second line: a broken client, a scraper or a retry loop should burn
 * its own allowance and not the organization's Explee budget, which every
 * customer shares.
 *
 * Needs a KV namespace bound as RL. Unbound, it is a no-op — deliberately, so
 * a missing binding degrades to today's behaviour rather than locking everyone
 * out of the product.
 */
async function underLimit(env, tenantId) {
  if (!env.RL) return true;
  const perMin = Number(env.RATE_LIMIT_PER_MIN || 60);
  const bucket = `rl:${tenantId}:${Math.floor(Date.now() / 60000)}`;
  const used = Number(await env.RL.get(bucket)) || 0;
  if (used >= perMin) return false;
  // Eventually consistent, so this undercounts a burst across colos. That is
  // fine: it is a ceiling on abuse, not an accounting system.
  await env.RL.put(bucket, String(used + 1), { expirationTtl: 120 });
  return true;
}

// --------------------------------------------------------------------------
// Backstage — you, not the customer. Guarded by a shared token.
// --------------------------------------------------------------------------
function assertAdmin(req, env) {
  const t = req.headers.get('x-admin-token');
  if (!t || !env.ADMIN_TOKEN || t !== env.ADMIN_TOKEN) throw new HttpError(404, 'not found');
}

/** Your own project ids. A campaign in one of these can never be handed to a
 *  customer — this is the guard that keeps your own outreach out of the product. */
const ownerProjects = (env) =>
  new Set(String(env.OWNER_PROJECT_IDS || '').split(',').map(s => s.trim()).filter(Boolean));

/**
 * Link a customer to the project and campaign you built for them in Explee.
 *
 * Five refusals, all of which have to hold or one customer ends up reading
 * another's inbox — or yours:
 *   1. the campaign must actually exist in your Explee organization;
 *   2. its project must not be one of yours (OWNER_PROJECT_IDS);
 *   3. the project must not already belong to a different tenant;
 *   4. the tenant must not already be pinned to a different project;
 *   5. the campaign must not already be linked to a different tenant.
 * Only then is anything written.
 */
async function linkCampaign(body, env) {
  const tenant_id = String(body.tenant_id || '');
  const campaign_id = Number(body.campaign_id);
  if (!tenant_id || !Number.isInteger(campaign_id) || campaign_id <= 0) {
    throw new HttpError(422, 'tenant_id and a positive campaign_id are required');
  }

  // (1) Read the campaign from Explee — never trust ids typed into a terminal.
  const live = await explee(env, '/autogtm/campaigns');
  const remote = (live.campaigns || []).find(c => Number(c.id) === campaign_id);
  if (!remote) throw new HttpError(404, `campaign ${campaign_id} is not in your Explee org`);
  const project_id = Number(remote.project_id);
  if (!Number.isInteger(project_id)) throw new HttpError(502, 'campaign has no project_id');

  // (2) Your own campaigns are off limits, permanently.
  if (ownerProjects(env).has(String(project_id))) {
    throw new HttpError(409,
      `project ${project_id} is one of your own — refusing to hand it to a customer`);
  }

  // (3)(4) One project per tenant, one tenant per project.
  const [projectOwner, thisTenant, alreadyLinked] = await Promise.all([
    sb(env, `tenants?project_id=eq.${project_id}&select=id`),
    sb(env, `tenants?id=eq.${tenant_id}&select=id,project_id`),
    sb(env, `tenant_campaigns?campaign_id=eq.${campaign_id}&select=tenant_id`),
  ]);
  if (!thisTenant.length) throw new HttpError(404, 'no such tenant');
  if (projectOwner.length && projectOwner[0].id !== tenant_id) {
    throw new HttpError(409, `project ${project_id} already belongs to another customer`);
  }
  if (thisTenant[0].project_id && Number(thisTenant[0].project_id) !== project_id) {
    throw new HttpError(409,
      `this customer is already on project ${thisTenant[0].project_id}`);
  }
  // (5)
  if (alreadyLinked.length && alreadyLinked[0].tenant_id !== tenant_id) {
    throw new HttpError(409, `campaign ${campaign_id} already belongs to another customer`);
  }

  await sb(env, `tenants?id=eq.${tenant_id}`, {
    method: 'PATCH', body: JSON.stringify({ project_id }) });

  // Replace the placeholder card rather than leaving a second one on screen.
  await sb(env, `tenant_campaigns?tenant_id=eq.${tenant_id}&status=eq.pending_setup`,
           { method: 'DELETE' });

  const brief = await sb(env,
    `onboarding_requests?tenant_id=eq.${tenant_id}&select=calendly_url` +
    `&order=submitted_at.desc&limit=1`);
  const calendly = brief[0]?.calendly_url || null;

  await sb(env, 'tenant_campaigns', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      campaign_id, tenant_id, project_id,
      name: body.name || remote.name || 'Campaign',
      status: 'waiting_leads',
      calendly_url: calendly,
    }),
  });

  return {
    ok: true,
    status: 'waiting_leads',
    project_id,
    campaign_id,
    // Paste THIS into the campaign's copy brief, not their bare Calendly link.
    // The utm_campaign is what lets a booking be attributed to this customer;
    // without it the booking arrives unattributed and is not counted.
    calendly_tracked_url: calendly
      ? `${calendly}${calendly.includes('?') ? '&' : '?'}` +
        `utm_source=unlimited-leads&utm_campaign=${campaign_id}`
      : null,
  };
}

/**
 * Refresh every linked campaign's status from Explee. Run it on a cron so the
 * customer's card flips from "Finding leads" to "Sending" without you doing it.
 */
async function syncStatuses(env) {
  // Only campaigns we linked to a tenant. Your own campaigns are not in this
  // table, so this loop can never read, write or touch them.
  const linked = await sb(env,
    'tenant_campaigns?campaign_id=gt.0&select=campaign_id,status,project_id');
  if (!linked.length) return { updated: 0 };
  const live = await explee(env, '/autogtm/campaigns');
  const byId = new Map((live.campaigns || []).map(c => [String(c.id), c]));

  let updated = 0;
  const mine = ownerProjects(env);
  for (const row of linked) {
    const remote = byId.get(String(row.campaign_id));
    if (!remote) continue;
    // Belt and braces: if a link ever pointed at one of your projects, skip it
    // rather than surfacing your campaign in a customer's dashboard.
    if (mine.has(String(remote.project_id))) continue;
    const s = String(remote.status || '').toLowerCase();
    const next = s.includes('run') || s.includes('active') || s.includes('send') ? 'active'
               : s.includes('stop') || s.includes('pause') ? 'paused'
               : s.includes('complete') || s.includes('done') ? 'done'
               : row.status === 'pending_setup' ? 'waiting_leads' : row.status;
    if (next !== row.status) {
      await sb(env, `tenant_campaigns?campaign_id=eq.${row.campaign_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: next,
          ...(next === 'active' && row.status !== 'active'
              ? { activated_at: new Date().toISOString() } : {}),
        }),
      });
      updated++;
    }
  }
  return { updated };
}

/**
 * Calendly invitee.created. Bookings are the product, so they stay ours.
 *
 * Attribution is by `tracking.utm_campaign`, which is the campaign id we put in
 * the Calendly link at link time. It is exact. If it is missing or unknown the
 * booking is stored UNATTRIBUTED — never guessed onto the nearest customer,
 * because a wrong attribution silently credits one customer with another's
 * meeting, and that is worse than a gap you can see.
 */
async function recordBooking(body, env) {
  const p = body?.payload || body || {};
  const email = String(p.email || p.invitee?.email || '').toLowerCase();
  if (!email) throw new HttpError(422, 'no invitee email');

  const tracked = Number(p.tracking?.utm_campaign);
  let owner = null;
  if (Number.isInteger(tracked) && tracked > 0) {
    const rows = await sb(env,
      `tenant_campaigns?campaign_id=eq.${tracked}&select=tenant_id,campaign_id`);
    owner = rows[0] || null;
  }

  await sb(env, 'bookings', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      tenant_id: owner?.tenant_id ?? null,
      campaign_id: owner?.campaign_id ?? null,
      invitee_email: email,
      invitee_name: p.name || p.invitee?.name || null,
      starts_at: p.scheduled_event?.start_time || p.event?.start_time || null,
      event_uri: p.uri || p.event?.uri || `${email}-${Date.now()}`,
    }),
  });
  return { ok: true, attributed: !!owner };
}

// --------------------------------------------------------------------------
export default {
  async fetch(req, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization,content-type,x-admin-token',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-max-age': '86400',
      }});
    }

    const url = new URL(req.url);
    const seg = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const body = req.method === 'POST'
      ? await req.json().catch(() => ({})) : {};

    try {
      // Public: Calendly posts here with no session.
      if (seg[0] === 'hooks' && seg[1] === 'calendly' && req.method === 'POST') {
        return json(await recordBooking(body, env), 200, origin);
      }
      // Backstage.
      if (seg[0] === 'admin') {
        assertAdmin(req, env);
        if (seg[1] === 'link' && req.method === 'POST')
          return json(await linkCampaign(body, env), 200, origin);
        if (seg[1] === 'sync')
          return json(await syncStatuses(env), 200, origin);
        if (seg[1] === 'hot')
          return json(await pollHotLeads(env), 200, origin);
        if (seg[1] === 'queue')
          return json(await sb(env,
            'onboarding_requests?select=*,tenants(id,email,company)&order=submitted_at.desc'),
            200, origin);
        throw new HttpError(404, 'not found');
      }

      if (seg[0] !== 'api') throw new HttpError(404, 'not found');

      const user = await currentUser(req, env, ctx);
      const tenant = await tenantFor(user, env);
      if (!await underLimit(env, tenant.id)) {
        throw new HttpError(429, 'Too many requests — give it a moment.');
      }

      if (seg[1] === 'me') return json(await getMe(tenant, env), 200, origin);
      if (seg[1] === 'onboarding' && req.method === 'POST')
        return json(await submitOnboarding(tenant, body, env), 200, origin);

      if (seg[1] === 'campaigns' && seg[2]) {
        const campaign = await ownedCampaign(tenant, seg[2], env);   // the gate
        const tail = seg.slice(3);
        if (!tail.length)               return json(display(campaign), 200, origin);
        if (tail[0] === 'leads')        return json(await getLeads(campaign, url, env, ctx), 200, origin);
        if (tail[0] === 'inbox')        return json(await getInbox(campaign, url, env, ctx), 200, origin);
        if (tail[0] === 'hot')          return json(await getHot(campaign, url, env), 200, origin);
        if (tail[0] === 'analytics')    return json(await getAnalytics(tenant, campaign, url, env, ctx), 200, origin);
        if (tail[0] === 'threads' && tail[1] && !tail[2])
          return json(await getThread(campaign, tail[1], env, ctx), 200, origin);
        if (tail[0] === 'threads' && tail[2] === 'reply' && req.method === 'POST')
          return json(await postReply(campaign, tail[1], body, env, ctx), 200, origin);
      }
      throw new HttpError(404, 'not found');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, origin);
      return json({ error: 'something went wrong' }, 500, origin);
    }
  },

  // Flip "Finding leads" to "Sending", then announce any new hot lead.
  // Status first: a campaign that just went active in this same tick is then
  // already eligible for polling rather than waiting another 15 minutes.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      await syncStatuses(env).catch(() => {});
      await pollHotLeads(env).catch(() => {});
    })());
  },
};
