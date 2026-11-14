// admin-dossiers : la page /admin/dossiers, protégée par un mot de passe (pas de compte Supabase).
//
//   {action:'login', password}            → jeton de session signé, valable 30 jours
//   {action:'list', token}                → commandes (500 dernières) + photos reçues par commande
//   {action:'get', token, id}             → commande, fichiers avec liens signés 7 jours
//   {action:'update', token, id, status, admin_notes}
//   {action:'clients', token}             → fichier clients (dossier_clients), payeurs ou non
//
// ADMIN_PASSWORD : choisi par le gérant, saisi par lui dans dossier_settings (jamais dans le dépôt).
// ADMIN_SESSION_SECRET : aléatoire, dans dossier_settings ; le changer déconnecte tout le monde.
// Déployer avec --no-verify-jwt.

import { admin, json, loadSettings, CORS, env, BUCKET } from '../_shared/dossier-express.ts';

const STATUSES = ['en_attente_paiement', 'payee', 'en_preparation', 'en_relecture', 'livree', 'deposee', 'annulee', 'remboursee'];
const DAYS_30 = 30 * 86_400_000;

async function sign(msg: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env('ADMIN_SESSION_SECRET')),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
    return btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function same(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
}

async function validToken(t: unknown): Promise<boolean> {
    if (typeof t !== 'string' || !env('ADMIN_SESSION_SECRET')) return false;
    const [exp, sig] = t.split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    return same(sig, await sign('admin.' + exp));
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    await loadSettings();
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    let body: Record<string, any>;
    try { body = await req.json(); } catch { return json({ error: 'json' }, 400); }
    const db = admin();

    if (body.action === 'login') {
        const pw = env('ADMIN_PASSWORD');
        if (!pw || !env('ADMIN_SESSION_SECRET')) return json({ error: 'non_configure' }, 503);
        if (typeof body.password !== 'string' || !same(body.password, pw)) {
            await new Promise(r => setTimeout(r, 900));
            return json({ error: 'mot_de_passe' }, 401);
        }
        const exp = String(Date.now() + DAYS_30);
        return json({ token: `${exp}.${await sign('admin.' + exp)}` });
    }

    if (!(await validToken(body.token))) return json({ error: 'session' }, 401);

    if (body.action === 'list') {
        const { data: orders, error } = await db.from('orders')
            .select('id, created_at, status, type_dossier, entreprise, ville, code_postal, contact_nom, contact_email, contact_tel, montant_ht_cents, amount_paid_cents, offre_10min, paid_at, utm')
            .order('created_at', { ascending: false }).limit(500);
        if (error) { console.error(error); return json({ error: 'db' }, 500); }
        const ids = (orders ?? []).map(o => o.id);
        const { data: files } = ids.length ? await db.from('order_files').select('order_id, kind').in('order_id', ids) : { data: [] };
        const kinds: Record<string, string[]> = {};
        for (const f of files ?? []) (kinds[f.order_id] ??= []).push(f.kind);
        return json({ orders: (orders ?? []).map(o => ({ ...o, file_kinds: kinds[o.id] ?? [] })) });
    }

    if (body.action === 'get') {
        const { data: o } = await db.from('orders').select('*').eq('id', String(body.id ?? '')).maybeSingle();
        if (!o) return json({ error: 'not_found' }, 404);
        const { data: files } = await db.from('order_files').select('*').eq('order_id', o.id).order('created_at');
        const list = files ?? [];
        const { data: signed } = list.length
            ? await db.storage.from(BUCKET).createSignedUrls(list.map(f => f.storage_path), 7 * 86_400)
            : { data: [] };
        const { client_token: _t, ...order } = o;
        return json({
            order, suivi_url: `${env('SITE_URL', 'https://linkfinderai.com')}/declaration-prealable/suivi?token=${o.client_token}`,
            files: list.map((f, i) => ({ ...f, url: signed?.[i]?.signedUrl ?? null })),
        });
    }

    if (body.action === 'update') {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof body.status === 'string') {
            if (!STATUSES.includes(body.status)) return json({ error: 'status' }, 422);
            patch.status = body.status;
        }
        if (typeof body.admin_notes === 'string') patch.admin_notes = body.admin_notes.slice(0, 20000);
        const { error } = await db.from('orders').update(patch).eq('id', String(body.id ?? ''));
        if (error) { console.error(error); return json({ error: 'db' }, 500); }
        return json({ ok: true });
    }

    if (body.action === 'clients') {
        const { data, error } = await db.from('dossier_clients').select('*').order('updated_at', { ascending: false }).limit(1000);
        if (error) { console.error(error); return json({ error: 'db' }, 500); }
        return json({ clients: data ?? [] });
    }

    return json({ error: 'action' }, 400);
});
