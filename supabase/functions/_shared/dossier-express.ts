// Code commun aux Edge Functions de Dossier Express (create-order, dodo-webhook, client-order).
//
// Secrets (Supabase → Edge Functions → Secrets), jamais dans ce dépôt public :
//   DODO_WEBHOOK_SECRET   whsec_… (Dodo → Développeur → Webhooks)
//   DODO_PRODUCT_DP       id du produit « Déclaration préalable – Dossier Express » (pdt_…)
//   DODO_PRODUCT_PC       id du produit « Permis de construire – Dossier Express » (pdt_…)
//   ADMIN_EMAIL           votre adresse : notifications de commande et de fichier
//   N8N_EMAIL_WEBHOOK     webhook n8n « Dossier Express – emails » : envoie l'email avec le compte SMTP
//                         de n8n (support@linkfinderai.com). Pas de Resend.
// Seul DODO_WEBHOOK_SECRET doit être un secret Supabase. Les autres réglages (ids produits, adresses,
// mode de paiement, webhook n8n) peuvent aussi vivre dans la table privée `dossier_settings`
// (RLS active, aucun accès anon) : un secret Supabase du même nom l'emporte toujours.
// Facultatifs :
//   DODO_CHECKOUT_BASE    https://checkout.dodopayments.com/buy/ (test : https://test.checkout.dodopayments.com/buy/)
//   SITE_URL              https://linkfinderai.com
//   CALL_URL              lien Calendly 15 min
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

let SETTINGS: Record<string, string> = {};

export const env = (k: string, fallback = ''): string => Deno.env.get(k) || SETTINGS[k] || fallback;

export let SITE_URL = 'https://linkfinderai.com';
export let CALL_URL = 'https://calendly.com/hamoureliasse/offre-linkfinder-ai-outbound/';

// À appeler au début de chaque requête : lit `dossier_settings` (clé service, la RLS bloque le reste).
export async function loadSettings(): Promise<void> {
    try {
        const { data, error } = await admin().from('dossier_settings').select('key, value');
        if (error) console.error('dossier_settings illisible', error.message);
        SETTINGS = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    } catch (e) {
        console.error('dossier_settings illisible', e);
    }
    SITE_URL = env('SITE_URL', 'https://linkfinderai.com').replace(/\/$/, '');
    CALL_URL = env('CALL_URL', 'https://calendly.com/hamoureliasse/offre-linkfinder-ai-outbound/');
}
export const DELAI = "moins d'une semaine après réception de toutes les informations";
export const BUCKET = 'dossiers';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

export type TypeDossier = 'dp' | 'pc' | 'a_determiner';

// « Je ne sais pas » est facturé comme une déclaration préalable ; le complément
// d'un permis éventuel est facturé à la main.
// Prix HT (14 nov. 2026) : 249 € / 790 €. Offre « 10 minutes » : -30 % sur le premier dossier
// (174 € / 553 €), via des produits Dodo dédiés pour qu'aucun code ne soit à saisir.
export const TYPES: Record<TypeDossier, { label: string; cents: number; offerCents: number; product: () => string; offerProduct: () => string }> = {
    dp: { label: 'Déclaration préalable', cents: 24900, offerCents: 17400, product: () => env('DODO_PRODUCT_DP'), offerProduct: () => env('DODO_PRODUCT_DP_OFFRE') },
    pc: { label: 'Permis de construire (maison individuelle)', cents: 79000, offerCents: 55300, product: () => env('DODO_PRODUCT_PC'), offerProduct: () => env('DODO_PRODUCT_PC_OFFRE') },
    a_determiner: { label: 'À déterminer (facturé comme une déclaration préalable)', cents: 24900, offerCents: 17400, product: () => env('DODO_PRODUCT_DP'), offerProduct: () => env('DODO_PRODUCT_DP_OFFRE') },
};

export const OFFER_MINUTES = 10;

// Offre accordée une fois par email, à quelqu'un qui n'a jamais payé, pendant OFFER_MINUTES
// à partir du premier passage au dernier écran (horodaté ici, pas dans le navigateur).
export async function offerStatus(db: SupabaseClient, email: string, start = false, graceSeconds = 0):
    Promise<{ eligible: boolean; active: boolean; expires_at: string | null }> {
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true })
        .eq('contact_email', email).not('status', 'in', '(en_attente_paiement,annulee)');
    if ((count ?? 0) > 0) return { eligible: false, active: false, expires_at: null };
    let { data: c } = await db.from('dossier_clients').select('offer_started_at').eq('email', email).maybeSingle();
    if (start && !c?.offer_started_at) {
        const now = new Date().toISOString();
        await db.from('dossier_clients').upsert({ email, offer_started_at: now, updated_at: now }, { onConflict: 'email' });
        c = { offer_started_at: now };
    }
    if (!c?.offer_started_at) return { eligible: true, active: false, expires_at: null };
    const end = new Date(c.offer_started_at).getTime() + OFFER_MINUTES * 60_000;
    return { eligible: true, active: Date.now() <= end + graceSeconds * 1000, expires_at: new Date(end).toISOString() };
}

