// api.linkfinderai.com — the public API router.
//
// This is the live `linkedfinderapiaccess` Worker, pulled out of the Cloudflare
// dashboard and committed here on 2026-08-25 so it stops being a thing that only
// exists in one browser tab. Read workers/api-router/README.md before editing:
// it records the customer-facing incident that made us go looking at this file,
// and the one bug that turned up while we were in here.
//
// Deploy: paste into the `linkedfinderapiaccess` Worker in the Cloudflare
// dashboard. There is no wrangler project for this one yet.

export default {
  async fetch(request, env, ctx) {
    const allowedOrigin = '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // ---- GET /status/:job_id — poll for async job results ----
    if (url.pathname.startsWith('/status/') && request.method === 'GET') {
      if (!env.jobs_kv) {
        return jsonResponse({ error: 'Configuration error', message: 'JOBS_KV binding is not configured.' }, 500, allowedOrigin);
      }
      const jobId = url.pathname.split('/status/')[1];
      if (!jobId) {
        return jsonResponse({ error: 'Missing job_id' }, 400, allowedOrigin);
      }
      const stored = await env.jobs_kv.get(jobId);
      if (!stored) {
        return jsonResponse({ error: 'Job not found or expired' }, 404, allowedOrigin);
      }
      return jsonResponse(JSON.parse(stored), 200, allowedOrigin);
    }

    // ---- POST /webhook/complete/:job_id — Railway/n8n calls this when a job is actually done ----
    // Instead of the Worker's own execution having to stay alive long enough to
    // `await` a slow Railway response inside ctx.waitUntil (which can be torn down before it
    // resolves), Railway pushes the result to the Worker whenever it finishes, no matter how
    // long that takes.
    if (url.pathname.startsWith('/webhook/complete/') && request.method === 'POST') {
      if (!env.jobs_kv) {
        return jsonResponse({ error: 'Configuration error', message: 'JOBS_KV binding is not configured.' }, 500, allowedOrigin);
      }

      const jobId = url.pathname.split('/webhook/complete/')[1];
      if (!jobId) {
        return jsonResponse({ error: 'Missing job_id' }, 400, allowedOrigin);
      }

      // Simple shared-secret check so random callers can't write into arbitrary job IDs.
      const callbackSecret = request.headers.get('X-Callback-Secret');
      if (!env.CALLBACK_SECRET || callbackSecret !== env.CALLBACK_SECRET) {
        return jsonResponse({ error: 'Unauthorized' }, 401, allowedOrigin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (e) {
        return jsonResponse({ error: 'Invalid JSON' }, 400, allowedOrigin);
      }

      // payload should look like: { http_status: 200, data: {...} } or { error: "..." }
      const record = payload.error
        ? { status: 'error', message: payload.error }
        : { status: 'done', http_status: payload.http_status ?? 200, data: payload.data };

      await env.jobs_kv.put(jobId, JSON.stringify(record), { expirationTtl: 600 });

      return jsonResponse({ ok: true }, 200, allowedOrigin);
    }

    try {
      const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
      if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        return jsonResponse({
          error: 'Authorization header required',
          message: 'Please include Authorization: Bearer <api_key> in your request headers'
        }, 401, allowedOrigin);
      }

      const apiKey = authHeader.replace(/bearer\s+/i, '');
      const rateLimitKey = apiKey;

      let requestData;
      try {
        requestData = await request.json();
      } catch (e) {
        return jsonResponse({
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        }, 400, allowedOrigin);
      }

      const validTypes = [
        'company_name_to_website',
        'company_name_to_phone',
        'company_name_to_email',
        'company_name_to_linkedin_url',
        'linkedin_profile_to_email',
        'linkedin_profile_to_phone',
        'company_name_to_employees',
        'email_to_linkedin_url',
        'linkedin_company_to_linkedin_info',
        'linkedin_profile_to_linkedin_info',
        'lead_full_name_to_linkedin_url',
        'linkedin_post_to_reactions',
        'linkedin_company_to_employees',
        'linkedin_company_to_employee_count',
        'company_name_to_employee_count',
        'company_domain_to_employees',
        'instagram_profile_to_instagram_info',
        'leads_finder_ai'
      ];

      if (!requestData.type) {
        return jsonResponse({ error: 'Missing required parameter', message: 'Parameter "type" is required' }, 400, allowedOrigin);
      }
      if (!validTypes.includes(requestData.type)) {
        return jsonResponse({ error: 'Invalid type parameter', message: `Type must be one of: ${validTypes.join(', ')}` }, 400, allowedOrigin);
      }
      if (!requestData.input_data) {
        return jsonResponse({ error: 'Missing required parameter', message: 'Parameter "input_data" is required' }, 400, allowedOrigin);
      }

      const isBulkSearch = requestData.is_bulk || false;

      // Aggregate cap across ALL users combined, independent of per-key limits below.
      // Per-key limiting alone doesn't stop 10 different customers each bursting at their own
      // allowed rate from summing to more than Railway/the scraper can actually take at once.
      // Soft-fails (allows the request) if the binding isn't configured yet, so forgetting to
      // add GLOBAL_RATE_LIMITER in the dashboard doesn't take the whole API down -- but it logs
      // loudly so that's visible in Cloudflare logs rather than silently unprotected.
      if (env.GLOBAL_RATE_LIMITER) {
        const { success } = await env.GLOBAL_RATE_LIMITER.limit({ key: 'global' });
        if (!success) {
          return jsonResponse({
            error: 'Service busy',
            message: 'Our processing capacity is fully booked right now. Please retry in a few seconds.'
          }, 429, allowedOrigin, { 'Retry-After': '5' });
        }
      } else {
        console.warn('GLOBAL_RATE_LIMITER binding is not configured -- aggregate traffic across all users is currently unprotected.');
      }

      if (!env.RATE_LIMITER) {
        return jsonResponse({ error: 'Configuration error', message: 'RATE_LIMITER binding is not configured.' }, 500, allowedOrigin);
      }
      {
        const { success } = await env.RATE_LIMITER.limit({ key: rateLimitKey });
        if (!success) {
          return jsonResponse({
            error: 'Rate limit exceeded',
            message: 'Too many requests. Maximum 10 requests per 10 seconds per API key.'
          }, 429, allowedOrigin, { 'Retry-After': '10' });
        }
      }

      const rateLimitResult = await checkRateLimit(rateLimitKey, isBulkSearch, env);
      if (!rateLimitResult.allowed) {
        return jsonResponse({
          error: 'Rate limit exceeded',
          message: rateLimitResult.message
        }, 429, allowedOrigin, { 'Retry-After': isBulkSearch ? '10' : '1' });
      }

      requestData.token = apiKey;

      if (!env.jobs_kv) {
        return jsonResponse({ error: 'Configuration error', message: 'JOBS_KV binding is not configured.' }, 500, allowedOrigin);
      }

      // Always attach a job_id + callback_url to the payload sent to Railway/n8n.
      // n8n POSTs its final result to `callback_url` with header
      // `X-Callback-Secret: <same secret as env.CALLBACK_SECRET>` when it finishes, regardless
      // of how long that takes. That call is what makes /webhook/complete/:job_id fire above.
      const jobId = crypto.randomUUID();
      requestData.job_id = jobId;
      requestData.callback_url = `${url.origin}/webhook/complete/${jobId}`;

      // Only linkedin_profile_to_linkedin_info always runs async. Everything else — including
      // company_domain_to_employees — goes through the sync race below and only falls back to
      // async if Railway takes longer than the 27s window.
      //
      // NOTE: this is also the only operation that forces the caller into a polling loop of
      // GET /status/:job_id. That traffic shape — repeated GETs from a non-browser client — is
      // what Cloudflare's edge bot protection reacts to. See README.md.
      const asyncTypes = [
        'linkedin_profile_to_linkedin_info'
      ];

      if (asyncTypes.includes(requestData.type)) {
        await env.jobs_kv.put(jobId, JSON.stringify({ status: 'processing' }), { expirationTtl: 600 });

        // Fire-and-forget: we no longer await Railway's response body here at all.
        // We only need this fetch to successfully hand off the job — n8n calls back later
        // via /webhook/complete regardless of how long processing takes.
        ctx.waitUntil(
          fetch('https://webhook-processor-production-a61c.up.railway.app/webhook/linkfinderapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData),
          }).catch(async (err) => {
            console.error(`Job ${jobId} (${requestData.type}) handoff error:`, err.message);
            await env.jobs_kv.put(jobId, JSON.stringify({
              status: 'error',
              message: 'Failed to hand off job to processing server.'
            }), { expirationTtl: 600 });
          })
        );

        ctx.waitUntil(updateRateLimit(rateLimitKey, isBulkSearch, env));

        return jsonResponse({
          job_id: jobId,
          status: 'processing',
          poll_url: `${url.origin}/status/${jobId}`,
          message: 'This request type always runs asynchronously. Poll the poll_url for the result.'
        }, 202, allowedOrigin);
      }

      // ---- Race Railway against a 27s sync window (for fast/default types) ----
      const startTime = Date.now();

      const railwayPromise = fetch('https://webhook-processor-production-a61c.up.railway.app/webhook/linkfinderapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 27000));

      let raceResult;
      try {
        raceResult = await Promise.race([railwayPromise, timeoutPromise]);
      } catch (fetchError) {
        console.error('Railway fetch error:', fetchError.message);
        return jsonResponse({
          error: 'Service unavailable',
          message: 'Could not reach the processing server. Please try again.'
        }, 503, allowedOrigin);
      }

      ctx.waitUntil(updateRateLimit(rateLimitKey, isBulkSearch, env));

      if (raceResult === 'TIMEOUT') {
        console.log(`Job ${jobId} exceeded 27s sync window, falling back to async. Type: ${requestData.type}`);

        await env.jobs_kv.put(jobId, JSON.stringify({ status: 'processing' }), { expirationTtl: 600 });

        // We no longer await railwayPromise here. n8n already has job_id + callback_url
        // in the payload it received, so it will call /webhook/complete/:job_id itself when done —
        // even if this Worker instance is long gone by then.
        ctx.waitUntil(
          railwayPromise
            .then((response) => {
              const elapsed = Date.now() - startTime;
              console.log(`Job ${jobId} initial Railway response after ${elapsed}ms (fire-and-forget, awaiting callback for final result)`);
            })
            .catch((err) => {
              console.error(`Job ${jobId} background fetch error:`, err.message);
            })
        );

        return jsonResponse({
          job_id: jobId,
          status: 'processing',
          poll_url: `${url.origin}/status/${jobId}`,
          message: 'This request is taking longer than usual. Poll the poll_url for the result.'
        }, 202, allowedOrigin);
      }

      // ---- Fast path: Railway answered within 27s, behave like the original sync worker ----
      const response = raceResult;
      const elapsed = Date.now() - startTime;
      console.log(`Job ${jobId} Railway responded after ${elapsed}ms (sync path)`);

      // `text` has to be declared out here, because the 401/403 diagnostic below reads it.
      // It used to be `const text` INSIDE the try block, so the diagnostic referenced a
      // binding that did not exist in that scope. Every upstream 401 or 403 therefore threw
      // ReferenceError, got swallowed by the outer catch, and reached the customer as a
      // generic 500 "Internal server error" — hiding the real status, on exactly the two
      // statuses a customer most needs to see (bad key / upstream refusal).
      let text = '';
      try {
        text = await response.text();
      } catch (readError) {
        console.error(`Job ${jobId} could not read Railway response body:`, readError.message);
        return jsonResponse({
          error: 'Invalid response from server',
          message: 'Could not read the response from the processing server. Please try again.'
        }, 502, allowedOrigin);
      }

      // Log the upstream body BEFORE parsing it. A 401/403 from Railway is usually an HTML
      // error page rather than JSON, so under the old ordering JSON.parse threw first and
      // returned 502 — meaning this log line never ran in precisely the case it exists for.
      if (response.status === 403 || response.status === 401) {
        console.error(`Job ${jobId} (${requestData.type}) got ${response.status} from Railway for key ending in ...${apiKey.slice(-4)}. Upstream body:`, text.slice(0, 500));
      }

      if (!text || text.trim() === '') {
        return jsonResponse({
          error: 'Empty response',
          message: 'The server returned an empty response. Please try again.'
        }, 502, allowedOrigin);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        return jsonResponse({
          error: 'Invalid response from server',
          message: 'The server returned malformed data. Please try again.'
        }, 502, allowedOrigin);
      }

      return jsonResponse(data, response.status, allowedOrigin);

    } catch (error) {
      console.error('Unhandled error in API worker:', error);
      return jsonResponse({
        error: 'Internal server error',
        message: error.message
      }, 500, allowedOrigin);
    }
  },
};

function jsonResponse(data, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      ...extraHeaders
    },
  });
}

