// Dodo Payments -> PostHog webhook bridge.
//
// Why this exists: `checkout_payment_success` is captured in the browser, and only
// when the customer lands back on /app with a success parameter in the URL. A
// customer who pays and then closes the tab, loses signal on the redirect, or
// completes payment on a different device is invisible — the money arrives and
// the funnel still reads zero. That is not a reporting nicety: it is the reason a
// "no sales in five days" reading cannot currently be trusted.
//
// Dodo knows about every payment regardless of what the browser did. This worker
// listens to Dodo, verifies the signature, and captures the same events into
// PostHog server-side, so the analytics match the bank account.
//
// Deploy: see README.md in this directory.

const POSTHOG_HOST = 'https://us.i.posthog.com';

// Dodo event types we care about, mapped to the PostHog event name each becomes.
// Anything not listed here is acknowledged and ignored, so new Dodo event types
// never cause retries.
const EVENT_MAP = {
    'payment.succeeded': 'payment_succeeded_server',
    'subscription.active': 'subscription_active_server',
    'subscription.renewed': 'subscription_renewed_server',
    'subscription.cancelled': 'subscription_cancelled_server',
    'subscription.failed': 'subscription_failed_server',
    'payment.failed': 'payment_failed_server'
};

export default {
    async fetch(request, env) {
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Read the body as text once: signature verification has to run over the
        // exact bytes Dodo signed, not a re-serialised object.
        const rawBody = await request.text();

        const verified = await verifySignature(request, rawBody, env.DODO_WEBHOOK_SECRET);
        if (!verified.ok) {
            // 401 rather than 400: this is an authentication failure, and Dodo
            // should not retry a payload we will never accept.
            return new Response(JSON.stringify({ error: verified.reason }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
        }

        const dodoType = payload?.type || payload?.event_type;
        const eventName = EVENT_MAP[dodoType];

        // Acknowledge unmapped events so Dodo stops retrying them.
        if (!eventName) {
            return json({ ok: true, ignored: dodoType || 'unknown' });
        }

        const data = payload?.data || {};
        const distinctId = resolveDistinctId(data);

        if (!distinctId) {
            // Still a 200: retrying will not conjure a user token. Surfacing it as
            // its own PostHog event is more useful than dropping it silently,
            // because a run of these means the checkout worker stopped forwarding
            // metadata and every server-side attribution is quietly broken.
            await captureToPostHog(env, {
                event: 'payment_unattributed_server',
                distinct_id: 'server_unattributed',
                properties: {
                    dodo_event_type: dodoType,
                    payment_id: data.payment_id || null,
                    subscription_id: data.subscription_id || null,
                    customer_email: data.customer?.email || null
                }
            });
            return json({ ok: true, warning: 'no user_token in metadata' });
        }

        await captureToPostHog(env, {
            event: eventName,
            distinct_id: distinctId,
            properties: {
                dodo_event_type: dodoType,
                payment_id: data.payment_id || null,
                subscription_id: data.subscription_id || null,
                product_id: data.product_id || null,
                // Dodo reports money in the currency's minor unit (cents).
                amount: typeof data.total_amount === 'number' ? data.total_amount / 100 : null,
                currency: data.currency || null,
                status: data.status || null,
                customer_email: data.customer?.email || null,
                // Attribution captured in the browser at checkout time and passed
                // through as metadata, so server-side revenue is still traceable
                // back to the campaign that produced it.
                attribution_source: data.metadata?.attribution_source || null,
                attribution_campaign: data.metadata?.attribution_campaign || null,
                attempt_id: data.metadata?.attempt_id || null,
                source: 'dodo_webhook'
            }
        });

        return json({ ok: true, captured: eventName });
    }
};

// The user token is what the browser calls posthog.identify() with, so using it
// here is what makes a server-side payment land on the same person as their
// browsing history. Falling back to the Dodo customer id keeps the event rather
// than losing it, at the cost of it being a separate person.
function resolveDistinctId(data) {
    return (
        data?.metadata?.user_token ||
        data?.metadata?.distinct_id ||
        data?.customer?.customer_id ||
        null
    );
}

// Standard Webhooks signature verification (the spec Dodo implements).
// The signed payload is `{id}.{timestamp}.{body}`, HMAC-SHA256 with the secret,
// base64 encoded. The signature header can carry several space-separated
// versioned signatures during key rotation, so check all of them.
async function verifySignature(request, rawBody, secret) {
    if (!secret) return { ok: false, reason: 'server missing DODO_WEBHOOK_SECRET' };

    const id = request.headers.get('webhook-id');
    const timestamp = request.headers.get('webhook-timestamp');
    const signatureHeader = request.headers.get('webhook-signature');

    if (!id || !timestamp || !signatureHeader) {
        return { ok: false, reason: 'missing signature headers' };
    }

    // Reject replays of an old, legitimately signed payload.
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) {
        return { ok: false, reason: 'timestamp outside tolerance' };
    }

    // Dodo secrets are distributed prefixed; the key material is the base64 part.
    const secretBytes = base64ToBytes(secret.startsWith('whsec_') ? secret.slice(6) : secret);

    const key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signed = `${id}.${timestamp}.${rawBody}`;
    const macBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
    const expected = bytesToBase64(new Uint8Array(macBuffer));

    const provided = signatureHeader.split(' ').map(part => {
        const comma = part.indexOf(',');
        return comma === -1 ? part : part.slice(comma + 1);
    });

    for (const candidate of provided) {
        if (timingSafeEqual(candidate, expected)) return { ok: true };
    }

    return { ok: false, reason: 'signature mismatch' };
}

// Constant-time comparison, so a caller cannot narrow the signature down one
// character at a time by measuring how long the rejection takes.
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

async function captureToPostHog(env, event) {
    try {
        await fetch(`${POSTHOG_HOST}/capture/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: env.POSTHOG_API_KEY,
                event: event.event,
                distinct_id: event.distinct_id,
                properties: event.properties,
                timestamp: new Date().toISOString()
            })
        });
    } catch (e) {
        // A PostHog outage must not make Dodo retry a payment webhook we have
        // already accepted, so swallow it. Cloudflare's own logs keep the trace.
        console.error('PostHog capture failed', e);
    }
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
