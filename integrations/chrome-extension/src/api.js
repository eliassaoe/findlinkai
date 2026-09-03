/**
 * The LinkFinder API client, kept separate from the service worker so it can be
 * unit-tested in node with fetch and sleep injected.
 *
 * Everything here runs in the extension's service worker, never in the page.
 * openapi.json says of the bearer token: "Server-side only — never expose it
 * client-side." An extension cannot be server-side, so the next best thing is
 * what this enforces: the key lives in chrome.storage.local, is read only here,
 * and is never sent to a content script, never written to the DOM, and never
 * reachable by linkedin.com's own scripts. Exposure is scoped to the one person
 * whose key it already is.
 */
import { API_BASE } from './generated/operations.js';

const POLL_BUDGET_MS = 90_000;
const POLL_MIN_MS = 1_500;
const POLL_MAX_MS = 4_000;

/** Errors carrying a message we are willing to show a user verbatim. */
export class ApiError extends Error {
    constructor(message, { status = null, retryable = false } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.retryable = retryable;
    }
}

// The spec's documented failures, phrased for someone standing on a LinkedIn
// profile who does not know what a 402 is.
function errorFor(status, body) {
    const fromServer = body && typeof body.message === 'string' ? body.message : '';
    switch (status) {
        case 401:
            return new ApiError('Your API key was rejected. Open the extension options and paste it again.', { status });
        case 402:
            return new ApiError('Not enough credits on your LinkFinder account for this lookup.', { status });
        case 422:
            return new ApiError(fromServer || 'LinkFinder could not read that URL.', { status });
        case 429:
            return new ApiError('Too many lookups at once. Wait a moment and try again.', { status, retryable: true });
        default:
            if (status >= 500) {
                return new ApiError('LinkFinder is having trouble right now. Try again shortly.', { status, retryable: true });
            }
            return new ApiError(fromServer || `Request failed (HTTP ${status}).`, { status });
    }
}

function transportError(error) {
    if (error && error.name === 'AbortError') return new ApiError('Lookup cancelled.', { retryable: true });
    return new ApiError('Could not reach LinkFinder. Check your connection and try again.', { retryable: true });
}

async function readJson(response) {
    // A proxy or gateway can return HTML with a JSON content-type; a parse failure
    // must not surface as "undefined is not an object".
    try {
        return await response.json();
    } catch {
        return null;
    }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one enrichment and resolves to { result, charged, jobId }.
 *
 * `result` is null when the API found nothing. That case is NOT an error and it
 * IS still billed — per openapi.json, "null when nothing was found — the call is
 * still charged" — so `charged` stays true and callers must say so.
 */
export async function runOperation({
    apiKey,
    type,
    inputData,
    params = {},
    fetchImpl = fetch,
    sleep = defaultSleep,
    now = () => Date.now(),
    signal,
}) {
    if (!apiKey) throw new ApiError('No API key set. Open the extension options to add one.');
    if (!inputData) throw new ApiError('No LinkedIn URL to look up on this page.');

    // A transport failure (offline, DNS, a corporate proxy blocking the host) is a
    // TypeError from fetch, not a status code. Left unwrapped it reaches the panel
    // as the generic "something went wrong", which would send a user hunting for a
    // bug in the extension when their network is the problem.
    let response;
    try {
        response = await fetchImpl(`${API_BASE}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ type, input_data: inputData, ...params }),
            signal,
        });
    } catch (error) {
        throw transportError(error);
    }

    const body = await readJson(response);

    if (response.status === 200) {
        return { result: body ? body.result ?? null : null, charged: true, jobId: null };
    }

    if (response.status === 202) {
        const jobId = body && body.job_id;
        if (!jobId) throw new ApiError('LinkFinder accepted the job but returned no job id.', { status: 202 });
        return { ...(await pollJob({ apiKey, jobId, fetchImpl, sleep, now, signal })), jobId };
    }

    throw errorFor(response.status, body);
}

/**
 * Polls /status/{job_id} until done or error.
 *
 * Bounded on purpose: a service worker is killed after ~30s idle in MV3, so an
 * unbounded poll would look to the user like a request that never returns. The
 * budget is generous enough for the two alwaysAsync operations and short enough
 * to fail visibly rather than hang. Job results expire ten minutes after
 * completion, so there is nothing to recover by waiting longer.
 */
export async function pollJob({ apiKey, jobId, fetchImpl = fetch, sleep = defaultSleep, now = () => Date.now(), signal }) {
    const deadline = now() + POLL_BUDGET_MS;
    let wait = POLL_MIN_MS;

    while (now() < deadline) {
        await sleep(wait);
        wait = Math.min(Math.round(wait * 1.4), POLL_MAX_MS);

        let response;
        try {
            response = await fetchImpl(`${API_BASE}/status/${encodeURIComponent(jobId)}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal,
            });
        } catch (error) {
            throw transportError(error);
        }
        const body = await readJson(response);

        if (response.status === 404) {
            throw new ApiError('That lookup expired before it finished. Try it again.', { status: 404 });
        }
        if (!response.ok) throw errorFor(response.status, body);

        const status = body && body.status;
        if (status === 'done') return { result: body.result ?? null, charged: true };
        if (status === 'error') {
            throw new ApiError((body && body.message) || 'The lookup failed.', { status: 200 });
        }
        // 'processing' — keep going.
    }

    throw new ApiError('That lookup is taking longer than expected. It may still finish — check your LinkFinder history.', {
        retryable: true,
    });
}

/**
 * Turns a result into lines for display.
 *
 * The catalog says whether an operation returns a scalar, an object or a list,
 * so this does not have to guess per operation.
 */
export function presentResult(operation, result) {
    if (result === null || result === undefined) return [];

    if (operation.outputKind === 'scalar') {
        const value = operation.outputField && typeof result === 'object' ? result[operation.outputField] : result;
        return value === null || value === undefined || value === '' ? [] : [{ label: operation.short, value: String(value) }];
    }

    if (operation.outputKind === 'list') {
        const rows = Array.isArray(result) ? result : Array.isArray(result?.results) ? result.results : [];
        return rows.map((row, i) => ({
            label: `${i + 1}`,
            value: typeof row === 'object' ? (row.name ?? JSON.stringify(row)) : String(row),
            detail: typeof row === 'object' ? row : null,
        }));
    }

    // object
    if (typeof result !== 'object') return [{ label: operation.short, value: String(result) }];
    return Object.entries(result)
        .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
        .map(([k, v]) => ({ label: k, value: String(v) }));
}
