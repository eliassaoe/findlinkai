const DEFAULT_BASE_URL = "https://api.linkfinderai.com";
const POLL_INTERVAL_MS = 2000;
const MAX_AUTO_POLL_MS = 55_000;

export type EnrichmentType =
  | "leads_finder_ai"
  | "company_name_to_website"
  | "company_domain_to_employees"
  | "linkedin_profile_to_linkedin_info"
  | "b2b_data_lookup"
  | "instagram_lookup";

export class LinkFinderApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LinkFinderApiError";
  }
}

function getApiKey(): string {
  const key = process.env.LINKFINDER_API_KEY;
  if (!key) {
    throw new LinkFinderApiError(
      "LINKFINDER_API_KEY is not set. Get a key at https://linkfinderai.com and set it as an environment variable for this MCP server.",
    );
  }
  return key;
}

function getBaseUrl(): string {
  return process.env.LINKFINDER_API_BASE_URL?.replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

async function request(path: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const url = `${getBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    throw new LinkFinderApiError(
      `Network error calling LinkFinder AI: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let body: any = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: response.status, body };
}

function errorMessageFor(status: number, body: any): string {
  const apiMessage = body && typeof body === "object" ? body.message : undefined;
  switch (status) {
    case 401:
      return `Unauthorized (401): missing or invalid LinkFinder AI API key. ${apiMessage ?? ""}`.trim();
    case 402:
      return `Insufficient credits (402) on this LinkFinder AI account. ${apiMessage ?? ""}`.trim();
    case 422:
      return `Invalid request (422): check the operation type and input. ${apiMessage ?? ""}`.trim();
    case 429:
      return `Rate limited (429) by LinkFinder AI. Try again shortly. ${apiMessage ?? ""}`.trim();
    default:
      if (status >= 500) {
        return `LinkFinder AI server error (${status}). Try again in ~30 seconds. ${apiMessage ?? ""}`.trim();
      }
      return `LinkFinder AI request failed (${status}). ${apiMessage ?? ""}`.trim();
  }
}

export interface EnrichmentResult {
  /** "success" | "processing" | "error" */
  status: "success" | "processing" | "error";
  result?: unknown;
  jobId?: string;
  pollUrl?: string;
  message?: string;
}

export async function pollJob(jobId: string): Promise<EnrichmentResult> {
  const { status, body } = await request(`/status/${encodeURIComponent(jobId)}`, { method: "GET" });

  if (status === 404) {
    return {
      status: "error",
      message: `Job ${jobId} not found or expired (job results expire after 10 minutes).`,
    };
  }
  if (status !== 200) {
    return { status: "error", message: errorMessageFor(status, body) };
  }

  const jobStatus = body?.status;
  if (jobStatus === "done") {
    return { status: "success", result: body.result ?? null };
  }
  if (jobStatus === "error") {
    return { status: "error", message: body?.message || "Job failed." };
  }
  return { status: "processing", jobId };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the single LinkFinder AI dispatch endpoint. If the API responds
 * asynchronously (202), auto-polls /status/{job_id} for a while so callers
 * usually just get a final result; if it's still processing after
 * MAX_AUTO_POLL_MS, returns the job_id so the caller can poll manually via
 * the check_job_status tool.
 */
export async function callLinkFinder(
  type: EnrichmentType,
  inputData: string,
  fetchCount?: number,
): Promise<EnrichmentResult> {
  const payload: Record<string, unknown> = { type, input_data: inputData };
  if (fetchCount !== undefined) payload.fetch_count = fetchCount;

  const { status, body } = await request("/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (status === 200) {
    return { status: "success", result: body?.result ?? null };
  }

  if (status === 202) {
    const jobId: string | undefined = body?.job_id;
    if (!jobId) {
      return { status: "error", message: "LinkFinder AI accepted the request but returned no job_id." };
    }

    const deadline = Date.now() + MAX_AUTO_POLL_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const polled = await pollJob(jobId);
      if (polled.status !== "processing") {
        return polled;
      }
    }

    return {
      status: "processing",
      jobId,
      pollUrl: body?.poll_url,
      message: `Still processing after ${Math.round(MAX_AUTO_POLL_MS / 1000)}s. Use the check_job_status tool with job_id "${jobId}" to keep polling (results expire after 10 minutes).`,
    };
  }

  return { status: "error", message: errorMessageFor(status, body) };
}
