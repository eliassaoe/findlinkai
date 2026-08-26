/**
 * Calling LinkFinder AI from a plain fetch runtime (a Cloudflare Worker, a script, a
 * serverless function). Dependency-free ESM so it runs anywhere `fetch` exists.
 *
 * Same policy as the other integrations: retry a 429 three times with the documented
 * backoff, take the async branch on the response shape rather than on the operation,
 * and turn HTTP status codes into errors that say what to do about them.
 */

export const API_BASE = 'https://api.linkfinderai.com';

export class LinkFinderError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'LinkFinderError';
        this.code = code;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertOk(status, body) {
    if (status === 401) throw new LinkFinderError('Invalid or missing LinkFinder AI API key.', 'unauthorized');
    if (status === 402) throw new LinkFinderError('LinkFinder AI account is out of credits.', 'insufficient_credits');
    if (status === 422) throw new LinkFinderError(body?.message ?? 'LinkFinder AI rejected the input.', 'invalid_request');
    if (status === 429) throw new LinkFinderError('LinkFinder AI rate limit exceeded and retries were exhausted.', 'rate_limited');
    if (status >= 500) throw new LinkFinderError(body?.message ?? 'LinkFinder AI server error.', 'server_error');
}

async function postWithRetry(apiKey, body, attempt = 0) {
    const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });

    // Docs: back off 1s, then 2s, then 4s.
    if (response.status === 429 && attempt < 3) {
        await sleep(2 ** attempt * 1000);
        return postWithRetry(apiKey, body, attempt + 1);
    }

    return response;
}

/**
 * Runs one enrichment, polling if it comes back as a job.
 *
 * Returns `{ resolved, result, jobId, pollUrl }`. `resolved: false` means the job was
 * still running when maxWaitMs ran out — the caller can poll it later rather than
 * losing the credits already spent.
 */
export async function enrich(apiKey, type, inputData, { maxWaitMs = 25000, ...params } = {}) {
    const response = await postWithRetry(apiKey, { type, input_data: inputData, ...params });
    const body = await response.json().catch(() => ({}));
    assertOk(response.status, body);

    if (response.status !== 202 && !body.job_id) {
        return { resolved: true, result: body.result ?? null };
    }

    const pollUrl = body.poll_url ?? `${API_BASE}/status/${body.job_id}`;
    const deadline = Date.now() + maxWaitMs;
    let delay = 1500;

    while (Date.now() < deadline) {
        await sleep(delay);

        const polled = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (polled.status === 404) {
            throw new LinkFinderError('LinkFinder AI job not found or expired (results expire after 10 minutes).', 'not_found');
        }

        const data = await polled.json().catch(() => ({}));
        assertOk(polled.status, data);

        if (data.status === 'error') throw new LinkFinderError(data.message ?? 'LinkFinder AI job failed.', 'job_failed');

        if (data.status !== 'processing') {
            // The status endpoint has been seen returning the payload both flat and
            // wrapped in `data`; accept either.
            const payload = data.data ?? data;
            return { resolved: true, result: payload.result ?? null };
        }

        delay = Math.min(delay * 1.5, 4000);
    }

    return { resolved: false, result: null, jobId: body.job_id, pollUrl };
}
