// company_name -> LinkedIn company page, as a Cloudflare Worker that n8n calls.
//
// Search only: n8n keeps its own credit charging and history logging, exactly
// like workers/enrich-name-to-linkedin in its n8n mode. Every request must carry
// X-Worker-Key = N8N_SHARED_SECRET, so the worker can't be used to borrow our
// Serper and Apify keys.
//
// Why (docs/find-rate.md, 7 Nov 2026): 77% found over 150 days, but the n8n
// branch takes Google's first result unchecked. In a sample of results whose
// URL doesn't match the name, about half are another company. Domains typed
// as the company found 2.9%.
//   1. Google, top 10, keep the first /company/ page whose name matches.
//   2. LinkedIn's own company search (Apify harvestapi/linkedin-company,
//      ~$0.003) on a miss, accepted only when the name or website matches.

export const MAX_CANDIDATES = 10;
export const APIFY_ACTOR = 'harvestapi~linkedin-company';

const LEGAL = new Set(['inc', 'incorporated', 'llc', 'ltd', 'limited', 'gmbh', 'mbh', 'corp', 'corporation', 'co', 'company',
    'sro', 'srl', 'spa', 'sas', 'sarl', 'sa', 'pvt', 'private', 'plc', 'ag', 'kg', 'bv', 'nv', 'oy', 'oyj', 'ab', 'as', 'asa',
    'pty', 'lp', 'llp', 'pllc', 'bhd', 'sdn', 'kft', 'zrt', 'sti', 'ltda', 'sl', 'se', 'the', 'holding', 'holdings']);
const COUNTRY = new Set(['us', 'usa', 'uk', 'gb', 'de', 'fr', 'it', 'es', 'nl', 'be', 'ch', 'at', 'pl', 'cz', 'hu', 'cn', 'jp', 'in']);

export function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

// "Nihon Yamamura Glass Co. Ltd" -> ['nihon', 'yamamura', 'glass'];
// "stripe.com" -> domain 'stripe.com', tokens ['stripe'].
export function parseCompany(raw) {
    const v = String(raw || '').trim();
    const dm = v.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dm) && !/\s/.test(v)) {
        const stem = dm.replace(/\.myshopify\.com$/, '').split('.')[0];
        return { domain: dm, tokens: [stem], raw: v };
    }
    const words = normalize(v).split(' ').filter(Boolean);
    const sig = words.filter((w, i) => !(i > 0 && (LEGAL.has(w) || COUNTRY.has(w))));
    return { domain: null, tokens: sig.length ? sig : words, raw: v };
}

// A page name matches when every significant word of the input is in it
// (a word may be a prefix: "intl" / "international" is not handled, on
// purpose - a wrong page is worse than a blank). Squashed forms count too:
// "3A Composites" matches "3acomposites", "MZA" matches "mza-demiryolu".
// Legal forms tie a company to a country. "Metatronix Srl" (Italy) and
// "Meta-Tronix Pvt Ltd" (India) squash to the same word; the forms say they
// are two companies. Only forms that clearly belong to one jurisdiction are
// listed; ltd/inc/llc/co travel too much to mean anything.
const FORM_COUNTRY = {
    srl: 'it-ro', spa: 'it', gmbh: 'de-at-ch', mbh: 'de-at-ch', ag: 'de-at-ch', kg: 'de-at', bv: 'nl', nv: 'nl-be',
    sas: 'fr', sarl: 'fr-lu', pvt: 'in', pty: 'au-za', oy: 'fi', oyj: 'fi', ab: 'se', asa: 'no', kft: 'hu', zrt: 'hu',
    sro: 'cz-sk', sti: 'tr', bhd: 'my', sdn: 'my', ltda: 'br-pt', plc: 'uk-ie'
};
function forms(words) { return [...new Set(words.map(w => FORM_COUNTRY[w]).filter(Boolean))]; }
export function formsConflict(inputRaw, pageName) {
    const a = forms(normalize(inputRaw).split(' ')), b = forms(normalize(pageName).split(' '));
    if (!a.length || !b.length) return false;
    const ca = new Set(a.join('-').split('-'));
    return !b.join('-').split('-').some(c => ca.has(c));
}

