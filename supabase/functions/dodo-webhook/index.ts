// dodo-webhook : Dodo « payment.succeeded » → commande payée → emails client et admin.
//
// - Signature Standard Webhooks vérifiée (en-têtes webhook-id / -timestamp / -signature).
// - Le compte Dodo encaisse aussi les abonnements LinkFinder : tout paiement sans
//   metadata.source = 'dossier_express' est ignoré (réponse 200, rien n'est touché).
// - Sans doublon : chaque webhook-id n'est traité qu'une fois, et la commande ne
//   passe à « payee » que depuis « en_attente_paiement » (une seule mise à jour gagne,
//   donc un seul jeu d'emails), dodo_payment_id est unique.
//
// Déployer avec --no-verify-jwt : Dodo n'envoie pas de JWT Supabase, la sécurité
// est la signature.

import {
    admin, json, loadSettings, env, verifyStandardWebhook, TYPES, OUVRAGES, missingItems, suiviUrl, sendEmail, emailShell,
    esc, euros, SITE_URL, CALL_URL, DELAI, TypeDossier,
} from '../_shared/dossier-express.ts';

Deno.serve(async (req) => {
    await loadSettings();
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    // Comme ltd-webhook : 503 tant que le secret n'est pas posé, pour que Dodo
    // réessaie au lieu de perdre un paiement.
    if (!env('DODO_WEBHOOK_SECRET')) return json({ error: 'DODO_WEBHOOK_SECRET non configuré' }, 503);
    const raw = await req.text();
    const sig = await verifyStandardWebhook(req.headers, raw, env('DODO_WEBHOOK_SECRET'));
    if (!sig.ok) {
        console.warn('webhook refusé :', sig.reason);
        return json({ error: 'signature', reason: sig.reason }, 401);
    }

    let event: { type?: string; data?: Record<string, any> };
    try { event = JSON.parse(raw); } catch { return json({ error: 'json' }, 400); }
    const data = event.data ?? {};
    const db = admin();

    // Déjà vu ? (Dodo relivre tant qu'il n'a pas reçu de 2xx.)
    const { data: seen, error: seenErr } = await db.from('dodo_webhook_events').select('webhook_id').eq('webhook_id', sig.id!).maybeSingle();
    if (seenErr) { console.error(seenErr); return json({ error: 'db' }, 500); }  // 500 : Dodo réessaie
    if (seen) return json({ ok: true, duplicate: true });

    const record = async (outcome: string, orderId: string | null = null) => {
        await db.from('dodo_webhook_events').upsert({
            webhook_id: sig.id, event_type: event.type ?? null, payment_id: data.payment_id ?? null,
            order_id: orderId, outcome,
        }, { onConflict: 'webhook_id', ignoreDuplicates: true });
    };

    if (event.type !== 'payment.succeeded' || data.metadata?.source !== 'dossier_express') {
        return json({ ok: true, ignored: true });  // autre produit ou autre événement : rien à faire ici
    }

    const orderId = String(data.metadata?.order_id ?? '');
    const paymentId = String(data.payment_id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(orderId) || !paymentId) {
        await record('metadata_invalide');
        return json({ ok: true, warning: 'order_id ou payment_id absent' });
    }

    const { data: order, error: orderErr } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (orderErr) { console.error(orderErr); return json({ error: 'db' }, 500); }
    if (!order) {
        await record('commande_introuvable', null);
        await sendEmail(env('ADMIN_EMAIL'), 'Paiement Dossier Express sans commande', `<p>Paiement ${esc(paymentId)} reçu pour une commande introuvable (${esc(orderId)}). À vérifier dans Dodo.</p>`,
            `Paiement ${paymentId} reçu pour une commande introuvable (${orderId}). À vérifier dans Dodo.`);
        return json({ ok: true, warning: 'commande introuvable' });
    }

    // Contrôle : le produit payé correspond-il au type de dossier ?
    const expectedProduct = TYPES[order.type_dossier as TypeDossier].product();
    const paidProducts: string[] = (data.product_cart ?? []).map((p: { product_id?: string }) => p.product_id).filter(Boolean);
    const productOk = !expectedProduct || paidProducts.length === 0 || paidProducts.includes(expectedProduct);
    const alerte = productOk ? '' : `ATTENTION : produit payé (${paidProducts.join(', ')}) différent du produit attendu pour ce type de dossier.\n`;

    // Une seule mise à jour peut réussir : c'est elle qui envoie les emails.
    const { data: paid, error: paidErr } = await db.from('orders').update({
        status: 'payee', paid_at: new Date().toISOString(), dodo_payment_id: paymentId,
        amount_paid_cents: typeof data.total_amount === 'number' ? data.total_amount : null,
        currency: data.currency ?? null,
        admin_notes: alerte + (order.admin_notes ?? ''),
    }).eq('id', orderId).eq('status', 'en_attente_paiement').select('*').maybeSingle();
    if (paidErr) { console.error(paidErr); return json({ error: 'db' }, 500); }

    if (!paid) {
        await record('deja_payee', orderId);
        return json({ ok: true, duplicate: true });
    }

    const { data: files } = await db.from('order_files').select('kind').eq('order_id', orderId);
    const missing = missingItems(paid, (files ?? []).map(f => f.kind));
    const [clientOk, adminOk] = await Promise.all([emailClient(paid, missing), emailAdmin(paid, alerte)]);
    if (clientOk && adminOk) await db.from('orders').update({ emails_sent_at: new Date().toISOString() }).eq('id', orderId);
    await record(clientOk && adminOk ? 'payee' : 'payee_email_en_echec', orderId);
    return json({ ok: true });
});

