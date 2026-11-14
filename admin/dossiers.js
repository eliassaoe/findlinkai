// Admin Urba. Connexion par mot de passe : l'Edge Function admin-dossiers vérifie le mot de passe
// (ADMIN_PASSWORD dans dossier_settings) et renvoie un jeton signé de 30 jours, gardé dans ce navigateur.
// Le navigateur n'a aucun accès direct aux tables : tout passe par la fonction (clé service côté serveur).
(function () {
    'use strict';
    const API = 'https://snxhsboboatjywgwdeds.supabase.co/functions/v1/admin-dossiers';
    const KEY = 'urbaa_admin_token';
    const $ = id => document.getElementById(id);

    const STATUS = {
        en_attente_paiement: 'Non payée', payee: 'Payée', en_preparation: 'En préparation',
        en_relecture: 'En relecture', livree: 'Livrée', deposee: 'Déposée', annulee: 'Annulée', remboursee: 'Remboursée',
    };
    const PILL = { payee: 'wait', en_preparation: 'wait', en_relecture: 'wait', livree: 'ok', deposee: 'ok', annulee: 'off', remboursee: 'off', en_attente_paiement: 'off' };
    const TYPES = { dp: 'Déclaration préalable', pc: 'Permis de construire', a_determiner: 'À déterminer (payé DP)' };
    const OUVRAGES = { veranda: 'Véranda', extension: 'Extension', pergola: 'Pergola', carport: 'Carport', abri_jardin: 'Abri de jardin',
        piscine: 'Piscine', solaire_toiture: 'Solaire en toiture', solaire_sol: 'Solaire au sol', menuiseries: 'Menuiseries', cloture: 'Clôture' };
    const KINDS = { photo_facade: 'Façade', photo_ensemble: "Vue d'ensemble", photo_rue: 'Vue depuis la rue', plan_ou_devis: 'Plan ou devis', complement: 'Complément' };
    const PHOTOS = ['photo_facade', 'photo_ensemble', 'photo_rue'];
    // Ordre et noms techniques attendus par l'outil creer_dossier (serveur MCP dossier-express).
    const FIELDS = ['type_dossier', 'entreprise', 'contact_nom', 'contact_email', 'contact_tel', 'nom_client_final',
        'adresse_chantier', 'code_postal', 'ville', 'type_ouvrage', 'surface_m2', 'hauteur_m', 'surface_existante_m2',
        'dimensions', 'distance_limites', 'materiaux', 'couleurs', 'description', 'terrain_modifie', 'piscine_abri_hauteur_m'];

    const euros = c => c == null ? '' : (c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
    const date = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const flash = msg => { const f = $('flash'); f.textContent = msg; f.hidden = false; setTimeout(() => { f.hidden = true; }, 3000); };
    const show = id => ['login', 'list', 'detail'].forEach(x => { $(x).hidden = x !== id; });
    let token = ''; try { token = localStorage.getItem(KEY) || ''; } catch (e) {}
    let orders = [], current = null;

    async function api(action, extra) {
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action, token }, extra || {})) });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && action !== 'login') { logout(); throw new Error('session'); }
        if (!res.ok) throw Object.assign(new Error(data.error || 'erreur'), { data, status: res.status });
        return data;
    }
    function logout() { token = ''; try { localStorage.removeItem(KEY); } catch (e) {} $('logout').hidden = true; show('login'); }

    Object.entries(STATUS).forEach(([k, v]) => { $('filter').add(new Option(v, k)); $('dStatus').add(new Option(v, k)); });

    $('loginForm').addEventListener('submit', async e => {
        e.preventDefault();
        $('loginMsg').textContent = '';
        try {
            const r = await api('login', { password: e.target.password.value });
            token = r.token; try { localStorage.setItem(KEY, token); } catch (x) {}
            e.target.reset(); start();
        } catch (err) {
            $('loginMsg').textContent = err.data && err.data.error === 'non_configure'
                ? "Le mot de passe admin n'est pas encore défini (ligne ADMIN_PASSWORD de dossier_settings)."
                : 'Mot de passe incorrect.';
        }
    });
    $('logout').addEventListener('click', logout);
    $('filter').addEventListener('change', renderList);
    $('back').addEventListener('click', e => { e.preventDefault(); location.hash = ''; });
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
        const c = b.dataset.tab === 'clients';
        $('ordersTbl').hidden = c; $('clientsTbl').hidden = !c; $('filter').hidden = c;
        if (c) loadClients();
    }));
    window.addEventListener('hashchange', route);

    async function start() {
        if (!token) return show('login');
        $('logout').hidden = false;
        try { await loadOrders(); route(); } catch (e) { if (e.message !== 'session') flash('Erreur de chargement.'); }
    }

    async function loadOrders() { orders = (await api('list')).orders; }

    function renderStats() {
        const paid = orders.filter(o => o.paid_at && !['annulee', 'remboursee'].includes(o.status));
        const todo = paid.filter(o => ['payee', 'en_preparation', 'en_relecture'].includes(o.status));
        const ca = paid.reduce((s, o) => s + (o.montant_ht_cents || 0), 0);
        const st = $('stats'); st.textContent = '';
        [[paid.length, 'Dossiers payés'], [todo.length, 'À traiter'], [euros(ca), 'Chiffre HT encaissé'],
            [orders.filter(o => o.status === 'en_attente_paiement').length, 'Formulaires non payés']].forEach(([v, l]) => {
            const d = document.createElement('div'); d.className = 'stat';
            const b = document.createElement('b'); b.textContent = v; const s = document.createElement('span'); s.textContent = l;
            d.append(b, s); st.appendChild(d);
        });
    }

    function renderList() {
        renderStats();
        const f = $('filter').value, tbody = $('rows');
        tbody.textContent = '';
        const rows = orders.filter(o => f ? o.status === f : o.status !== 'annulee');
        rows.forEach(o => {
            const tr = document.createElement('tr');
            const photos = PHOTOS.filter(k => o.file_kinds.includes(k)).length;
            const cells = [date(o.created_at), `${o.entreprise}\n${o.ville}`, TYPES[o.type_dossier], null, `${photos}/3`,
                `${euros(o.montant_ht_cents)} HT${o.offre_10min ? ' · offre' : ''}`];
            cells.forEach((v, i) => {
                const td = document.createElement('td');
                if (i === 3) { const p = document.createElement('span'); p.className = 'pill ' + (PILL[o.status] || ''); p.textContent = STATUS[o.status]; td.appendChild(p); }
                else { td.textContent = v; td.style.whiteSpace = 'pre-line'; }
                if (i === 4 && photos < 3) td.style.color = 'var(--amber)';
                tr.appendChild(td);
            });
            tr.addEventListener('click', () => { location.hash = o.id; });
            tbody.appendChild(tr);
        });
        if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.className = 'muted'; td.textContent = 'Aucun dossier pour le moment.'; tr.appendChild(td); tbody.appendChild(tr); }
    }

    async function loadClients() {
        const { clients } = await api('clients');
        const tbody = $('crows'); tbody.textContent = '';
        clients.forEach(c => {
            const tr = document.createElement('tr'); tr.style.cursor = 'default';
            [date(c.updated_at), c.email, c.nom, c.entreprise, c.tel, c.offer_started_at ? date(c.offer_started_at) : ''].forEach(v => {
                const td = document.createElement('td'); td.textContent = v || ''; tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        if (!clients.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.className = 'muted'; td.textContent = 'Aucun contact pour le moment.'; tr.appendChild(td); tbody.appendChild(tr); }
    }

    function kv(dl, rows) {
        dl.textContent = '';
        rows.forEach(([k, v, href]) => {
            const dt = document.createElement('dt'); dt.textContent = k;
            const dd = document.createElement('dd');
            if (href) { const a = document.createElement('a'); a.href = href; a.textContent = v; dd.appendChild(a); } else dd.textContent = v ?? '';
            dl.append(dt, dd);
        });
    }

    async function route() {
        const id = location.hash.slice(1);
        if (!id) { show('list'); renderList(); return; }
        show('detail');
        $('dTitle').textContent = 'Chargement…'; $('dFiles').textContent = '';
        let d;
        try { d = await api('get', { id }); } catch (e) { location.hash = ''; return; }
        current = d;
        const o = d.order;
        $('dTitle').textContent = `${o.entreprise} · ${o.ville}`;
        $('dSub').textContent = `${TYPES[o.type_dossier]} · ${OUVRAGES[o.type_ouvrage] || o.type_ouvrage} · créée le ${date(o.created_at)}`;
        $('dSuivi').href = d.suivi_url;
        $('dStatus').value = o.status;
        $('dNotes').value = o.admin_notes || '';
        kv($('dFields'), [
            ['Propriétaire', o.nom_client_final], ['Chantier', `${o.adresse_chantier}, ${o.code_postal} ${o.ville}`],
            ['Travaux', OUVRAGES[o.type_ouvrage] || o.type_ouvrage], ['Surface créée', `${o.surface_m2} m²`], ['Hauteur', `${o.hauteur_m} m`],
            ['Surface existante', o.surface_existante_m2 != null ? `${o.surface_existante_m2} m²` : 'non indiquée'],
            ['Dimensions', o.dimensions], ['Limites', o.distance_limites], ['Matériaux', o.materiaux], ['Couleurs', o.couleurs],
            ['Terrain modifié', o.terrain_modifie ? 'oui' : 'non'], ['Abri piscine', o.piscine_abri_hauteur_m != null ? `${o.piscine_abri_hauteur_m} m` : ''],
            ['Message', o.description || ''], ['Référence', o.id], ['Provenance', JSON.stringify(o.utm || {})],
        ]);
        kv($('dContact'), [
            ['Nom', o.contact_nom], ['Entreprise', o.entreprise], ['Email', o.contact_email, 'mailto:' + o.contact_email],
            ['Téléphone', o.contact_tel, 'tel:' + o.contact_tel],
            ['Paiement', o.paid_at ? `${euros(o.amount_paid_cents)} TTC le ${date(o.paid_at)}` : 'non payé'],
            ['Prix HT', `${euros(o.montant_ht_cents)}${o.offre_10min ? ' (offre 10 min)' : ''}`],
            ['Relances photos', String(o.photo_reminders_sent || 0)],
        ]);
        const box = $('dFiles');
        if (!d.files.length) { box.textContent = 'Aucun fichier.'; }
        d.files.forEach(f => {
            const a = document.createElement('a'); a.href = f.url || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
            if (/^image\/(jpeg|png|webp)/.test(f.content_type || '') && f.url) { const img = document.createElement('img'); img.src = f.url; img.alt = KINDS[f.kind] || f.kind; img.loading = 'lazy'; a.appendChild(img); }
            else { const doc = document.createElement('div'); doc.className = 'doc'; doc.textContent = '📄'; a.appendChild(doc); }
            a.appendChild(document.createTextNode(KINDS[f.kind] || f.kind));
            box.appendChild(a);
        });
        const missing = PHOTOS.filter(k => !d.files.some(f => f.kind === k));
        if (missing.length) { const p = document.createElement('p'); p.className = 'note'; p.style.gridColumn = '1/-1'; p.textContent = 'Manque : ' + missing.map(k => KINDS[k]).join(', ') + ' (relance automatique J+1, J+3, J+7).'; box.appendChild(p); }
    }

    $('save').addEventListener('click', async () => {
        try {
            await api('update', { id: current.order.id, status: $('dStatus').value, admin_notes: $('dNotes').value });
            current.order.status = $('dStatus').value;
            const o = orders.find(x => x.id === current.order.id); if (o) o.status = current.order.status;
            flash('Enregistré.');
        } catch (e) { flash("Échec de l'enregistrement."); }
    });

    $('copy').addEventListener('click', async () => {
        const o = current.order;
        const quoi = o.type_dossier === 'pc' ? 'un permis de construire de maison individuelle'
            : o.type_dossier === 'dp' ? 'une déclaration préalable'
            : 'un dossier de mairie dont le type est à déterminer (déclaration préalable ou permis ; payé comme une déclaration préalable)';
        const commande = FIELDS.map(k => `${k}: ${k === 'terrain_modifie' ? (o[k] ? 'oui' : 'non') : (o[k] ?? '')}`);
        const photos = current.files.map(f => `- ${f.kind} (${f.filename}) : ${f.url || 'lien indisponible'}`);
        const text = `Tu prépares ${quoi} avec les outils dossier-express.

1. Appelle creer_dossier avec la commande ci-dessous (convertis les champs aux noms attendus).
2. Lis la fiche. Si la procédure est A_VERIFIER, si l'architecte est obligatoire (plus de 150 m² au total), ou si elle ne correspond pas au type de dossier payé (DP payée mais PC nécessaire), arrête-toi et dis-le-moi avant d'aller plus loin.
3. Ouvre le règlement de la zone du PLU (lien dans la fiche) et liste les règles qui touchent ce projet : hauteur, implantation par rapport aux limites et à la voie, emprise, aspect, toitures, couleurs. Signale chaque point de non-conformité possible. Enregistre ce résumé dans regles_plu.md.
4. Rédige les champs du Cerfa (identité du demandeur = propriétaire, terrain, nature des travaux, surfaces) et enregistre-les dans cerfa_champs.md.
5. Rédige la notice des matériaux et couleurs et la description du projet, et enregistre-les dans notice.md.
6. Rédige un brief précis pour les plans (plan de masse coté, façades avant/après, coupe si besoin) et pour le photomontage à partir des photos, et enregistre-le dans brief_plans.md.
7. Liste ce qui manque ou paraît incohérent dans la commande, et écris l'email à envoyer à l'artisan pour le demander. Enregistre-le dans email_client.md.
8. Appelle preparer_pack_relecture et donne-moi le chemin du zip.

N'invente aucune information : si une donnée manque, écris « À COMPLÉTER » et ajoute-la à l'email client.

COMMANDE :
${commande.join('\n')}
reference: ${o.id}

PHOTOS ET FICHIERS (liens valables 7 jours) :
${photos.join('\n') || '- aucun'}
`;
        try { await navigator.clipboard.writeText(text); flash('Copié. Collez-le dans Claude.'); }
        catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); flash('Copié.'); }
    });

    start();
})();
