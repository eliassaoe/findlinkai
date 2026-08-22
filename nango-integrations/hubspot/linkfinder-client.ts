// Shared helper for calling the LinkFinder AI API (https://api.linkfinderai.com) from
// HubSpot actions. Not an action itself — only files inside actions/ and syncs/ are
// treated as Nango entrypoints, so this lives one level up and is imported by them.

export const LINKFINDER_API_BASE = 'https://api.linkfinderai.com';

export interface LinkFinderResponse {
    status?: 'success' | 'error' | 'processing' | 'done';
    result?: unknown;
    message?: string;
    job_id?: string;
    poll_url?: string;
}

export class LinkFinderError extends Error {
    code: string;

    constructor(message: string, code: string) {
        super(message);
        this.code = code;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWithRetry(url: string, apiKey: string, body: unknown, attempt = 0): Promise<Response> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    // Docs: on 429, back off 1s, then 2s, then 4s.
    if (response.status === 429 && attempt < 3) {
        await sleep(2 ** attempt * 1000);
        return postWithRetry(url, apiKey, body, attempt + 1);
    }

    return response;
}

function assertOk(status: number, data: LinkFinderResponse): void {
    if (status === 401) {
        throw new LinkFinderError('Invalid or missing LinkFinder AI API key.', 'unauthorized');
    }
    if (status === 402) {
        throw new LinkFinderError('LinkFinder AI account has insufficient credits.', 'insufficient_credits');
    }
    if (status === 422) {
        throw new LinkFinderError(data.message ?? 'Invalid LinkFinder AI request — check the type/input_data.', 'invalid_request');
    }
    if (status === 429) {
        throw new LinkFinderError('LinkFinder AI rate limit exceeded and retries were exhausted.', 'rate_limited');
    }
    if (status >= 500) {
        throw new LinkFinderError(data.message ?? 'LinkFinder AI server error.', 'server_error');
    }
}

export interface LinkFinderOutcome {
    /** false when the job was still processing when we stopped waiting */
    resolved: boolean;
    result: unknown;
    /*
     * `| undefined` is required, not decorative: Nango compiles with
     * exactOptionalPropertyTypes, under which `jobId?: string` means the key is
     * either absent or a string - assigning an explicit `undefined` is an error.
     * Every construction site below builds the object in one literal with the
     * key always present, so the value genuinely can be undefined.
     */
    jobId?: string | undefined;
    pollUrl?: string | undefined;
}

/**
 * Calls the LinkFinder AI endpoint and, if the response comes back async
 * (202 + job_id — always the case for linkedin_profile_to_linkedin_info, and
 * possible on any endpoint after ~27s), polls for up to maxWaitMs before
 * giving up and returning resolved=false with the job info so the caller can
 * hand it to check-linkfinder-job.
 */
export async function callLinkFinderAI(apiKey: string, type: string, inputData: string, maxWaitMs = 20000): Promise<LinkFinderOutcome> {
    const response = await postWithRetry(LINKFINDER_API_BASE, apiKey, { type, input_data: inputData });
    const data = (await response.json()) as LinkFinderResponse;

    assertOk(response.status, data);

    if (response.status !== 202 && !data.job_id) {
        return { resolved: true, result: data.result ?? null };
    }

    return pollUntil(apiKey, { jobId: data.job_id, pollUrl: data.poll_url }, maxWaitMs);
}

/** Single, non-looping status check — meant to be called repeatedly from a workflow delay loop. */
export async function checkLinkFinderJob(apiKey: string, job: { jobId?: string | undefined; pollUrl?: string | undefined }): Promise<LinkFinderOutcome> {
    const pollUrl = resolvePollUrl(job);

    const response = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiKey}` } });

    if (response.status === 404) {
        throw new LinkFinderError('LinkFinder AI job not found or expired (job results expire after 10 minutes).', 'not_found');
    }

    const data = (await response.json()) as LinkFinderResponse;
    assertOk(response.status, data);

    if (data.status === 'error') {
        throw new LinkFinderError(data.message ?? 'LinkFinder AI job failed.', 'job_failed');
    }

    return {
        resolved: data.status !== 'processing',
        result: data.result ?? null,
        jobId: job.jobId,
        pollUrl
    };
}

async function pollUntil(apiKey: string, job: { jobId?: string | undefined; pollUrl?: string | undefined }, maxWaitMs: number): Promise<LinkFinderOutcome> {
    const pollUrl = resolvePollUrl(job);
    const deadline = Date.now() + maxWaitMs;
    let delay = 1500;

    while (Date.now() < deadline) {
        await sleep(delay);

        const outcome = await checkLinkFinderJob(apiKey, { jobId: job.jobId, pollUrl });
        if (outcome.resolved) {
            return outcome;
        }

        delay = Math.min(delay * 1.5, 4000);
    }

    return { resolved: false, result: null, jobId: job.jobId, pollUrl };
}

function resolvePollUrl(job: { jobId?: string | undefined; pollUrl?: string | undefined }): string {
    const pollUrl = job.pollUrl ?? (job.jobId ? `${LINKFINDER_API_BASE}/status/${job.jobId}` : undefined);
    if (!pollUrl) {
        throw new LinkFinderError('Provide either a jobId or a pollUrl.', 'invalid_request');
    }
    return pollUrl;
}

/** Builds the HubSpot `properties` patch body: raw JSON on targetProperty, plus any mapped fields. */
export function buildHubspotProperties(
    result: Record<string, unknown>,
    targetProperty: string,
    propertyMap?: Record<string, string>
): { properties: Record<string, string>; updatedProperties: string[] } {
    const properties: Record<string, string> = { [targetProperty]: JSON.stringify(result) };
    const updatedProperties = [targetProperty];

    if (propertyMap) {
        for (const [resultKey, hubspotProperty] of Object.entries(propertyMap)) {
            const value = result[resultKey];
            if (value !== undefined && value !== null) {
                properties[hubspotProperty] = typeof value === 'string' ? value : JSON.stringify(value);
                updatedProperties.push(hubspotProperty);
            }
        }
    }

    return { properties, updatedProperties };
}
