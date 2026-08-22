/* Verifies that a user actually embedded the LinkFinder badge on their site,
   with a followed link, before any credits are paid out.

   This endpoint fetches a URL supplied by an untrusted user, which is a
   server-side request forgery vector in its plainest form. Everything in
   isSafeUrl() and the redirect loop exists for that reason: scheme allow-list,
   no IP literals, no localhost or internal suffixes, no credentials in the URL,
   and every redirect hop re-validated rather than trusted. The response is size
   capped and time capped so a hostile server cannot hold a worker open or feed
   it an unbounded body. */

const BADGE_HOST = 'linkfinderai.com';
const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const TTL_SECONDS = 60 * 60 * 24 * 365;

/* rel tokens that tell a crawler not to pass authority. Any of these on the
   anchor means the badge is present but not doing what the task pays for. */
const UNFOLLOWED = new Set(['nofollow', 'sponsored', 'ugc']);

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
        }
    });
}

function isIpLiteral(host) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;   // IPv4
    if (host.includes(':')) return true;                      // IPv6
    if (/^\d+$/.test(host)) return true;                      // decimal-encoded
    if (/^0x[0-9a-f]+$/i.test(host)) return true;             // hex-encoded
    return false;
}

function isSafeUrl(raw) {
    let u;
    try { u = new URL(raw); } catch (e) { return { ok: false, why: 'not_a_url' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, why: 'bad_scheme' };
    if (u.username || u.password) return { ok: false, why: 'credentials_in_url' };

    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || isIpLiteral(host)) return { ok: false, why: 'ip_not_allowed' };
    if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, why: 'local_not_allowed' };
    for (const suffix of ['.local', '.internal', '.lan', '.home.arpa']) {
        if (host.endsWith(suffix)) return { ok: false, why: 'internal_not_allowed' };
    }
    if (!host.includes('.')) return { ok: false, why: 'not_public' };
    /* Their own site, not ours - otherwise the task pays for a link we placed. */
    if (host === BADGE_HOST || host.endsWith('.' + BADGE_HOST)) return { ok: false, why: 'own_site' };
    return { ok: true, url: u };
}

/* Redirects are followed by hand so each hop passes isSafeUrl. `redirect:
   'follow'` would let a public URL bounce the worker somewhere private. */
async function fetchPage(startUrl) {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const safe = isSafeUrl(current);
        if (!safe.ok) return { ok: false, why: safe.why };

        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
        let resp;
        try {
            resp = await fetch(safe.url.toString(), {
                redirect: 'manual',
                signal: ctl.signal,
                headers: { 'User-Agent': 'LinkFinderBadgeCheck/1.0 (+https://linkfinderai.com)' }
            });
        } catch (e) {
            clearTimeout(timer);
            return { ok: false, why: e.name === 'AbortError' ? 'timeout' : 'unreachable' };
        }
        clearTimeout(timer);

        if (resp.status >= 300 && resp.status < 400) {
            const loc = resp.headers.get('location');
            if (!loc) return { ok: false, why: 'bad_redirect' };
            current = new URL(loc, safe.url).toString();
            continue;
        }
        if (!resp.ok) return { ok: false, why: 'http_' + resp.status };

        const type = (resp.headers.get('content-type') || '').toLowerCase();
        if (type && !type.includes('html')) return { ok: false, why: 'not_html' };

        /* Read with a hard cap rather than resp.text(), so an endless body
           cannot exhaust the worker. */
        const reader = resp.body && resp.body.getReader();
        if (!reader) return { ok: false, why: 'empty' };
        const chunks = [];
        let total = 0;
        while (total < MAX_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            chunks.push(value);
        }
        try { await reader.cancel(); } catch (e) {}
        const buf = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, total - at)), at); at += c.length; }
        return { ok: true, html: new TextDecoder('utf-8', { fatal: false }).decode(buf), finalUrl: current };
    }
    return { ok: false, why: 'too_many_redirects' };
}

/* Looks for an anchor pointing at linkfinderai.com that a crawler would follow.
   Returns why it failed rather than a bare false, so the user can be told
   whether the badge is missing or merely nofollowed - those need different
   fixes and "not verified" would be useless feedback for both. */
export function findFollowedBadge(html) {
    const anchors = html.match(/<a\b[^>]*>/gi) || [];
    let sawAny = false;
    for (const tag of anchors) {
        const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
        if (!href) continue;
        let host;
        try { host = new URL(href, 'https://example.invalid').hostname.toLowerCase(); }
        catch (e) { continue; }
        if (host !== BADGE_HOST && !host.endsWith('.' + BADGE_HOST)) continue;
        sawAny = true;
        const rel = ((tag.match(/\brel\s*=\s*["']([^"']*)["']/i) || [])[1] || '').toLowerCase();
        const tokens = rel.split(/\s+/).filter(Boolean);
        if (!tokens.some(t => UNFOLLOWED.has(t))) return { found: true };
    }
    return { found: false, why: sawAny ? 'link_is_nofollow' : 'no_link' };
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

        const body = await request.json().catch(() => ({}));
        const token = body.user_token;
        const siteUrl = body.site_url;

        if (typeof token !== 'string' || token.length < 8) return json({ error: 'sign_in_required' }, 401);

        const safe = isSafeUrl(siteUrl);
        if (!safe.ok) return json({ error: 'bad_url', detail: safe.why }, 400);

        /* One payout per account, and one per domain. Without the domain key a
           single site could be claimed from several accounts. */
        const domain = safe.url.hostname.toLowerCase().replace(/^www\./, '');
        if (await env.BADGES.get('badge:acct:' + token)) return json({ error: 'already_claimed' }, 409);
        if (await env.BADGES.get('badge:domain:' + domain)) return json({ error: 'domain_already_claimed' }, 409);

        const page = await fetchPage(safe.url.toString());
        if (!page.ok) return json({ verified: false, error: 'fetch_failed', detail: page.why }, 200);

        const hit = findFollowedBadge(page.html);
        if (!hit.found) return json({ verified: false, error: hit.why }, 200);

        const record = { domain, url: page.finalUrl, verified_at: new Date().toISOString() };
        await env.BADGES.put('badge:acct:' + token, JSON.stringify(record), { expirationTtl: TTL_SECONDS });
        await env.BADGES.put('badge:domain:' + domain, token, { expirationTtl: TTL_SECONDS });

        return json({ verified: true, domain });
    }
};
