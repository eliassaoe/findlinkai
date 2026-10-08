// Records a public-API lookup in enrichment_history, so it shows up in History
// and counts in "What you've found" on the account page, exactly like a lookup
// made in the app. Drop-in for the api.linkfinderai.com worker, which lives in
// Cloudflare and not in this repo — see README.md for the three lines to add.
//
// Everything here is best-effort: a Supabase outage must never fail or slow an
// API response the customer paid for. Call it through ctx.waitUntil().

// Same table as app.html `creditCosts`. Kept as a copy (the worker cannot import
// the page); tests/api-history.test.mjs fails if the two drift.
export const CREDIT_COSTS = {
    company_name_to_website: 1, company_name_to_phone: 1, company_name_to_linkedin_url: 1,
    email_to_linkedin_url: 5, company_name_to_employees: 1, company_name_to_employee_count: 1,
    company_name_to_email: 5, linkedin_company_to_linkedin_info: 6, linkedin_company_to_employees: 1,
    linkedin_company_to_employee_count: 1, linkedin_profile_to_linkedin_info: 10,
    lead_full_name_to_linkedin_url: 1, linkedin_profile_to_email: 10, company_domain_to_employees: 1,
    linkedin_post_to_reactions: 1, linkedin_profile_to_phone: 50, lead_full_name_to_email: 7,
};

// Async jobs (202 + job_id) are only answered on a later GET /status/{id}, which
// carries no type or input. Remember them for as long as results live.
export const JOB_TTL_SECONDS = 15 * 60;

/** The API key is the session token, each char code + 7, two hex digits, joined by Z. */
export function tokenFromApiKey(key) {
    if (!key) return null;
    const raw = String(key).replace(/^Bearer\s+/i, '').trim();
    if (!raw || !/^[0-9a-f]{2}(Z[0-9a-f]{2})*$/i.test(raw)) return null;
    return raw.split('Z').map((h) => String.fromCharCode(parseInt(h, 16) - 7)).join('');
}

/** Old docs show /v1/<type> and kebab-case paths; the body's `type` wins when present. */
export function typeFrom(body, pathname = '/') {
    const t = body && typeof body.type === 'string' ? body.type.trim() : '';
    if (t) return t;
    const seg = String(pathname).replace(/^\/+(v1\/)?/, '').split('/')[0] || '';
    return seg.replace(/-/g, '_');
}

export function inputFrom(body) {
    if (!body || typeof body !== 'object') return null;
    const v = body.input_data ?? body.input ?? body.linkedin_url ?? body.url ?? body.email ?? body.domain;
    return v == null ? null : String(v);
}

/**
 * Whether a response is worth a History row. A 2xx can still be "no result",
 * but the app records those too (History shows them as not found, and
 * user_value_summary scores them 0), so only drop what is not a lookup at all:
 * a pending job and an error envelope.
 */
export function isRecordable(status, payload) {
    if (status < 200 || status >= 300 || status === 202) return false;
    if (payload == null) return false;
    if (typeof payload === 'object' && !Array.isArray(payload)) {
        if (payload.status === 'processing' || (payload.job_id && !('result' in payload))) return false;
        if (payload.status === 'error' || payload.error) return false;
    }
    return true;
}

/** The jsonb stored as `result`, in the shapes the app already writes. */
export function resultFrom(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') return payload;
    return { result: payload == null ? '' : String(payload) };
}

export function creditsFor(type, result) {
    if (/_to_(employees|reactions)$/.test(type) && Array.isArray(result)) {
        const per = /_to_employees$/.test(type) ? 0.5 : 1;
        return Math.ceil(result.length * per);
    }
    return CREDIT_COSTS[type] ?? 1;
}

async function rpc(env, row, fetchImpl) {
    const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/record_api_enrichment`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify(row),
    });
    return res.ok;
}

/**
 * Call after the API has answered a POST. `payload` is the parsed JSON the
 * customer received. Returns true when a row was written (or tagged).
 */
export async function recordApiCall(env, { apiKey, body, pathname, status, payload }, fetchImpl = fetch) {
    try {
        if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return false;
        const userId = tokenFromApiKey(apiKey);
        const type = typeFrom(body, pathname);
        if (!userId || !type) return false;

        // Async: park the request so the status poll can record it.
        if (status === 202 && payload && payload.job_id && env.API_JOBS) {
            await env.API_JOBS.put(`job:${payload.job_id}`,
                JSON.stringify({ userId, type, input: inputFrom(body) }),
                { expirationTtl: JOB_TTL_SECONDS });
            return false;
        }
        if (!isRecordable(status, payload)) return false;

        const result = resultFrom(payload);
        return await rpc(env, {
            p_user_id: userId, p_type: type, p_input: inputFrom(body),
            p_result: result, p_credits_used: creditsFor(type, result),
        }, fetchImpl);
    } catch (e) {
        return false;
    }
}

/**
 * Call after GET /status/{jobId} has answered. Records the job once, the first
 * time it comes back done, then forgets it so repeated polls add nothing.
 */
export async function recordJobResult(env, { jobId, status, payload }, fetchImpl = fetch) {
    try {
        if (!env || !env.API_JOBS || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return false;
        if (status !== 200 || !payload || payload.status !== 'done') return false;
        const key = `job:${jobId}`;
        const parked = await env.API_JOBS.get(key);
        if (!parked) return false;
        await env.API_JOBS.delete(key);
        const { userId, type, input } = JSON.parse(parked);
        const result = resultFrom(payload.result ?? null);
        return await rpc(env, {
            p_user_id: userId, p_type: type, p_input: input,
            p_result: result, p_credits_used: creditsFor(type, result),
        }, fetchImpl);
    } catch (e) {
        return false;
    }
}
