'use strict';

/**
 * The whole LinkFinder API is one POST with a `type` discriminator, plus a status
 * endpoint for the operations that come back async. This module is the only place
 * in the Zapier app that knows that; every search in searches/ is a thin call into
 * `runEnrichment`.
 */

const API_BASE = 'https://api.linkfinderai.com';

// Docs: back off 1s, then 2s, then 4s on a 429, then give up.
const RATE_LIMIT_RETRIES = 3;

// A Zapier action gets ~30s before the platform kills it. `linkedin_profile_to_linkedin_info`
// is always async and any operation can fall back to async under load, so we poll —
// but we have to hand back control well before the platform's limit.
const MAX_POLL_MS = 22000;
const FIRST_POLL_DELAY_MS = 1500;
const MAX_POLL_DELAY_MS = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Zapier shows the `message` of a thrown Error directly to the user, so these are
 * written for someone looking at a failed Zap run, not for a developer.
 */
function assertOk(response) {
  const { status } = response;
  const message = response.json?.message;

  if (status === 401) {
    throw new Error('Your LinkFinder AI API key is invalid or expired. Reconnect the account in Zapier.');
  }
  if (status === 402) {
    throw new Error('Your LinkFinder AI account is out of credits. Top up at linkfinderai.com and replay this Zap.');
  }
  if (status === 422) {
    throw new Error(message || 'LinkFinder AI rejected this input. Check the field you mapped matches what this action expects.');
  }
  if (status === 429) {
    throw new Error('LinkFinder AI rate limit reached and the retries were used up. Try again shortly.');
  }
  if (status >= 500) {
    throw new Error(message || 'LinkFinder AI had a server error. It is usually worth retrying in about 30 seconds.');
  }
}

/**
 * Some operations answer HTTP 200 with `status: "success"` while the result is really
 * an upstream failure — `leads_finder_ai` was observed returning an array whose only
 * element was an Apify permissions error. Without this check a Zap would happily map
 * that error object into a CRM as if it were a lead.
 */
function assertNotUpstreamError(result) {
  const items = Array.isArray(result) ? result : [result];

  for (const item of items) {
    const upstream = item && typeof item === 'object' ? item.error : null;
    if (!upstream) continue;

    const message = typeof upstream === 'string' ? upstream : upstream.message || 'upstream provider error';
    throw new Error(
      `LinkFinder AI returned a provider error instead of data: ${String(message).slice(0, 300)}. ` +
        'This is a fault on the LinkFinder side, not with the input — the credits were still spent.',
    );
  }
}

async function postWithRetry(z, body, attempt = 0) {
  const response = await z.request({
    url: API_BASE,
    method: 'POST',
    body,
    // We inspect 401/402/422/429 ourselves to give a useful message.
    skipThrowForStatus: true,
  });

  if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
    await sleep(2 ** attempt * 1000);
    return postWithRetry(z, body, attempt + 1);
  }

  return response;
}

async function pollOnce(z, pollUrl) {
  const response = await z.request({ url: pollUrl, method: 'GET', skipThrowForStatus: true });

  if (response.status === 404) {
    throw new Error('That LinkFinder AI job could not be found. Results expire 10 minutes after they finish.');
  }
  assertOk(response);

  const data = response.json || {};
  if (data.status === 'error') {
    throw new Error(data.message || 'The LinkFinder AI lookup failed.');
  }

  // The status endpoint has been seen returning the payload both flat (`result`)
  // and wrapped (`data: { result }`). Accept either — the same both-ways read the
  // n8n node and the HubSpot action already do.
  const payload = data.data ?? data;
  return { done: data.status !== 'processing', result: payload.result ?? payload ?? null };
}

/**
 * Zapier searches must return an array. A lookup that found nothing returns [] —
 * that is a legitimate outcome, not an error, and it still costs credits.
 */
function toSearchResult(result, operation) {
  if (result === null || result === undefined) return [];
  if (Array.isArray(result)) return result.map((item, index) => normalise(item, index, operation));
  return [normalise(result, 0, operation)];
}

/**
 * Zapier needs an `id` on every search result to de-duplicate, and it builds the
 * field picker from the keys it sees — so a bare scalar like "tesla.com" has to be
 * given a name. Scalar operations declare theirs in the catalog (`website`, `email`,
 * `phone`…), and we also expose it as `value` so a Zap keeps working if an operation
 * later starts returning something richer.
 */
