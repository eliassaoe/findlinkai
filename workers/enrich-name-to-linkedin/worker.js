// lead_full_name_to_linkedin_url — the highest-volume enrichment on the platform.
//
// 13,333 runs in 60 days, more than every other type combined, at a 55.7% fill
// rate. This is the n8n branch rewritten as a Worker, with the matching logic
// changed in four ways that should each recover some of the missing 44%.
//
// What the n8n version does today:
//
//     query   = `${input} site:linkedin.com/in`     (via Serper)
//     accept  = organic[0].title contains token[0]
//               AND organic[0].title contains token[1]
//
// Four problems with that, in descending order of how much they cost:
//
//  1. It only ever looks at organic[0]. If the right person is the second
//     result — which happens constantly for common names, or when a company
//     page outranks the profile — the answer is thrown away and the user is
//     told "not found". Every other flaw is smaller than this one.
//
//  2. It does not check that the link is a profile. organic[0] can be a
//     /company/, /posts/, /pulse/ or /jobs/ URL and still pass both title
//     checks, so a "hit" is sometimes a link the user cannot use.
//
//  3. Accents fail. "José" in the input never `contains`-matches "Jose" in a
//     LinkedIn title, or the reverse. Same for hyphens, apostrophes ("O'Brien")
//     and the middle dot some profiles use.
//
//  4. token[1] is assumed to be the surname. For "Jean Pierre Dupont Acme" it
//     is "Pierre", so the surname check runs against a middle name and fails.
//     (This is the same positional-parsing bug that puts
//     lead_full_name_to_email at a 1.6% fill rate.)
//
// The replacement scans several results, scores each against every name token
// rather than exactly two, normalises both sides before comparing, and refuses
// anything that is not a /in/ profile URL.
//
// Deliberately NOT changed: the upstream provider, the credit prices, and the
// response shape. This has to be swappable behind the existing n8n webhook one
// request at a time, so a difference in output would defeat the point.
//
// Deploy: see README.md in this directory.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const ALLOWED_ORIGINS = [
    'https://linkfinderai.com',
    'https://www.linkfinderai.com'
];

// Matches Code97 in the n8n workflow. A miss is charged at half, per the
// tiered not-found fee in Code24 (normal cost <= 5 -> half).
export const CREDIT_COST = 1;
export const CREDIT_COST_NOT_FOUND = 0.5;

// How many Serper results to consider. The n8n version looks at one. Ten is
// what Serper returns by default, so this costs no extra API call - the
// results were always in the response and were being discarded.
export const MAX_CANDIDATES = 10;

// A candidate must clear this to be returned. Tuned so that a first-name-only
// match is never enough on its own: given names are common and a wrong profile
// is worse than an honest "not found".
export const MIN_SCORE = 2;

// ---------------------------------------------------------------------------
// Pure helpers. Exported so worker.test.mjs can exercise them with no network.
// ---------------------------------------------------------------------------

// Strip diacritics, punctuation and case so "José O'Brien-Smith" and
// "Jose OBrien Smith" compare equal. NFD splits a letter from its accent and
// the range below removes the accent that is left behind.
export function normalize(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Split the raw input into name tokens and, where present, a company hint.
//
// The input is free text typed by a user or lifted from a CSV column, so its
// shape is not guaranteed. Rather than trusting positions, a token that looks
// like a domain or an email is treated as the company hint wherever it sits,
// and the leading run of name-shaped tokens becomes the name.
export function parseInput(raw) {
    const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean);

    let domain = null;
    const rest = [];
    for (const t of tokens) {
        const cleaned = t.replace(/[),.]+$/, '');
        if (domain === null && /@/.test(cleaned)) {
            domain = cleaned.split('@').pop().toLowerCase();
            continue;
        }
        // A dot alone is not enough: "J. Smith" and "Jr." are name tokens.
        if (domain === null && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(cleaned) && !/^[a-z]\.$/i.test(cleaned)) {
            domain = cleaned.toLowerCase();
            continue;
        }
        rest.push(cleaned);
    }

    // Everything up to the company hint is the name. With no hint, the first
    // two tokens are the name and anything after is treated as company words -
    // which is the same assumption n8n makes, but it is only used to enrich the
    // search query here, never to decide a match.
    const nameTokens = rest.slice(0, Math.max(2, Math.min(rest.length, 3)));
    const companyWords = rest.slice(nameTokens.length);

    return {
        nameTokens: nameTokens.map(normalize).filter(Boolean),
        companyWords: companyWords.map(normalize).filter(Boolean),
        domain,
        raw: tokens.join(' ')
    };
}

