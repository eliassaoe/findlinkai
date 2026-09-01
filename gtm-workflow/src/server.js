'use strict';

/**
 * The memory service: the only stateful piece of the GTM stack.
 *
 * n8n has no SQLite node and its Code node cannot require a database driver, so
 * config.json and campaign_memory.db are fronted by this small HTTP API and the
 * workflow talks to it with plain HTTP Request nodes. That keeps every node in
 * the workflow API-driven and keeps the whole thing importable into n8n Cloud,
 * not just a self-hosted instance with filesystem access.
 *
 * Zero npm dependencies: node:http + node:sqlite.
 */

const http = require('node:http');
const db = require('./db');
const { loadConfig, configPath, evaluateHardDisqualifiers } = require('./config');

const PORT = Number(process.env.MEMORY_SERVICE_PORT || 8787);
const HOST = process.env.MEMORY_SERVICE_HOST || '127.0.0.1';
const TOKEN = process.env.MEMORY_SERVICE_TOKEN || '';
const MAX_BODY_BYTES = 1_000_000;

const handle = db.open();

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (cause) {
        reject(Object.assign(new Error(`Invalid JSON body: ${cause.message}`), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Constant-time-ish bearer check. The service binds to localhost by default, so
 * the token is defence in depth for the case where someone exposes it to n8n on
 * another host.
 */
function authorised(req) {
  if (!TOKEN) return true;
  const header = req.headers.authorization || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (presented.length !== TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i += 1) diff |= presented.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return diff === 0;
}

const routes = {
  'GET /health': () => ({
    ok: true,
    schema_version: db.SCHEMA_VERSION,
    database: db.resolveDbPath(),
    config: configPath(),
    conversions: db.countConversions(handle),
  }),

  // Node 3 can also read the raw config on its own if you prefer two nodes.
  'GET /config': () => loadConfig(),

  'GET /memory/conversions': (_body, url) => {
    const limit = Number(url.searchParams.get('limit')) || undefined;
    const rows = db.recentConversions(handle, limit || conversionLimit());
    return {
      count: rows.length,
      total: db.countConversions(handle),
      past_positive_replies_list: db.buildPastPositiveRepliesList(rows),
      items: rows,
    };
  },

  /**
   * Node 3 · "Load Config + Learning Feedback".
   *
   * One round trip returns everything the agent node needs: the live config, the
   * stringified lookalike corpus, whether this person has already been mailed,
   * and the deterministic hard-guardrail verdict. Folding these together means
   * the workflow spends one HTTP call instead of four, and the hard-guardrail
   * result lets the workflow drop a hopeless lead before paying for a model call.
   */
  'POST /memory/context': (body) => {
    const config = loadConfig();
    const limit = conversionLimit(config);
    const rows = db.recentConversions(handle, limit);
    const total = db.countConversions(handle);
    const threshold = Number(config.learning?.lookalike_enforced_after_n_conversions ?? 3);

    return {
      config,
      past_positive_replies_list: db.buildPastPositiveRepliesList(rows),
      conversion_count: total,
      conversions_returned: rows.length,
      lookalike_gate_enforced: total >= threshold,
      already_contacted: db.alreadyContacted(handle, body.lead_email || body.email),
      hard_disqualifier: evaluateHardDisqualifiers(body, config),
      generated_at: new Date().toISOString(),
    };
  },

  // Node 6 · the inbound loop writes here.
  'POST /memory/conversions': (body) => {
    // Backfill anything the reply webhook did not carry from what we recorded at
    // send time, so a bare {email, sentiment} reply still produces a usable
    // lookalike profile instead of a 422.
    const prior = db.findOutreach(handle, body.lead_email || body.email) || {};
    const merged = {
      ...body,
      lead_email: body.lead_email || body.email || prior.lead_email,
      full_name: body.full_name || prior.full_name,
      job_title: body.job_title || prior.job_title,
      company_name: body.company_name || prior.company_name,
      company_domain: body.company_domain || prior.company_domain,
      company_description: body.company_description || prior.company_description,
      tech_stack: body.tech_stack || prior.tech_stack,
      employee_count: body.employee_count ?? prior.employee_count,
      signal_type: body.signal_type || prior.signal_type,
      signal_context: body.signal_context || prior.signal_context,
    };
    return {
      ok: true,
      backfilled_from_outreach_log: Boolean(prior.lead_email),
      conversion: db.insertConversion(handle, merged),
      conversion_count: db.countConversions(handle),
    };
  },

  // Written after Node 5 succeeds, so a lead is never mailed twice.
  'POST /memory/outreach': (body) => ({ ok: true, outreach: db.logOutreach(handle, body) }),
};

function conversionLimit(config) {
  const cfg = config || loadConfig();
  const limit = Number(cfg.learning?.recent_conversions_limit);
  return Number.isFinite(limit) && limit > 0 ? limit : 10;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const key = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;

  if (key !== 'GET /health' && !authorised(req)) {
    return send(res, 401, { error: 'unauthorized', message: 'Missing or invalid bearer token.' });
  }

  const route = routes[key];
  if (!route) {
    return send(res, 404, { error: 'not_found', message: `No route for ${key}`, routes: Object.keys(routes) });
  }

  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    return send(res, 200, route(body, url));
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error(`[memory-service] ${key} failed:`, err);
    return send(res, status, { error: status >= 500 ? 'internal_error' : 'bad_request', message: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[memory-service] listening on http://${HOST}:${PORT}`);
    console.log(`[memory-service] database: ${db.resolveDbPath()}`);
    console.log(`[memory-service] config:   ${configPath()}`);
    console.log(`[memory-service] auth:     ${TOKEN ? 'bearer token required' : 'OPEN (set MEMORY_SERVICE_TOKEN)'}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { server, handle, routes };