// Loosened from 5s/60s (0.2 req/s individual, 0.017 req/s bulk) — that was far below every
// documented plan tier (Starter alone promises 5 req/s) and applied identically regardless of
// plan. 1s/10s still throttles abuse but no longer bottlenecks below what's documented, and
// lines up with the RATE_LIMITER binding's own ceiling of 10 req/10s so this layer isn't the
// thing rejecting requests a customer's plan should allow.
async function checkRateLimit(key, isBulkSearch, env) {
  if (!env.RATE_LIMIT_KV) return { allowed: true };

  const kvKey = isBulkSearch ? `bulk:${key}` : `individual:${key}`;
  const windowMs = isBulkSearch ? 10000 : 1000;

  try {
    const lastSearch = await env.RATE_LIMIT_KV.get(kvKey);
    if (lastSearch) {
      const timeDiff = Date.now() - parseInt(lastSearch);
      if (timeDiff < windowMs) {
        const remainingTime = Math.ceil((windowMs - timeDiff) / 1000) || 1;
        return {
          allowed: false,
          message: `Rate limit exceeded. Please wait ${remainingTime} second${remainingTime > 1 ? 's' : ''} before making another ${isBulkSearch ? 'bulk ' : ''}request.`
        };
      }
    }
    return { allowed: true };
  } catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true };
  }
}

async function updateRateLimit(key, isBulkSearch, env) {
  if (!env.RATE_LIMIT_KV) return;

  const kvKey = isBulkSearch ? `bulk:${key}` : `individual:${key}`;
  const ttl = isBulkSearch ? 10 : 1;

  try {
    await env.RATE_LIMIT_KV.put(kvKey, Date.now().toString(), { expirationTtl: ttl });
  } catch (error) {
    console.error('Rate limit update error:', error);
  }
}
