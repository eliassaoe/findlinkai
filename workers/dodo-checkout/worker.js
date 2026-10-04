/**
 * dodo-checkout-worker.js (LIVE ONLY, CORS-FIXED, TIMEOUT-FIXED)
 *
 * Master copy. The live worker is Cloudflare -> Workers & Pages -> dodo-checkout;
 * paste this file there and Deploy. See README.md in this folder.
 *
 * - No test mode
 * - Email optional
 * - Retries once with fallback email if needed
 * - Fixes preflight for Cache-Control header
 * - Bounded timeout on Dodo API calls
 * - return_url carries no ?token= (Dodo appends its own query string)
 *
 * Added 24 Sep 2026:
 * - Pre-applies an allow-listed discount code (AGENCY50 for /agency visitors)
 *   via Dodo's `discount_codes`. The browser can only ASK for a code; the
 *   worker decides, from ALLOWED_DISCOUNTS, which codes are valid on which
 *   plans. If Dodo rejects the session with the code (expired, per-customer
 *   limit reached, deleted), the worker retries WITHOUT it, so a bad code can
 *   never block a checkout.
 * - Returns Dodo's raw response (dodo_raw) on success; see PATCH.md.
 *
 * Added 4 Oct 2026 (docs/agency-pricing.md):
 * - Agency accounts cannot buy the $49 Starter plan. Before a starter_* session
 *   is created, the account's segment is read from Supabase
 *   (get_user_segment, keyed by user_token). If it is 'agency', the session is
 *   created for Pro at the same billing period instead, and the response says
 *   so in `plan_redirected`. Existing $49 customers are never in the segment
 *   (the database only flags accounts created after this shipped), so their
 *   plan is untouched. If Supabase cannot be reached, the request goes through
 *   unchanged: a lookup outage must never block a checkout.
 */

const ALLOWED_ORIGINS = [
  'https://linkfinderai.com',
  'https://www.linkfinderai.com',
  // 'http://localhost:3000',
  // 'http://127.0.0.1:3000',
];

const PRODUCT_IDS = {
  starter_monthly:    'pdt_0Nfl5LZfppnjJBM2mvons',
  starter_annual:     'pdt_0Nfl5q5bWWWymf2XQnJUD',
  pro_monthly:        'pdt_0Nfl5YPolhxfkTEMxOJYp',
  pro_annual:         'pdt_0Nfl5zzZR6gaiA1YQPxqj',
  enterprise_monthly: 'pdt_0Nfl5euCguHp4Nh03MAVk',
  enterprise_annual:  'pdt_0Nfl68GPfL6s7UCzsoxwr',
  pack_quick:         'pdt_0Ngb1PwVoM24kOEydcDkT',
  pack_power:         'pdt_0Ngb1URNW4fRAC4F3jyow',
  pack_pro:           'pdt_0Ngb1YZbYwRS1gxfVaN9R',
  payg_small:         'pdt_0Nj62gByZ53OzYoz3bCBr',
  payg_medium:        'pdt_0Nj62kQhG7EzZWogTmjfE',
  payg_large:         'pdt_0Nj62scEtjXTicj4P2thT',
};

const PACK_CREDITS = {
  pack_quick: 1000,
  pack_power: 3000,
  pack_pro: 10000,
  payg_small: 1000,
  payg_medium: 3500,
  payg_large: 10000,
};

// The only codes the browser may request, and the plans each one may be
// applied to. Anything else in the request body is ignored.
const ALLOWED_DISCOUNTS = {
  AGENCY50: ['pro_monthly', 'enterprise_monthly'],
};

// The account's pricing segment. The publishable key is the same one the
// browser uses; get_user_segment returns only the caller's own segment.
// Override with SUPABASE_URL / SUPABASE_KEY env vars if needed.
const SUPABASE_URL_DEFAULT = 'https://snxhsboboatjywgwdeds.supabase.co';
const SUPABASE_KEY_DEFAULT = 'sb_publishable_RKidGRs4ch1ixmRfXoYSww_UsQMSe5w';
const SEGMENT_LOOKUP_TIMEOUT_MS = 3000;