export const OUVRAGES: Record<string, string> = {
    veranda: 'Véranda', extension: 'Extension', pergola: 'Pergola', carport: 'Carport',
    abri_jardin: 'Abri de jardin', piscine: 'Piscine', solaire_toiture: 'Solaire en toiture',
    solaire_sol: 'Solaire au sol', menuiseries: 'Menuiseries', cloture: 'Clôture',
};

export const FILE_KINDS: Record<string, string> = {
    photo_facade: 'Photo de la façade concernée',
    photo_ensemble: "Photo de la vue d'ensemble",
    photo_rue: 'Photo de la vue depuis la rue',
    plan_ou_devis: 'Plan, croquis ou devis',
    complement: 'Document complémentaire',
};

export const REQUIRED_PHOTOS = ['photo_facade', 'photo_ensemble', 'photo_rue'];

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export function admin(): SupabaseClient {
    return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}

export function euros(cents: number): string {
    return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

export function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function randomToken(): string {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

export function safeName(name: string): string {
    const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-');
    return base.replace(/^-+|-+$/g, '').slice(-80) || 'fichier';
}

// Ce qui manque encore pour commencer le dossier.
export function missingItems(order: Record<string, unknown>, kinds: string[]): string[] {
    const out: string[] = [];
    for (const k of REQUIRED_PHOTOS) if (!kinds.includes(k)) out.push(FILE_KINDS[k]);
    if (order.type_dossier !== 'dp' && (order.surface_existante_m2 === null || order.surface_existante_m2 === undefined)) {
        out.push('Surface habitable actuelle de la maison (m²) : elle décide si un architecte est obligatoire');
    }
    if (order.type_ouvrage === 'piscine' && (order.piscine_abri_hauteur_m === null || order.piscine_abri_hauteur_m === undefined)) {
        out.push("Pour la piscine : hauteur de l'abri s'il y en a un (sinon, répondez « pas d'abri »)");
    }
    return out;
}

export function suiviUrl(token: string): string {
    return `${SITE_URL}/declaration-prealable/suivi?token=${token}`;
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
    const hook = env('N8N_EMAIL_WEBHOOK');
    if (!hook || !to) {
        console.error('email non envoyé : N8N_EMAIL_WEBHOOK ou destinataire manquant', { subject });
        return false;
    }
    try {
        const res = await fetch(hook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, html, text, from_name: 'Urbaa' }),
        });
        if (!res.ok) console.error('n8n a refusé l’email', res.status, await res.text());
        return res.ok;
    } catch (e) {
        console.error('échec envoi email', e);
        return false;
    }
}

export function emailShell(inner: string): string {
    return `<!doctype html><html lang="fr"><body style="margin:0;background:#f7f6f2;font:16px/1.55 -apple-system,'Segoe UI',Roboto,sans-serif;color:#1d1f1e">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="font-weight:700;font-size:18px;letter-spacing:-.02em;margin-bottom:16px">Urbaa</div>
<div style="background:#fff;border:1px solid #e3e1da;border-radius:12px;padding:20px">${inner}</div>
</div></body></html>`;
}

// Vérification de signature Standard Webhooks (spécification suivie par Dodo) :
// HMAC-SHA256 de `{webhook-id}.{webhook-timestamp}.{corps brut}`, encodé en base64,
// avec la partie base64 du secret `whsec_…`. L'en-tête peut contenir plusieurs
// signatures `v1,<sig>` séparées par des espaces (rotation de clé).
export async function verifyStandardWebhook(
    headers: Headers, rawBody: string, secret: string, nowSeconds = Date.now() / 1000,
): Promise<{ ok: boolean; reason?: string; id?: string }> {
    if (!secret) return { ok: false, reason: 'DODO_WEBHOOK_SECRET absent' };
    const id = headers.get('webhook-id');
    const ts = headers.get('webhook-timestamp');
    const sig = headers.get('webhook-signature');
    if (!id || !ts || !sig) return { ok: false, reason: 'en-têtes de signature absents' };
    const age = Math.abs(nowSeconds - Number(ts));
    if (!Number.isFinite(age) || age > 300) return { ok: false, reason: 'horodatage hors tolérance' };

    const keyBytes = Uint8Array.from(atob(secret.startsWith('whsec_') ? secret.slice(6) : secret), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`)));
    const expected = btoa(String.fromCharCode(...mac));

    for (const part of sig.split(' ')) {
        const candidate = part.includes(',') ? part.slice(part.indexOf(',') + 1) : part;
        if (timingSafeEqual(candidate, expected)) return { ok: true, id };
    }
    return { ok: false, reason: 'signature invalide' };
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