export function nameMatches(parsed, pageName, slug = '') {
    if (formsConflict(parsed.raw, pageName + ' ' + normalize(slug))) return false;
    const page = normalize(pageName).split(' ').filter(w => w && !LEGAL.has(w));
    const squashed = page.join('') + ' ' + normalize(slug).replace(/ /g, '');
    if (!parsed.tokens.length) return false;
    const joined = parsed.tokens.join('');
    if (joined.length >= 4 && squashed.includes(joined)) return true;
    return parsed.tokens.every(t => page.includes(t));
}

export function companySlug(link) {
    const m = String(link || '').match(/linkedin\.com\/company\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
}

// Google titles look like "Acme Corp | LinkedIn" or "Acme Corp - LinkedIn".
export function pickFromGoogle(parsed, organic) {
    for (const r of (organic || []).slice(0, MAX_CANDIDATES)) {
        const slug = companySlug(r && r.link);
        if (!slug) continue;
        const name = String(r.title || '').replace(/\s*[|\-–]\s*LinkedIn.*$/i, '');
        if (nameMatches(parsed, name, slug)) return { link: cleanUrl(r.link), source: 'google' };
    }
    return null;
}

export function pickFromLinkedInSearch(parsed, rows) {
    for (const r of rows || []) {
        if (!r || !companySlug(r.linkedinUrl)) continue;
        const site = String(r.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        if (parsed.domain ? site === parsed.domain : nameMatches(parsed, r.name, companySlug(r.linkedinUrl))) {
            return { link: cleanUrl(r.linkedinUrl), source: 'linkedin_search' };
        }
    }
    return null;
}

export function buildQueries(parsed) {
    if (parsed.domain) return [`"${parsed.domain}" site:linkedin.com/company`, `${parsed.tokens[0]} site:linkedin.com/company`];
    return [`${parsed.raw} site:linkedin.com/company`];   // what n8n sends today
}

function cleanUrl(u) {
    const slug = companySlug(u);
    return slug ? `https://www.linkedin.com/company/${encodeURIComponent(slug).replace(/%2D/gi, '-')}/` : u;
}

export function fromN8n(request, env) {
    const key = request.headers.get('X-Worker-Key') || '';
    return !!(env.N8N_SHARED_SECRET && key && key === env.N8N_SHARED_SECRET);
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default {
    async fetch(request, env) {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        if (!fromN8n(request, env)) return json({ error: 'Forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400); }
        const parsed = parseCompany(body.input_data || body.company_name || body.company);
        if (!parsed.tokens.length || !parsed.tokens[0]) return json({ result: '', status: 'success', source: 'none' });

        let best = null;
        try {
            for (const q of buildQueries(parsed)) {
                best = pickFromGoogle(parsed, await serper(env, q));
                if (best) break;
            }
        } catch (e) {
            return json({ error: 'Lookup provider unavailable', status: 'error' }, 502);
        }
        if (!best && env.APIFY_TOKEN) {
            try { best = pickFromLinkedInSearch(parsed, await linkedinCompanySearch(env, parsed)); }
            catch (e) { /* a failed fallback is a plain miss */ }
        }
        return json({ result: best ? best.link : '', status: 'success', source: best ? best.source : 'none' });
    }
};

async function serper(env, q) {
    const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num: MAX_CANDIDATES })
    });
    if (!res.ok) throw new Error(`serper ${res.status}`);
    return (await res.json()).organic || [];
}

async function linkedinCompanySearch(env, parsed) {
    const name = parsed.domain ? parsed.tokens[0] : parsed.tokens.join(' ');
    const res = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?timeout=25&maxTotalChargeUsd=0.02`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.APIFY_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ searches: [name] })
    });
    if (!res.ok) throw new Error(`apify ${res.status}`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
}
