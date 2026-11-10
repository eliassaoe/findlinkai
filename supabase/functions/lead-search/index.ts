// Lead search: criteria (search words, job titles, cities, seniority, company
// size) -> a list of LinkedIn profiles with full profile and email.
// docs/lead-search.md.
//
// Provider: harvestapi/linkedin-profile-search on Apify (no LinkedIn cookies).
// The Apify key lives in n8n, so this function reaches Apify through a small
// n8n proxy workflow ("LF · lead search proxy") that only allows the three
// calls below. Its URL and shared secret are in public.lead_finder_config,
// never in this public repo.
//
// Credits: the maximum is reserved up front (15 per requested lead), the run
// is billed 15 per lead with an email and 5 per lead without, and the rest is
// given back when the run finishes. A failed start gives everything back.
//
// Actions (POST JSON, auth = the app token):
//   start  {token, criteria}       -> {id, max_items, reserved}
//   status {token, id}             -> {status, leads?, charged?, refunded?}
//   list   {token}                 -> {runs: [...]}
//   start {kind:'urls'}            -> app input: profiles without email, 1 credit each
//   preview {criteria}             -> /liste-gratuite, no account: free, capped per IP and per day
//   preview_status {id}            -> poll an anonymous preview

import { buildInput, mapLead, hasEmail, maxUsdFor, KINDS, chargeFor } from './map.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = (path: string, init: RequestInit = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
            ...(init.headers ?? {}),
        },
    });

async function addCredits(token: string, amount: number): Promise<number | null> {
    if (!amount) return null;
    const r = await db('rpc/increment_user_credits', { method: 'POST', body: JSON.stringify({ p_token: token, p_amount: amount }) });
    if (!r.ok) throw new Error('credits ' + r.status);
    return await r.json();
}

let cfg: Record<string, string> | null = null;
let cfgAt = 0;
async function config() {
    if (cfg && Date.now() - cfgAt < 60_000) return cfg;
    cfgAt = Date.now();
    const r = await db('lead_finder_config?select=key,value');
    const rows = await r.json();
    cfg = Object.fromEntries((rows || []).map((x: any) => [x.key, x.value]));
    return cfg!;
}

async function proxy(body: Record<string, unknown>) {
    const c = await config();
    const r = await fetch(c.proxy_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lf-secret': c.proxy_secret },
        body: JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    if (!r.ok || !data || data.ok !== true) throw new Error(`proxy ${r.status}: ${text.slice(0, 200)}`);
    // The proxy answers {ok, data: [...]}: one item per Apify response object,
    // or one per dataset row for 'items'.
    return Array.isArray(data.data) ? data.data : [];
}

async function getUser(token: string) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(token || '')) return null;
    const r = await db(`linkfinderai_users?token=eq.${encodeURIComponent(token)}&select=token,credits&limit=1`);
    const rows = await r.json();
    return rows && rows[0] ? rows[0] : null;
}

async function patchRun(id: string, patch: Record<string, unknown>, where = '') {
    const r = await db(`lead_finder_runs?id=eq.${id}${where}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    return r.ok ? await r.json() : [];
}

function publicRun(r: any) {
    return {
        id: r.id, status: r.status, criteria: r.criteria, max_items: r.max_items,
        leads_count: r.leads_count, emails_count: r.emails_count,
        credits_charged: r.credits_charged, credits_reserved: r.credits_reserved,
        created_at: r.created_at, error: r.error,
    };
}

const PREVIEW_PER_IP_PER_DAY = 2;
const PREVIEW_PER_DAY = 60;

async function ipKey(req: Request) {
    const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lf-preview:' + ip));
    return 'anon:' + [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function countRuns(filter: string) {
    const r = await db(`lead_finder_runs?select=id&${filter}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
    const cr = r.headers.get('content-range') || '';
    return Number(cr.split('/')[1]) || 0;
}

async function start(token: string, criteria: any, kind = 'leads') {
    const K = (KINDS as any)[kind] || KINDS.leads;
    const anon = kind === 'preview';
    let user: any = null;
    if (!anon) {
        user = await getUser(token);
        if (!user) return json({ error: 'Sign in again: your session was not recognised.' }, 401);
    } else {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        if (await countRuns(`user_token=eq.${encodeURIComponent(token)}&created_at=gte.${since}`) >= PREVIEW_PER_IP_PER_DAY) {
            return json({ error: 'limit_ip' }, 429);
        }
        const day = new Date(); day.setUTCHours(0, 0, 0, 0);
        if (await countRuns(`user_token=like.anon:*&created_at=gte.${day.toISOString()}`) >= PREVIEW_PER_DAY) {
            return json({ error: 'limit_day' }, 429);
        }
    }
    const built = buildInput(criteria, K.withEmails, K.max);
    if ('error' in built) return json({ error: built.error }, 400);
    const { input, n } = built as { input: Record<string, unknown>; n: number };
    const reserve = n * K.reservePer;
    let left: number | null = null;
    if (reserve > 0) {
        const credits = Number(user.credits) || 0;
        if (credits < reserve) {
            return json({ error: 'insufficient_credits', credits, needed: reserve,
                max_affordable: Math.floor(credits / K.reservePer) }, 402);
        }
        left = await addCredits(token, -reserve);
        if (left == null || left < 0) {
            await addCredits(token, reserve);
            return json({ error: 'insufficient_credits', credits, needed: reserve }, 402);
        }
    }
    const ins = await db('lead_finder_runs', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_token: token, criteria: { ...criteria, _kind: kind }, max_items: n, credits_reserved: reserve, status: 'starting' }),
    });
    const row = (await ins.json())[0];
    try {
        const out = await proxy({ op: 'start', input, maxUsd: maxUsdFor(n) });
        const d = out[0] && out[0].data;
        if (!d || !d.id) throw new Error('no run id');
        await patchRun(row.id, { status: 'running', apify_run_id: d.id, dataset_id: d.defaultDatasetId });
    } catch (e) {
        if (reserve > 0) await addCredits(token, reserve);
        await patchRun(row.id, { status: 'failed', error: String(e).slice(0, 300), credits_charged: 0 });
        return json({ error: 'The search could not start. No credits were used.', id: row.id }, 502);
    }
    return json({ id: row.id, max_items: n, reserved: reserve, credits_left: left });
}

