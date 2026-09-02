// ===========================================================================
// Referral program v2
// ===========================================================================
//
// A commission exists for exactly one reason: Dodo told us, over a
// signature-verified webhook, that a referred customer paid. Nothing the
// browser sends can create one. That is the entire design, and it is what
// separates this from v1 and from a "refer a colleague" credit faucet - both
// of which pay out for actions the referrer fully controls.
//
// Attribution path, chosen to survive the one thing we cannot change:
//
//   ?ref=CODE  ->  localStorage + cookie  ->  POST /attribute at signup
//                  ->  referral_attributions (locked, one row per user, ever)
//   Dodo payment webhook  ->  resolve payer BY EMAIL  ->  their attribution
//                          ->  referral_commissions
//
// Resolving by email matters: the live `dodo-checkout` worker is not in this
// repo and cannot be edited from here, so we cannot rely on it putting a
// referral code (or anything else) into checkout metadata. The customer email
// is on every Dodo payment payload regardless. Metadata is still read when it
// happens to be there, as a better-than-email match.
//
// Endpoints
//   POST /me         { token }                  -> code, stats, payout details
//   POST /attribute  { token, code }            -> lock attribution at signup
//   POST /payout     { token, payout_email }    -> set where to get paid
//   GET  /r/:code                               -> log click, 302 to the site
//   POST /webhook/dodo                          -> signed; writes commissions
//
// Deploy: see README.md.

const COMMISSION_RATE = 0.25;      // 25% of what the referred customer pays
// Capped per referred customer, not per partner and not per payment: someone
// who sends five paying customers can earn five times this. The cap is what
// makes "up to $500" a true statement rather than marketing - without it the
// 25% runs forever and the real number is unbounded.
const COMMISSION_CAP_PER_REFERRED = 500;
const HOLD_DAYS       = 30;        // refund window before a commission is owed
const PAYOUT_MINIMUM  = 50;        // USD, below which a payout is not run
const SITE            = 'https://linkfinderai.com';

export default {
    // Nightly: everything past the refund window becomes owed. 'review' is
    // deliberately excluded - a flagged attribution only moves by hand.
    async scheduled(event, env, ctx) {
        ctx.waitUntil(approveMaturedCommissions(env));
    },

    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';

        if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);

        // Click tracking is a GET so it can be the href of the shared link.
        if (request.method === 'GET' && url.pathname.startsWith('/r/')) {
            return handleClick(url, request, env);
        }

        // Open this in a browser to find out what is wrong. It reports which
        // bindings exist (never their values) and whether the tables answer.
        // Deploying the code and applying the schema are two separate steps
        // done in two different dashboards, so "the worker is up" and "the
        // worker works" are genuinely different states, and without this the
        // difference is invisible from outside.
        if (request.method === 'GET' && url.pathname === '/health') {
            return cors(await handleHealth(env), origin);
        }

        if (request.method !== 'POST') {
            return cors(json({ error: 'Method not allowed' }, 405), origin);
        }

        // The webhook is verified by signature, not by the app's API secret,
        // and must be checked before any other auth runs.
        if (url.pathname === '/webhook/dodo') {
            return handleDodoWebhook(request, env);
        }

        let body;
        try { body = await request.json(); } catch (e) { return cors(json({ error: 'Invalid JSON' }, 400), origin); }

        const userId = await resolveUser(env, body.token);
        if (!userId) return cors(json({ error: 'Invalid token' }, 401), origin);

        try {
            if (url.pathname === '/me')        return cors(await handleMe(env, userId), origin);
            if (url.pathname === '/attribute') return cors(await handleAttribute(env, userId, body), origin);
            if (url.pathname === '/payout')    return cors(await handlePayout(env, userId, body), origin);
        } catch (e) {
            // The message is a table name and an HTTP status, never a secret,
            // and swallowing it meant the page could only ever say "not
            // switched on yet" no matter what had actually gone wrong.
            console.error(url.pathname, e);
            return cors(json({ error: 'Server error', detail: String(e && e.message || e) }, 500), origin);
        }

        return cors(json({ error: 'Not found' }, 404), origin);
    }
};