export function isProfileUrl(link) {
    return /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\/in\/[^/?#\s]+/i.test(String(link || ''));
}

// Score one Serper result against the parsed input.
//
// Every name token found in the title scores. The company hint scores too, but
// only as a tie-breaker - a profile whose headline omits the employer is still
// the right person. Position contributes a fraction of a point so that, all
// else equal, a higher-ranked result wins.
export function scoreCandidate(parsed, item, index = 0) {
    if (!isProfileUrl(item && item.link)) return 0;

    const title = normalize(item.title);
    const snippet = normalize(item.snippet);
    if (!title) return 0;

    const titleWords = new Set(title.split(' '));
    let score = 0;

    for (const tok of parsed.nameTokens) {
        if (!tok) continue;
        if (titleWords.has(tok)) {
            score += 1;
        } else if (tok.length === 1 && [...titleWords].some(w => w.startsWith(tok))) {
            // An initial in the input ("J Smith") against a full given name.
            score += 0.5;
        } else if (tok.length > 2 && title.includes(tok)) {
            // Substring hit: catches "smith" inside a hyphenated surname that
            // normalisation joined. Worth less than a whole-word match.
            score += 0.5;
        }
    }

    for (const w of parsed.companyWords) {
        if (w.length > 2 && (title.includes(w) || snippet.includes(w))) { score += 0.5; break; }
    }
    if (parsed.domain) {
        const brand = parsed.domain.split('.')[0];
        if (brand.length > 2 && (title.includes(brand) || snippet.includes(brand))) score += 0.5;
    }

    return score > 0 ? score + Math.max(0, (MAX_CANDIDATES - index)) / (MAX_CANDIDATES * 100) : 0;
}

export function pickBest(parsed, organic) {
    const list = Array.isArray(organic) ? organic.slice(0, MAX_CANDIDATES) : [];
    let best = null;
    list.forEach((item, i) => {
        const score = scoreCandidate(parsed, item, i);
        if (score >= MIN_SCORE && (!best || score > best.score)) {
            best = { link: String(item.link).split('?')[0], score };
        }
    });
    return best;
}

export function buildQuery(parsed) {
    const parts = [parsed.nameTokens.join(' ')];
    if (parsed.companyWords.length) parts.push(parsed.companyWords.join(' '));
    else if (parsed.domain) parts.push(parsed.domain.split('.')[0]);
    return `${parts.filter(Boolean).join(' ')} site:linkedin.com/in`;
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

// Read-then-write is racy under concurrent bulk runs, so the update is guarded
// on the credits value that was read. If another request moved it in between,
// the PATCH matches no row and we retry with fresh numbers rather than writing
// a figure derived from a stale read.
async function chargeCredits(env, token, amount) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const rows = await sb(env, `linkfinderai_users?token=eq.${encodeURIComponent(token)}&select=credits,protected_credits`);
        if (!rows.length) return { ok: false, reason: 'unknown_token' };

        const credits = Number(rows[0].credits) || 0;
        const protectedCredits = Number(rows[0].protected_credits) || 0;
        if (credits + protectedCredits < amount) return { ok: false, reason: 'insufficient_credits' };

        const fromCredits = Math.min(credits, amount);
        const fromProtected = amount - fromCredits;

        const updated = await sb(
            env,
            `linkfinderai_users?token=eq.${encodeURIComponent(token)}&credits=eq.${credits}&protected_credits=eq.${protectedCredits}&select=token`,
            { method: 'PATCH', body: JSON.stringify({ credits: credits - fromCredits, protected_credits: protectedCredits - fromProtected }) }
        );
        if (updated.length) return { ok: true, charged: amount };
    }
    return { ok: false, reason: 'contention' };
}

async function sb(env, path, init = {}) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            ...(init.headers || {})
        }
    });
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    return res.json();
}

// ---------------------------------------------------------------------------

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const cors = corsHeaders(origin);

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400, cors); }

        const token = body.user_token || body.token;
        const input = body.input_data;
        if (!token || String(token).length < 8) return json({ error: 'Missing or invalid token' }, 401, cors);
        if (!input || !String(input).trim()) return json({ error: 'Missing input_data' }, 400, cors);

        const parsed = parseInput(input);
        // Without at least one name token there is nothing to search for, and
        // nothing to charge for either. n8n would have spent a credit here.
        if (!parsed.nameTokens.length) {
            return json({ result: '', status: 'success', reason: 'no_name_in_input' }, 200, cors);
        }

        let organic = [];
        try {
            const res = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: buildQuery(parsed), num: MAX_CANDIDATES })
            });
            if (!res.ok) throw new Error(`serper ${res.status}`);
            organic = (await res.json()).organic || [];
        } catch (e) {
            // An upstream failure is ours, not the customer's: return an error
            // and charge nothing, rather than reporting a false "not found".
            return json({ error: 'Lookup provider unavailable', status: 'error' }, 502, cors);
        }

        const best = pickBest(parsed, organic);
        const charge = await chargeCredits(env, token, best ? CREDIT_COST : CREDIT_COST_NOT_FOUND);
        if (!charge.ok && charge.reason === 'insufficient_credits') {
            return json({ error: 'Insufficient credits', status: 'error' }, 402, cors);
        }

        return json({ result: best ? best.link : '', status: 'success' }, 200, cors);
    }
};

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin'
    };
}

function json(obj, status = 200, extra = {}) {
    return new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...extra } });
}
