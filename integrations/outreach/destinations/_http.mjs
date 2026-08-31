/**
 * One place for "call the destination and turn a failure into something readable".
 *
 * Every adapter below is the same two facts — how to authenticate, and what body this
 * tool wants — so anything that is not one of those two facts belongs here.
 */

export class DestinationError extends Error {
    constructor(destination, status, body) {
        const detail =
            (typeof body === 'string' ? body : body?.message ?? body?.error ?? body?.detail ?? '')
                .toString()
                .slice(0, 300) || `HTTP ${status}`;
        super(`${destination}: ${detail}`);
        this.name = 'DestinationError';
        this.destination = destination;
        this.status = status;
        this.body = body;
    }
}

export async function send(destination, url, options) {
    const response = await fetch(url, options);

    const text = await response.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }

    if (!response.ok) {
        // 401/403 is almost always a wrong or expired key rather than a bad payload,
        // and saying so saves a round of debugging the lead data instead.
        if (response.status === 401 || response.status === 403) {
            throw new DestinationError(destination, response.status, 'authentication failed — check the API key and its permissions');
        }
        throw new DestinationError(destination, response.status, body);
    }

    return body;
}

export const json = (payload) => ({ 'Content-Type': 'application/json', ...payload });
