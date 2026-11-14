// dossier-relances : relance par email les clients qui ont payé sans envoyer leurs photos.
//
// Appelée une fois par jour par pg_cron (job « dossier-relances-photos », 8 h UTC) avec l'en-tête
// x-cron-token = CRON_TOKEN (dossier_settings). Relances à J+1, J+3 et J+7 après le paiement,
// tant qu'il manque une des trois photos obligatoires. Déployer avec --no-verify-jwt.

import {
    admin, json, loadSettings, env, FILE_KINDS, REQUIRED_PHOTOS, TYPES, suiviUrl, sendEmail, emailShell, esc, CALL_URL, TypeDossier,
} from '../_shared/dossier-express.ts';

const DAYS = [1, 3, 7];

Deno.serve(async (req) => {
    await loadSettings();
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (!env('CRON_TOKEN') || req.headers.get('x-cron-token') !== env('CRON_TOKEN')) return json({ error: 'forbidden' }, 403);
    const db = admin();

    const { data: orders, error } = await db.from('orders')
        .select('id, type_dossier, contact_nom, contact_email, client_token, ville, adresse_chantier, paid_at, photo_reminders_sent')
        .in('status', ['payee', 'en_preparation']).not('paid_at', 'is', null).lt('photo_reminders_sent', DAYS.length);
    if (error) { console.error(error); return json({ error: 'db' }, 500); }

    const sent: string[] = [];
    for (const o of orders ?? []) {
        const due = new Date(o.paid_at).getTime() + DAYS[o.photo_reminders_sent] * 86_400_000;
        if (Date.now() < due) continue;
        const { data: files } = await db.from('order_files').select('kind').eq('order_id', o.id);
        const kinds = (files ?? []).map(f => f.kind);
        const missing = REQUIRED_PHOTOS.filter(k => !kinds.includes(k)).map(k => FILE_KINDS[k]);
        if (!missing.length) {
            await db.from('orders').update({ photo_reminders_sent: DAYS.length }).eq('id', o.id);
            continue;
        }
        const lien = suiviUrl(o.client_token);
        const label = TYPES[o.type_dossier as TypeDossier].label;
        const html = emailShell(`
<p>Bonjour ${esc(o.contact_nom)},</p>
<p>Pour commencer votre ${esc(label.toLowerCase())} (${esc(o.adresse_chantier)}, ${esc(o.ville)}), il nous manque encore :</p>
<ul>${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
<p>Une photo prise au téléphone suffit. Votre dossier arrive en moins d'une semaine dès qu'on les a.</p>
<p><a href="${esc(lien)}" style="display:inline-block;background:#0b0b0c;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Ajouter mes photos</a></p>
<p>Un souci pour les prendre ? <a href="${esc(CALL_URL)}">Réservez 15 minutes</a>, on trouve une solution.</p>`);
        const text = [`Bonjour ${o.contact_nom},`, '', `Pour commencer votre ${label.toLowerCase()} (${o.adresse_chantier}, ${o.ville}), il nous manque encore :`,
            ...missing.map(m => `- ${m}`), '', "Une photo prise au téléphone suffit. Votre dossier arrive en moins d'une semaine dès qu'on les a.", '',
            `Ajouter mes photos : ${lien}`, `Un souci ? Réservez 15 minutes : ${CALL_URL}`].join('\n');
        const ok = await sendEmail(o.contact_email, `Il nous manque vos photos – ${o.ville}`, html, text);
        if (ok) {
            await db.from('orders').update({ photo_reminders_sent: o.photo_reminders_sent + 1, last_photo_reminder_at: new Date().toISOString() }).eq('id', o.id);
            sent.push(o.id);
        }
    }
    return json({ ok: true, sent: sent.length });
});