function normalise(item, index, operation) {
  if (item === null || typeof item !== 'object') {
    const named = operation && operation.outputField ? { [operation.outputField]: item } : {};
    return { id: String(item ?? index), value: item, ...named };
  }
  if (item.id !== undefined) return item;

  const identifier =
    item.linkedin_url || item.linkedinUrl || item.email || item.profile_url || item.website || item.domain || item.phone;

  return { id: identifier ? String(identifier) : String(index), ...item };
}

/**
 * Runs one enrichment and waits for it if it comes back async.
 *
 * `alwaysAsync` operations return 202 every time; the rest can still return 202
 * once a lookup runs past the API's sync window, so the async branch is taken on
 * the response shape rather than on the operation.
 */
/**
 * A CRM export writes "Doe, John". The lookup wants "John Doe", and looking
 * someone up backwards costs exactly as much as looking them up right.
 */
function flipName(value) {
  const m = String(value || '').match(/^\s*([^,]{1,60}?)\s*,\s*([^,]{1,60}?)\s*$/);
  return m ? `${m[2]} ${m[1]}` : String(value || '').trim();
}

/**
 * Builds the one string the API takes.
 *
 * For a composite lookup that means joining the mapped fields in the order the
 * catalog declares, dropping the ones a Zap left empty — the same string
 * app.html builds. `input_data` stays accepted as a fallback so a Zap built
 * against the single-field version keeps working.
 */
function buildInput(bundle, operation) {
  const composite = operation.compositeInput;
  if (!composite) return String(bundle.inputData.input_data || '').trim();

  const parts = [];
  for (const part of composite.parts) {
    let value = String(bundle.inputData[part.name] || '').trim();
    if (!value) continue;
    // Only a name is ever "Last, First"; a company like "Gates, Foundation" is not.
    if (part.name === 'name') value = flipName(value);
    parts.push(value);
  }

  if (parts.length) return parts.join(composite.joinWith || ' ');
  return String(bundle.inputData.input_data || '').trim();
}

async function runEnrichment(z, bundle, operation) {
  const inputData = buildInput(bundle, operation);
  if (!inputData) {
    const required = operation.compositeInput ? operation.compositeInput.parts[0].label : operation.inputLabel;
    throw new Error(`${required} is required.`);
  }

  const body = { type: operation.type, input_data: inputData };
  for (const param of operation.params) {
    const value = bundle.inputData[param];
    if (value !== undefined && value !== null && value !== '') {
      body[param] = value;
    }
  }

  let first = await postWithRetry(z, body);

  // The Instagram operation's type name differs between the spec and the published
  // docs, and no other source settles it. Send the spec's name, and if the API rejects
  // it as unknown, try the documented alternative once before giving up.
  if (first.status === 422 && operation.altType) {
    first = await postWithRetry(z, { ...body, type: operation.altType });
  }

  assertOk(first);

  const data = first.json || {};
  const isAsync = first.status === 202 || Boolean(data.job_id);
  if (!isAsync) {
    assertNotUpstreamError(data.result ?? null);
    return toSearchResult(data.result ?? null, operation);
  }

  const pollUrl = data.poll_url || (data.job_id ? `${API_BASE}/status/${data.job_id}` : null);
  if (!pollUrl) {
    throw new Error('LinkFinder AI accepted the job but returned no way to poll it.');
  }

  const deadline = Date.now() + MAX_POLL_MS;
  let delay = FIRST_POLL_DELAY_MS;

  while (Date.now() < deadline) {
    await sleep(delay);
    const polled = await pollOnce(z, pollUrl);
    if (polled.done) {
      assertNotUpstreamError(polled.result);
      return toSearchResult(polled.result, operation);
    }
    delay = Math.min(delay * 1.5, MAX_POLL_DELAY_MS);
  }

  // Out of time rather than out of luck. Zapier has no way to resume a search, so
  // say plainly what happened instead of returning an empty result that would read
  // as "nothing found" and quietly cost the user a credit's worth of confusion.
  throw new Error(
    'This LinkFinder AI lookup was still running when Zapier had to stop waiting. ' +
      'Long-running lookups are better run from the API or n8n, where the job can be polled for longer.',
  );
}

module.exports = {
  buildInput,
  flipName, API_BASE, runEnrichment, assertOk };