// ---------------------------------------------------------------------------
// GET /health - what is actually configured, and does it work
// ---------------------------------------------------------------------------
async function handleHealth(env) {
    const bindings = {
        SUPABASE_URL: !!env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
        DODO_WEBHOOK_SECRET: !!env.DODO_WEBHOOK_SECRET,
        CLICK_SALT: !!env.CLICK_SALT,
    };

    const tables = {};
    for (const table of ['referral_partners', 'referral_attributions', 'referral_commissions', 'referral_clicks', 'linkfinderai_users']) {
        try {
            const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers: sbHeaders(env) });
            tables[table] = res.ok ? 'ok' : `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
        } catch (e) {
            tables[table] = `unreachable: ${String(e && e.message || e)}`;
        }
    }

    const problems = [];
    if (!bindings.SUPABASE_URL || !bindings.SUPABASE_SERVICE_ROLE_KEY) {
        problems.push('Supabase bindings missing - nothing can be read or written.');
    }
    if (!bindings.DODO_WEBHOOK_SECRET) {
        problems.push('DODO_WEBHOOK_SECRET missing - every payment webhook will be rejected 401, so no commission can ever be recorded.');
    }
    for (const [table, state] of Object.entries(tables)) {
        if (state !== 'ok') problems.push(`${table}: ${state}`);
    }

    return json({ ok: problems.length === 0, bindings, tables, problems });
}

// ---------------------------------------------------------------------------
// GET /r/:code - log the click, then send them to the site with ?ref= attached
// ---------------------------------------------------------------------------
async function handleClick(url, request, env) {
    const code = normaliseCode(url.pathname.slice(3));
    const dest = new URL(SITE);

    if (code) {
        dest.searchParams.set('ref', code);
        // Hashed with a server-side salt so the row cannot be reversed into an
        // address, but two clicks from one machine still collapse together.
        const ip = request.headers.get('CF-Connecting-IP') || '';
        await sb(env, 'referral_clicks', {
            method: 'POST',
            body: [{
                code,
                ip_hash: ip ? await sha256(ip + (env.CLICK_SALT || '')) : null,
                referrer: (request.headers.get('Referer') || '').slice(0, 300) || null,
                country: request.headers.get('CF-IPCountry') || null
            }]
        }).catch(e => console.error('click log failed', e));
    }

    return Response.redirect(dest.toString(), 302);
}

// ---------------------------------------------------------------------------
// POST /me - the partner dashboard payload
// ---------------------------------------------------------------------------
async function handleMe(env, userId) {
    let partner = await getPartner(env, userId);
    if (!partner) partner = await createPartner(env, userId);
    if (!partner) return json({ error: 'Could not create a referral code' }, 500);

    const [commissions, attributions, clicks] = await Promise.all([
        sbSelect(env, 'referral_commissions',
            `partner_user_id=eq.${enc(userId)}&select=status,commission_amount,currency,created_at,referred_user_id`),
        sbSelect(env, 'referral_attributions',
            `partner_user_id=eq.${enc(userId)}&select=referred_user_id`),
        sbSelect(env, 'referral_clicks',
            `code=eq.${enc(partner.code)}&select=id`)
    ]);

    const sum = statuses => commissions
        .filter(c => statuses.includes(c.status))
        .reduce((t, c) => t + Number(c.commission_amount || 0), 0);

    // "Owed" deliberately excludes pending and review. Showing a number that
    // can still evaporate in a refund is how a referral program loses trust.
    const owed = sum(['approved']);

    return json({
        code: partner.code,
        link: `${SITE}?ref=${partner.code}`,
        share_link: `${SITE.replace('https://', 'https://ref.')}/r/${partner.code}`,
        payout_email: partner.payout_email || null,
        status: partner.status,
        rate: COMMISSION_RATE,
        cap_per_referred: COMMISSION_CAP_PER_REFERRED,
        hold_days: HOLD_DAYS,
        payout_minimum: PAYOUT_MINIMUM,
        stats: {
            clicks: clicks.length,
            signups: attributions.length,
            paying_customers: new Set(
                commissions.filter(c => c.status !== 'void').map(c => c.referred_user_id)
            ).size,
            pending: round2(sum(['pending'])),
            in_review: round2(sum(['review'])),
            owed: round2(owed),
            paid: round2(sum(['paid'])),
            payable_now: owed >= PAYOUT_MINIMUM
        }
    });
}

// ---------------------------------------------------------------------------
// POST /attribute - called once, at signup, with whatever ?ref= was captured
// ---------------------------------------------------------------------------
async function handleAttribute(env, userId, body) {
    const code = normaliseCode(body.code);
    if (!code) return json({ error: 'No referral code' }, 400);

    // First touch wins and is never overwritten. Someone who signs up under
    // one link and later clicks another does not move between partners.
    const existing = await sbSelect(env, 'referral_attributions',
        `referred_user_id=eq.${enc(userId)}&select=code`);
    if (existing.length) return json({ ok: true, already: true, code: existing[0].code });

    const partners = await sbSelect(env, 'referral_partners',
        `code=eq.${enc(code)}&select=user_id,status`);
    if (!partners.length) return json({ ok: false, reason: 'unknown_code' });
    const partner = partners[0];

    // Self-referral. The CHECK constraint would also reject this; catching it
    // here gives a clean answer instead of a 400 from Postgres.
    if (partner.user_id === userId) return json({ ok: false, reason: 'self_referral' });
    if (partner.status !== 'active') return json({ ok: false, reason: 'partner_blocked' });

    // Same-domain signups are the common shape of someone referring their own
    // second account. Recorded, not refused - a real colleague at the same
    // company is the single most likely genuine referral there is. It only
    // means the commission waits for a human.
    const [partnerEmail, referredEmail] = await Promise.all([
        getUserEmail(env, partner.user_id),
        getUserEmail(env, userId)
    ]);
    const flagged = sameDomain(partnerEmail, referredEmail) ? 'same_email_domain' : null;

    await sb(env, 'referral_attributions', {
        method: 'POST',
        body: [{
            referred_user_id: userId,
            partner_user_id: partner.user_id,
            code,
            referred_email: referredEmail || null,
            flagged_reason: flagged
        }],
        // A double-submitted signup form must not 409 the user.
        headers: { Prefer: 'resolution=ignore-duplicates' }
    });

    return json({ ok: true, code });
}

// ---------------------------------------------------------------------------
// POST /payout - where the partner wants the money
// ---------------------------------------------------------------------------
async function handlePayout(env, userId, body) {
    const email = String(body.payout_email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: 'That does not look like an email address' }, 400);
    }
    if (!await getPartner(env, userId)) await createPartner(env, userId);

    await sb(env, 'referral_partners', {
        method: 'PATCH',
        query: `user_id=eq.${enc(userId)}`,
        body: { payout_email: email }
    });
    return json({ ok: true, payout_email: email });
}

// ===========================================================================
// The webhook. The only thing in this file that can create money.
// ===========================================================================
//
// Signature verification is duplicated from workers/dodo-webhook rather than
// shared: that worker is a PostHog bridge and this one moves money. Keeping
// them independent means a change to either cannot silently weaken the other,
// and Dodo is happy to deliver the same event to two endpoints.
const PAYING_EVENTS = new Set([
    'payment.succeeded',
    'subscription.active',
    'subscription.renewed'
]);
// These are Dodo's actual event names, taken from the dashboard's own list -
// not guessed. The first version of this file had 'payment.refunded',
// 'payment.reversed' and 'dispute.created', none of which Dodo sends. An
// unrecognised event is acknowledged and ignored by design, so every refund
// and chargeback would have sailed past silently and left the commission
// standing: we would have kept paying out on money we gave back, with nothing
// in the logs to say so.
//
// payment.failed is deliberately NOT here. A commission is only ever written
// on a succeeded payment, so there is nothing for a failure to reverse, and
// treating it as a reversal would only add noise.
const REVERSING_EVENTS = new Set([
    'refund.succeeded',
    'dispute.opened',
    'payment.cancelled'
]);

async function handleDodoWebhook(request, env) {
    const rawBody = await request.text();

    const verified = await verifySignature(request, rawBody, env.DODO_WEBHOOK_SECRET);
    if (!verified.ok) return json({ error: verified.reason }, 401);

    let payload;
    try { payload = JSON.parse(rawBody); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }

    const type = payload?.type || payload?.event_type;
    const data = payload?.data || {};

    // Acknowledge everything we do not act on, or Dodo retries it forever.
    if (REVERSING_EVENTS.has(type)) return voidCommission(env, data, type);
    if (!PAYING_EVENTS.has(type))   return json({ ok: true, ignored: type || 'unknown' });

    const paymentId = data.payment_id || data.subscription_id;
    if (!paymentId) return json({ ok: true, warning: 'no payment id' });

    // Resolve the payer. Metadata first when the checkout worker happens to
    // send it; email otherwise, which is always present and needs no change to
    // a worker we cannot edit from here.
    const payerId = data?.metadata?.user_token
        || await userIdByEmail(env, data?.customer?.email);
    if (!payerId) return json({ ok: true, warning: 'payer not resolved' });

    const attributions = await sbSelect(env, 'referral_attributions',
        `referred_user_id=eq.${enc(payerId)}&select=partner_user_id,flagged_reason`);
    if (!attributions.length) return json({ ok: true, no_referrer: true });
    const { partner_user_id, flagged_reason } = attributions[0];

    const partners = await sbSelect(env, 'referral_partners',
        `user_id=eq.${enc(partner_user_id)}&select=status`);
    if (!partners.length || partners[0].status !== 'active') {
        return json({ ok: true, partner_inactive: true });
    }

    // Dodo reports money in the currency's minor unit.
    const gross = typeof data.total_amount === 'number' ? data.total_amount / 100 : 0;
    if (gross <= 0) return json({ ok: true, warning: 'zero amount' });

    // Apply the per-referred-customer cap. Voided commissions do not count
    // towards it - money we clawed back should not eat someone's allowance.
    let prior;
    try {
        prior = await sbSelect(env, 'referral_commissions',
            `referred_user_id=eq.${enc(payerId)}&status=neq.void&select=commission_amount`);
    } catch (e) {
        // Failing open here would mean paying past the cap. Better to leave
        // the payment unrecorded and let a retry pick it up.
        return json({ ok: false, error: 'could not read prior commissions' }, 500);
    }
    const already = prior.reduce((t, c) => t + Number(c.commission_amount || 0), 0);
    const remaining = round2(COMMISSION_CAP_PER_REFERRED - already);
    if (remaining <= 0) {
        return json({ ok: true, capped: true, referred_user_id: payerId });
    }
    const amount = Math.min(round2(gross * COMMISSION_RATE), remaining);

    const inserted = await sb(env, 'referral_commissions', {
        method: 'POST',
        body: [{
            partner_user_id,
            referred_user_id: payerId,
            dodo_payment_id: paymentId,
            dodo_subscription_id: data.subscription_id || null,
            dodo_event_type: type,
            gross_amount: round2(gross),
            currency: data.currency || 'USD',
            rate: COMMISSION_RATE,
            commission_amount: amount,
            // A flagged attribution never auto-approves, however long it sits.
            status: flagged_reason ? 'review' : 'pending'
        }],
        // The unique index on dodo_payment_id is the real guard; this stops a
        // retry coming back as an error Dodo would keep retrying.
        headers: { Prefer: 'resolution=ignore-duplicates' }
    });

    return json({ ok: true, recorded: !!inserted });
}

// A refund or chargeback must claw the commission back. Voiding rather than
// deleting keeps the row visible in the partner's history.
async function voidCommission(env, data, type) {
    const paymentId = data.payment_id || data.subscription_id;
    if (!paymentId) return json({ ok: true, warning: 'no payment id' });
    await sb(env, 'referral_commissions', {
        method: 'PATCH',
        query: `dodo_payment_id=eq.${enc(paymentId)}&status=in.(pending,approved,review)`,
        body: { status: 'void' }
    });
    return json({ ok: true, voided: paymentId, reason: type });
}

// Pending -> approved, once the refund window has passed. Runs on a cron
// rather than being computed at read time so that "owed" is a stored fact with
// a timestamp, not something that silently changes as the clock moves.
async function approveMaturedCommissions(env) {
    const cutoff = new Date(Date.now() - HOLD_DAYS * 86400000).toISOString();
    try {
        const updated = await sb(env, 'referral_commissions', {
            method: 'PATCH',
            query: `status=eq.pending&created_at=lt.${enc(cutoff)}`,
            body: { status: 'approved', approved_at: new Date().toISOString() },
            headers: { Prefer: 'return=representation' }
        });
        console.log(`approved ${Array.isArray(updated) ? updated.length : 0} commissions`);
    } catch (e) {
        console.error('approval sweep failed', e);
    }
}

// ===========================================================================
// Helpers
// ===========================================================================

async function getPartner(env, userId) {
    const rows = await sbSelect(env, 'referral_partners',
        `user_id=eq.${enc(userId)}&select=user_id,code,payout_email,status`);
    return rows[0] || null;
}

// Codes are generated, not chosen: a user-picked code invites impersonation of
// the brand, and a sequential one lets anyone enumerate partners.
async function createPartner(env, userId) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const res = await sb(env, 'referral_partners', {
            method: 'POST',
            body: [{ user_id: userId, code }],
            headers: { Prefer: 'return=representation' }
        });
        if (Array.isArray(res) && res.length) return res[0];
        // Either the code collided or the partner already exists; both are
        // resolved by reading back.
        const existing = await getPartner(env, userId);
        if (existing) return existing;
    }
    return null;
}

function randomCode() {
    // No l/1/o/0 - these get read off a screen and typed into a browser.
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

function normaliseCode(raw) {
    const code = String(raw || '').trim().toLowerCase();
    return /^[a-z0-9]{6,24}$/.test(code) ? code : null;
}

function sameDomain(a, b) {
    const da = String(a || '').split('@')[1];
    const db = String(b || '').split('@')[1];
    if (!da || !db) return false;
    // Free providers say nothing about a shared employer.
    const free = new Set(['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','proton.me','protonmail.com']);
    if (free.has(da.toLowerCase())) return false;
    return da.toLowerCase() === db.toLowerCase();
}

async function resolveUser(env, token) {
    if (!token) return null;
    const rows = await sbSelect(env, 'linkfinderai_users', `token=eq.${enc(token)}&select=token&limit=1`);
    return rows.length ? String(token) : null;
}

async function getUserEmail(env, userId) {
    const rows = await sbSelect(env, 'linkfinderai_users', `token=eq.${enc(userId)}&select=email&limit=1`);
    return rows[0]?.email || null;
}

async function userIdByEmail(env, email) {
    if (!email) return null;
    const rows = await sbSelect(env, 'linkfinderai_users',
        `email=eq.${enc(String(email).trim().toLowerCase())}&select=token&limit=1`);
    return rows[0]?.token || null;
}

// --- Supabase REST -------------------------------------------------------
// The service role key bypasses RLS, which is exactly why these tables have it
// enabled with no policies: this worker is the only way in.
function sbHeaders(env, extra) {
    return {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(extra || {})
    };
}

async function sbSelect(env, table, query) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
        headers: sbHeaders(env)
    });
    if (!res.ok) throw new Error(`${table} select ${res.status}`);
    return res.json();
}

async function sb(env, table, { method, body, query, headers }) {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
    const res = await fetch(url, {
        method,
        headers: sbHeaders(env, headers),
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${table} ${method} ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// --- Standard Webhooks signature verification ----------------------------
async function verifySignature(request, rawBody, secret) {
    if (!secret) return { ok: false, reason: 'server missing DODO_WEBHOOK_SECRET' };

    const id = request.headers.get('webhook-id');
    const timestamp = request.headers.get('webhook-timestamp');
    const signatureHeader = request.headers.get('webhook-signature');
    if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing signature headers' };

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) return { ok: false, reason: 'timestamp outside tolerance' };

    const secretBytes = base64ToBytes(secret.startsWith('whsec_') ? secret.slice(6) : secret);
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
    const expected = bytesToBase64(new Uint8Array(mac));

    const provided = signatureHeader.split(' ').map(part => {
        const comma = part.indexOf(',');
        return comma === -1 ? part : part.slice(comma + 1);
    });
    for (const candidate of provided) if (timingSafeEqual(candidate, expected)) return { ok: true };
    return { ok: false, reason: 'signature mismatch' };
}

function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
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

async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

const enc = v => encodeURIComponent(String(v));
const round2 = n => Math.round(Number(n) * 100) / 100;

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function cors(res, origin) {
    const allowed = ['https://linkfinderai.com', 'https://www.linkfinderai.com'];
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : allowed[0]);
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    return new Response(res.body, { status: res.status, headers });
}