function recap(o: Record<string, any>): [string, string][] {
    return [
        ['Type de dossier', TYPES[o.type_dossier as TypeDossier].label],
        ['Adresse du chantier', `${o.adresse_chantier}, ${o.code_postal} ${o.ville}`],
        ["Type d'ouvrage", OUVRAGES[o.type_ouvrage] ?? o.type_ouvrage],
        ['Dimensions', `${o.dimensions} · surface ${o.surface_m2} m² · hauteur ${o.hauteur_m} m`],
    ];
}

function emailClient(o: Record<string, any>, missing: string[]): Promise<boolean> {
    const lien = suiviUrl(o.client_token);
    const rows = recap(o);
    const manque = missing.length
        ? `<p><strong>Ce qu'il nous manque encore :</strong></p><ul>${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul><p>Ajoutez-le depuis votre lien de suivi ci-dessous.</p>`
        : '<p>Nous avons tout ce qu\'il faut pour commencer.</p>';
    const html = emailShell(`
<p>Bonjour ${esc(o.contact_nom)},</p>
<p>Votre commande est confirmée. Merci.</p>
<table style="border-collapse:collapse;width:100%;margin:12px 0">${rows.map(([k, v]) =>
        `<tr><td style="padding:6px 8px 6px 0;color:#5b605d;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('')}</table>
<p>Votre dossier arrive en <strong>${DELAI}</strong>. Satisfait ou remboursé pendant 40 jours.</p>
${manque}
<p><a href="${esc(lien)}" style="display:inline-block;background:#1f6f54;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600">Suivre mon dossier et ajouter des fichiers</a></p>
<p>Une question ? <a href="${esc(CALL_URL)}">Réservez 15 minutes</a>.</p>
<p style="background:#e8f2ed;border-radius:8px;padding:12px"><strong>Aucuns travaux ne doivent commencer avant l'accord de la mairie et l'affichage sur le terrain.</strong></p>
<p>Ce lien de suivi est personnel : ne le transférez pas.</p>`);
    const text = [
        `Bonjour ${o.contact_nom},`, '', 'Votre commande est confirmée. Merci.', '',
        ...rows.map(([k, v]) => `${k} : ${v}`), '',
        `Votre dossier arrive en ${DELAI}. Satisfait ou remboursé pendant 40 jours.`, '',
        ...(missing.length ? ["Ce qu'il nous manque encore :", ...missing.map(m => `- ${m}`), 'Ajoutez-le depuis votre lien de suivi.'] : ["Nous avons tout ce qu'il faut pour commencer."]),
        '', `Suivre mon dossier et ajouter des fichiers : ${lien}`,
        `Une question ? Réservez 15 minutes : ${CALL_URL}`, '',
        "Aucuns travaux ne doivent commencer avant l'accord de la mairie et l'affichage sur le terrain.", '',
        'Ce lien de suivi est personnel : ne le transférez pas.',
    ].join('\n');
    return sendEmail(o.contact_email, `Commande confirmée – ${TYPES[o.type_dossier as TypeDossier].label}`, html, text);
}

function emailAdmin(o: Record<string, any>, alerte: string): Promise<boolean> {
    const lien = `${SITE_URL}/admin/dossiers#${o.id}`;
    const montant = o.amount_paid_cents ? `${euros(o.amount_paid_cents)} TTC payés (${euros(o.montant_ht_cents)} HT)` : `${euros(o.montant_ht_cents)} HT`;
    const rows: [string, string][] = [
        ['Type de dossier', TYPES[o.type_dossier as TypeDossier].label],
        ['Contact', `${o.contact_nom} · ${o.contact_email}`],
        ['Téléphone', o.contact_tel],
        ['Adresse', `${o.adresse_chantier}, ${o.code_postal} ${o.ville}`],
        ['Montant', montant],
    ];
    const html = emailShell(`${alerte ? `<p style="color:#b42318"><strong>${esc(alerte)}</strong></p>` : ''}
<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) =>
        `<tr><td style="padding:6px 8px 6px 0;color:#5b605d">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('')}</table>
<p><a href="${esc(lien)}">Ouvrir le dossier dans l'admin</a></p>`);
    const text = [alerte, ...rows.map(([k, v]) => `${k} : ${v}`), '', `Dossier : ${lien}`].join('\n');
    return sendEmail(env('ADMIN_EMAIL'), `Nouvelle commande payée – ${o.entreprise} – ${o.ville}`, html, text);
}