async function finalize(row: any, runStatus: string) {
    // Claim the run so two polls never bill it twice.
    const claimed = await patchRun(row.id, { status: 'finalizing' }, '&status=eq.running');
    if (!claimed.length) return null;
    let leads: any[] = [];
    try {
        const arr = await proxy({ op: 'items', datasetId: row.dataset_id, limit: row.max_items + 10 });
        const seen = new Set<string>();
        for (const it of arr) {
            const m = mapLead(it);
            if (!m) continue;
            const key = m.linkedin_url || m.full_name;
            if (seen.has(key)) continue;
            seen.add(key);
            leads.push(m);
            if (leads.length >= row.max_items) break;
        }
    } catch (e) {
        await addCredits(row.user_token, Number(row.credits_reserved));
        await patchRun(row.id, { status: 'failed', error: String(e).slice(0, 300), credits_charged: 0 });
        return { status: 'failed' };
    }
    const kind = (row.criteria && row.criteria._kind) || 'leads';
    const charged = Math.min(chargeFor(kind, leads), Number(row.credits_reserved));
    const refund = Number(row.credits_reserved) - charged;
    if (refund > 0) await addCredits(row.user_token, refund);
    const emails = leads.filter(hasEmail).length;
    await patchRun(row.id, {
        status: leads.length || runStatus === 'SUCCEEDED' ? 'done' : 'failed',
        leads, leads_count: leads.length, emails_count: emails, credits_charged: charged,
        error: runStatus === 'SUCCEEDED' ? null : `provider run ${runStatus}`,
    });
    if (String(row.user_token).startsWith('anon:')) return { status: 'done' };
    try {
        await db('enrichment_history', {
            method: 'POST',
            body: JSON.stringify({
                user_id: row.user_token, type: kind === 'urls' ? 'linkedin_search_to_linkedin_url' : 'linkedin_people_search', source: 'app',
                input: JSON.stringify(row.criteria).slice(0, 1000),
                result: JSON.stringify({ result: `${leads.length} leads, ${emails} emails`, status: 'success' }),
                credits_used: charged,
            }),
        });
    } catch { /* history is best effort */ }
    return { status: 'done' };
}

async function status(token: string, id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id || '')) return json({ error: 'bad id' }, 400);
    const r = await db(`lead_finder_runs?id=eq.${id}&user_token=eq.${encodeURIComponent(token)}&select=*`);
    let row = (await r.json())[0];
    if (!row) return json({ error: 'not found' }, 404);
    if (row.status === 'running') {
        try {
            const out = await proxy({ op: 'run', runId: row.apify_run_id });
            const d = out[0] && out[0].data;
            const st = d && d.status;
            if (st && !['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(st)) {
                await finalize(row, st);
                row = (await (await db(`lead_finder_runs?id=eq.${id}&select=*`)).json())[0];
            } else {
                return json({ ...publicRun(row), status: 'running', started: d && d.startedAt });
            }
        } catch (e) {
            return json({ ...publicRun(row), status: 'running', note: 'checking' });
        }
    }
    if (row.status === 'finalizing') return json({ ...publicRun(row), status: 'running' });
    return json({ ...publicRun(row), leads: row.status === 'done' ? row.leads || [] : [] });
}

async function list(token: string) {
    const user = await getUser(token);
    if (!user) return json({ error: 'Sign in again.' }, 401);
    // Settle searches left running when their tab was closed, so reserved
    // credits come back without the page having to stay open.
    const open = await (await db(`lead_finder_runs?user_token=eq.${encodeURIComponent(token)}&status=eq.running&select=id&limit=3`)).json();
    for (const o of open || []) { try { await status(token, o.id); } catch { /* next time */ } }
    const r = await db(`lead_finder_runs?user_token=eq.${encodeURIComponent(token)}&select=id,status,criteria,max_items,leads_count,emails_count,credits_charged,credits_reserved,created_at,error&order=created_at.desc&limit=20`);
    return json({ runs: await r.json(), credits: Number(user.credits) || 0 });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    let body: any = {};
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    const token = String(body.token || '');
    try {
        if (body.action === 'start') return await start(token, body.criteria || {}, body.kind === 'urls' ? 'urls' : 'leads');
        if (body.action === 'preview') return await start(await ipKey(req), body.criteria || {}, 'preview');
        if (body.action === 'preview_status') {
            const id = String(body.id || '');
            if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'bad id' }, 400);
            const r = await db(`lead_finder_runs?id=eq.${id}&user_token=like.anon:*&select=user_token`);
            const row = (await r.json())[0];
            if (!row) return json({ error: 'not found' }, 404);
            return await status(row.user_token, id);
        }
        if (body.action === 'status') return await status(token, String(body.id || ''));
        if (body.action === 'list') return await list(token);
        return json({ error: 'unknown action' }, 400);
    } catch (e) {
        return json({ error: 'Something went wrong. Try again in a minute.', detail: String(e).slice(0, 200) }, 500);
    }
});