// Plans an agency account may not buy, and what it gets instead.
const AGENCY_PLAN_REDIRECTS = {
  starter_monthly: 'pro_monthly',
  starter_annual: 'pro_annual',
};

const RETURN_URL_BASE = 'https://linkfinderai.com/app';
const DODO_API_HOST = 'https://live.dodopayments.com';

const DODO_REQUEST_TIMEOUT_MS = 10000;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization, X-Requested-With, Pragma',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Headers',
  };
}

function json(body, status, origin) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  if (origin && isAllowedOrigin(origin)) {
    Object.assign(headers, corsHeaders(origin));
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function sanitizeEmail(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function normalizePlan(plan) {
  const p = String(plan || '').trim().toLowerCase();
  const aliases = {
    starter: 'starter_monthly',
    professional: 'pro_monthly',
    pro: 'pro_monthly',
    enterprise: 'enterprise_monthly',
    quick: 'pack_quick',
    power: 'pack_power',
  };
  return aliases[p] || p;
}

// Returns the discount code to apply, or null. Only allow-listed codes, only
// on the plans listed for them.
function resolveDiscount(requested, plan) {
  if (typeof requested !== 'string') return null;
  const code = requested.trim().toUpperCase();
  const plans = ALLOWED_DISCOUNTS[code];
  return plans && plans.includes(plan) ? code : null;
}

// 'agency', null, or undefined when the lookup failed.
async function fetchSegment(userToken, env) {
  const base = (env.SUPABASE_URL || SUPABASE_URL_DEFAULT).replace(/\/$/, '');
  const key = env.SUPABASE_KEY || SUPABASE_KEY_DEFAULT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEGMENT_LOOKUP_TIMEOUT_MS);
  try {
    const resp = await fetch(`${base}/rest/v1/rpc/get_user_segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_token: String(userToken) }),
      signal: controller.signal,
    });
    if (!resp.ok) return undefined;
    const segment = await resp.json();
    return typeof segment === 'string' ? segment : null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function shortHash(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function makeFallbackEmail(userToken, env) {
  const domain = (env.FALLBACK_EMAIL_DOMAIN || 'linkfinderai.com').trim().toLowerCase();
  const h = await shortHash(`${userToken}:${Date.now()}`);
  return `checkout+${h}@${domain}`;
}

// Distinguishes "Dodo took too long" from "network/DNS/connection failure"
// so the client (and PostHog's checkout_error.message) can tell them apart
// instead of both collapsing into a generic network error.
class DodoTimeoutError extends Error {
  constructor() {
    super('Dodo API request timed out');
    this.name = 'DodoTimeoutError';
  }
}

async function createCheckout(apiKey, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DODO_REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(`${DODO_API_HOST}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(payload),
      cf: { cacheEverything: false, cacheTtl: 0 },
      signal: controller.signal,
    });

    const raw = await resp.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    return { resp, data };
  } catch (err) {
    if (err.name === 'AbortError') throw new DodoTimeoutError();
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    // Enforce allowed origins for browser traffic
    if (!isAllowedOrigin(origin)) {
      return json({ error: 'Origin not allowed' }, 403, origin);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    if (!env.DODO_PAYMENTS_API_KEY || typeof env.DODO_PAYMENTS_API_KEY !== 'string') {
      return json({ error: 'Missing DODO_PAYMENTS_API_KEY secret' }, 500, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, origin);
    }

    let { plan, user_token, email, ref_token, request_id, discount_code } = body || {};
    plan = normalizePlan(plan);

    if (!plan || typeof plan !== 'string') {
      return json({ error: 'Missing plan' }, 400, origin);
    }

    if (!user_token || typeof user_token !== 'string' || user_token.length < 8) {
      return json({ error: 'Missing or invalid user_token' }, 400, origin);
    }

    // Agency accounts are refused Starter and sent to Pro (see header).
    let planRedirected = null;
    if (AGENCY_PLAN_REDIRECTS[plan]) {
      const segment = await fetchSegment(user_token, env);
      if (segment === 'agency') {
        planRedirected = { from: plan, to: AGENCY_PLAN_REDIRECTS[plan], reason: 'agency_segment' };
        plan = AGENCY_PLAN_REDIRECTS[plan];
      }
    }

    const productId = PRODUCT_IDS[plan];
    if (!productId) {
      return json({ error: `Plan not configured: ${plan}` }, 400, origin);
    }

    const safeEmail = sanitizeEmail(email); // optional
    const reqId = (typeof request_id === 'string' && request_id.trim()) || crypto.randomUUID();
    const discount = resolveDiscount(discount_code, plan);

    const metadata = {
      user_token: String(user_token),
      plan: String(plan),
      env: 'live',
      request_id: reqId,
      created_at: new Date().toISOString(),
    };

    if (ref_token) metadata.ref_token = String(ref_token);

    if (PACK_CREDITS[plan]) {
      metadata.type = 'one_time';
      metadata.credits = String(PACK_CREDITS[plan]);
    } else {
      metadata.type = 'subscription';
    }

    const basePayload = {
      product_cart: [{ product_id: productId, quantity: 1 }],
      // Bare URL: whatever Dodo appends on return is the URL's only query string.
      return_url: RETURN_URL_BASE,
      metadata,
    };

    // Builds the Dodo request for one attempt.
    function buildPayload(customerEmail, withDiscount, extraMeta) {
      const meta = { ...metadata, ...(extraMeta || {}) };
      if (withDiscount) meta.discount_code = discount;
      const p = { ...basePayload, metadata: meta };
      if (customerEmail) p.customer = { email: customerEmail };
      if (withDiscount) p.discount_codes = [discount];
      return p;
    }

    let attempt = 1;
    let discountApplied = !!discount;
    let discountRejected = null;
    let dodoResp, dodoData;

    try {
      ({ resp: dodoResp, data: dodoData } = await createCheckout(
        env.DODO_PAYMENTS_API_KEY, buildPayload(safeEmail, discountApplied)));

      // A discount code must never block a checkout: if Dodo refused the
      // session with the code, try once more without it.
      if (!dodoResp.ok && discountApplied) {
        attempt++;
        discountApplied = false;
        discountRejected = { status: dodoResp.status, response: dodoData };
        ({ resp: dodoResp, data: dodoData } = await createCheckout(
          env.DODO_PAYMENTS_API_KEY, buildPayload(safeEmail, false)));
      }

      // Retry once with fallback email only if still failing and no valid email provided
      if (!dodoResp.ok && !safeEmail) {
        attempt++;
        const fallbackEmail = await makeFallbackEmail(user_token, env);
        ({ resp: dodoResp, data: dodoData } = await createCheckout(
          env.DODO_PAYMENTS_API_KEY,
          buildPayload(fallbackEmail, false, { used_fallback_email: 'true' })));
      }
    } catch (err) {
      if (err instanceof DodoTimeoutError) {
        return json({
          error: 'Dodo API request timed out',
          request_id: reqId,
        }, 504, origin);
      }
      return json({
        error: 'Network error contacting Dodo',
        request_id: reqId,
      }, 502, origin);
    }

    if (!dodoResp.ok) {
      return json({
        error: 'Failed to create checkout session',
        request_id: reqId,
        dodo_status: dodoResp.status,
        dodo_response: dodoData,
        attempt,
        discount_rejected: discountRejected,
      }, 502, origin);
    }

    const checkoutUrl = dodoData?.checkout_url;
    const sessionId = dodoData?.session_id || dodoData?.checkout_session_id || null;

    if (!checkoutUrl || typeof checkoutUrl !== 'string') {
      return json({
        error: 'Dodo response missing checkout_url',
        request_id: reqId,
        dodo_response: dodoData,
      }, 502, origin);
    }

    return json({
      checkout_url: checkoutUrl,
      session_id: sessionId,
      request_id: reqId,
      env: 'live',
      attempt,
      used_email: !!safeEmail,

      // Which code, if any, is already applied on the Dodo page, and why a
      // requested one was dropped.
      discount_applied: discountApplied ? discount : null,
      discount_rejected: discountRejected,

      // Everything Dodo returned, verbatim (see PATCH.md). app.html forwards
      // this into PostHog on every attempt.
      dodo_raw: dodoData,
      dodo_status: dodoResp.status,
      product_id_used: productId,

      // Set when an agency account asked for Starter and was given Pro.
      plan_redirected: planRedirected,
    }, 200, origin);
  },
};
