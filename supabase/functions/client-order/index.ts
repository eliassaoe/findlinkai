// client-order : la page /declaration-prealable/suivi?token=… sans compte.
//
//   {action:'get', token}                               → son dossier, ses fichiers, ce qui manque
//   {action:'upload_url', token, kind, name, type, size} → URL d'envoi signée (bucket privé)
//   {action:'confirm_upload', token, path}               → enregistre le fichier, prévient l'admin
//
// Le jeton (64 caractères aléatoires) ne donne accès qu'à une seule commande.
// Déployer avec --no-verify-jwt.

import {
    admin, json, loadSettings, CORS, env, TYPES, OUVRAGES, FILE_KINDS, BUCKET, MAX_FILE_BYTES, ALLOWED_TYPES, SITE_URL, CALL_URL,
    DELAI, missingItems, safeName, sendEmail, emailShell, esc, TypeDossier,
} from '../_shared/dossier-express.ts';

const STATUS_LABEL: Record<string, string> = {
    en_attente_paiement: 'En attente de paiement',
    payee: 'Commande reçue',
    en_preparation: 'Dossier en préparation',
    en_relecture: 'En relecture par un professionnel',
    livree: 'Dossier livré',
    deposee: 'Déposé en mairie',
    annulee: 'Annulée',
    remboursee: 'Remboursée',
};

Deno.serve(async (req) => {
    await loadSettings();
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    let body: Record<string, any>;
    try { body = await req.json(); } catch { return json({ error: 'json' }, 400); }

    const token = typeof body.token === 'string' ? body.token : '';
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'not_found' }, 404);
    const db = admin();
    const { data: o } = await db.from('orders').select('*').eq('client_token', token).maybeSingle();
    if (!o) return json({ error: 'not_found' }, 404);

    if (body.action === 'get') {
        const { data: files } = await db.from('order_files').select('kind, filename, created_at').eq('order_id', o.id).order('created_at');
        return json({
            reference: o.id.slice(0, 8).toUpperCase(),
            status: o.status, status_label: STATUS_LABEL[o.status] ?? o.status,
            type_dossier: TYPES[o.type_dossier as TypeDossier].label,
            entreprise: o.entreprise,
            adresse: `${o.adresse_chantier}, ${o.code_postal} ${o.ville}`,
            type_ouvrage: OUVRAGES[o.type_ouvrage] ?? o.type_ouvrage,
            dimensions: `${o.dimensions} · surface ${o.surface_m2} m² · hauteur ${o.hauteur_m} m`,
            delai: DELAI,
            missing: missingItems(o, (files ?? []).map(f => f.kind)),
            files: (files ?? []).map(f => ({ kind: FILE_KINDS[f.kind] ?? f.kind, filename: f.filename, created_at: f.created_at })),
            call_url: CALL_URL,
        });
    }

    // Avis client (demandé par email à la livraison) : publié seulement après validation dans l'admin.
    if (body.action === 'review') {
        const note = Number(body.note);
        if (!(Number.isInteger(note) && note >= 1 && note <= 5)) return json({ error: 'note' }, 422);
        const commentaire = String(body.commentaire ?? '').trim().slice(0, 1500) || null;
        const { error } = await db.from('dossier_avis').upsert({
            order_id: o.id, note, commentaire, prenom: String(o.contact_nom).split(' ')[0], entreprise: o.entreprise, ville: o.ville,
        }, { onConflict: 'order_id' });
        if (error) { console.error(error); return json({ error: 'db' }, 500); }
        await sendEmail(env('ADMIN_EMAIL'), `Nouvel avis ${note}/5 – ${o.entreprise}`,
            emailShell(`<p><strong>${note}/5</strong> de ${esc(o.contact_nom)} (${esc(o.entreprise)}, ${esc(o.ville)})</p><p>${esc(commentaire ?? '')}</p><p><a href="${esc(SITE_URL)}/admin/dossiers#avis">Valider dans l'admin</a></p>`),
            `${note}/5 de ${o.contact_nom} (${o.entreprise}) : ${commentaire ?? ''}`);
        return json({ ok: true });
    }

    if (body.action === 'upload_url') {
        const kind = String(body.kind ?? '');
        const type = String(body.type ?? '');
        const size = Number(body.size);
        if (!(kind in FILE_KINDS)) return json({ error: 'kind' }, 422);
        if (!ALLOWED_TYPES.includes(type)) return json({ error: 'format' }, 422);
        if (!(size > 0 && size <= MAX_FILE_BYTES)) return json({ error: 'taille' }, 422);
        const { count } = await db.from('order_files').select('id', { count: 'exact', head: true }).eq('order_id', o.id);
        if ((count ?? 0) >= 40) return json({ error: 'trop_de_fichiers' }, 429);
        const path = `${o.id}/${kind}-s${Date.now()}-${safeName(String(body.name ?? 'fichier'))}`;
        const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error || !data) { console.error(error); return json({ error: 'storage' }, 500); }
        return json({ path, upload_token: data.token });
    }

    if (body.action === 'confirm_upload') {
        const path = String(body.path ?? '');
        if (!path.startsWith(`${o.id}/`) || path.includes('..')) return json({ error: 'path' }, 422);
        const name = path.slice(o.id.length + 1);
        const { data: objs } = await db.storage.from(BUCKET).list(o.id, { search: name, limit: 5 });
        const obj = (objs ?? []).find(x => x.name === name);
        if (!obj) return json({ error: 'fichier_absent' }, 404);
        const kind = name.split('-')[0];
        const filename = name.replace(/^[a-z_]+-s\d+-/, '');
        const { error } = await db.from('order_files').insert({
            order_id: o.id, kind, storage_path: path, filename,
            content_type: obj.metadata?.mimetype ?? null, size_bytes: obj.metadata?.size ?? null, uploaded_by: 'suivi_client',
        });
        if (error && error.code !== '23505') { console.error(error); return json({ error: 'db' }, 500); }
        if (!error) {
            const lien = `${SITE_URL}/admin/dossiers#${o.id}`;
            await sendEmail(env('ADMIN_EMAIL'), `Nouveau fichier – ${o.entreprise} – ${o.ville}`,
                emailShell(`<p>${esc(o.contact_nom)} a ajouté un fichier : <strong>${esc(FILE_KINDS[kind] ?? kind)}</strong> (${esc(filename)}).</p><p><a href="${esc(lien)}">Ouvrir le dossier dans l'admin</a></p>`),
                `${o.contact_nom} a ajouté un fichier : ${FILE_KINDS[kind] ?? kind} (${filename}).\nDossier : ${lien}`);
        }
        return json({ ok: true });
    }

    return json({ error: 'action' }, 400);
});
