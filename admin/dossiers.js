// Admin Dossier Express. Données lues avec la session Supabase de l'admin :
// la RLS (public.is_dossier_admin) ne laisse passer que l'adresse listée dans
// public.dossier_admins. Un autre compte connecté ne voit rien.
(function () {
    'use strict';

    const sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
        auth: { storageKey: 'dossier-express-admin', persistSession: true, detectSessionInUrl: true },
    });
    const $ = id => document.getElementById(id);

    const STATUS = {
        en_attente_paiement: 'En attente de paiement', payee: 'Payée', en_preparation: 'En préparation',
        en_relecture: 'En relecture', livree: 'Livrée', deposee: 'Déposée', annulee: 'Annulée', remboursee: 'Remboursée',
    };
    const TYPES = { dp: 'Déclaration préalable', pc: 'Permis de construire (maison individuelle)', a_determiner: 'À déterminer (payé comme une DP)' };
    const KINDS = {
        photo_facade: 'Façade concernée', photo_ensemble: "Vue d'ensemble", photo_rue: 'Vue depuis la rue',
        plan_ou_devis: 'Plan ou devis', complement: 'Complément',
    };
    // Ordre et noms techniques attendus par l'outil creer_dossier (serveur MCP dossier-express).
    const FIELDS = ['type_dossier', 'entreprise', 'contact_nom', 'contact_email', 'contact_tel', 'nom_client_final',
        'adresse_chantier', 'code_postal', 'ville', 'type_ouvrage', 'surface_m2', 'hauteur_m', 'surface_existante_m2',
        'dimensions', 'distance_limites', 'materiaux', 'couleurs', 'description', 'terrain_modifie', 'piscine_abri_hauteur_m'];

    const euros = c => c == null ? '' : (c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €';
    const flash = msg => { $('flash').textContent = msg; setTimeout(() => { if ($('flash').textContent === msg) $('flash').textContent = ''; }, 4000); };
    const show = id => ['login', 'list', 'detail', 'denied'].forEach(x => { $(x).hidden = x !== id; });

    let orders = [];
    let current = null;
    let currentFiles = [];

    Object.entries(STATUS).forEach(([k, v]) => {
        $('filter').add(new Option(v, k));
        $('dStatus').add(new Option(v, k));
    });

    $('loginForm').addEventListener('submit', async e => {
        e.preventDefault();
        const email = e.target.email.value.trim();
        const { error } = await sb.auth.signInWithOtp({
            email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + '/admin/dossiers' },
        });
        // Même message dans tous les cas : la page ne dit pas quelles adresses existent.
        $('loginMsg').textContent = error && error.status >= 500
            ? 'Erreur du service de connexion. Réessayez.'
            : "Si cette adresse a accès, un lien de connexion vient de lui être envoyé.";
    });

    $('logout').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; start(); });
    $('filter').addEventListener('change', renderList);
    $('back').addEventListener('click', e => { e.preventDefault(); location.hash = ''; });
    window.addEventListener('hashchange', route);

    async function start() {
        const { data: { session } } = await sb.auth.getSession();
        $('logout').hidden = !session;
        if (!session) return show('login');
        const { data: ok } = await sb.rpc('is_dossier_admin');
        if (!ok) return show('denied');
        await loadOrders();
        route();
    }

    async function loadOrders() {
        const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
        if (error) { console.error(error); orders = []; return; }
        orders = data;
    }

    function renderList() {
        const f = $('filter').value;
        const tbody = $('rows');
        tbody.textContent = '';
        orders.filter(o => !f || o.status === f).forEach(o => {
            const tr = document.createElement('tr');
            [new Date(o.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }), o.entreprise, o.ville,
                TYPES[o.type_dossier], STATUS[o.status], euros(o.amount_paid_cents ?? o.montant_ht_cents)]
                .forEach(v => { const td = document.createElement('td'); td.textContent = v ?? ''; tr.appendChild(td); });
            tr.addEventListener('click', () => { location.hash = o.id; });
            tbody.appendChild(tr);
        });
        if (!tbody.children.length) {
            const tr = document.createElement('tr'); const td = document.createElement('td');
            td.colSpan = 6; td.textContent = 'Aucun dossier.'; tr.appendChild(td); tbody.appendChild(tr);
        }
    }

    async function route() {
        const id = location.hash.slice(1);
        if (!id) { show('list'); renderList(); return; }
        current = orders.find(o => o.id === id);
        if (!current) { await loadOrders(); current = orders.find(o => o.id === id); }
        if (!current) { location.hash = ''; return; }
        show('detail');
        $('dTitle').textContent = `${current.entreprise} – ${current.ville}`;
        $('dStatus').value = current.status;
        $('dNotes').value = current.admin_notes || '';

        const dl = $('dFields'); dl.textContent = '';
        const rows = [
            ['Référence', current.id], ['Créée le', new Date(current.created_at).toLocaleString('fr-FR')],
            ['Payée le', current.paid_at ? new Date(current.paid_at).toLocaleString('fr-FR') : 'non payée'],
            ['Montant', `${euros(current.montant_ht_cents)} HT${current.amount_paid_cents ? ` · ${euros(current.amount_paid_cents)} encaissés` : ''}`],
            ['Paiement Dodo', current.dodo_payment_id || ''], ['Emails envoyés', current.emails_sent_at ? 'oui' : 'non'],
            ...FIELDS.map(k => [k, fmt(k, current[k])]),
            ['utm', JSON.stringify(current.utm || {})],
        ];
        rows.forEach(([k, v]) => {
            const dt = document.createElement('dt'); dt.textContent = k;
            const dd = document.createElement('dd'); dd.textContent = v ?? '';
            dl.append(dt, dd);
        });
        await loadFiles();
    }

    function fmt(k, v) {
        if (k === 'type_dossier') return TYPES[v] || v;
        if (k === 'terrain_modifie') return v ? 'oui' : 'non';
        return v ?? '';
    }

    async function loadFiles() {
        const box = $('dFiles'); box.textContent = 'Chargement…';
        const { data: files } = await sb.from('order_files').select('*').eq('order_id', current.id).order('created_at');
        currentFiles = files || [];
        box.textContent = '';
        if (!currentFiles.length) { box.textContent = 'Aucun fichier.'; return; }
        // Liens valables 7 jours : assez pour que Claude ou le relecteur les ouvre.
        const { data: signed } = await sb.storage.from('dossiers').createSignedUrls(currentFiles.map(f => f.storage_path), 7 * 24 * 3600);
        currentFiles.forEach((f, i) => {
            f.url = signed && signed[i] && signed[i].signedUrl;
            const a = document.createElement('a');
            a.href = f.url || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
            if (/^image\/(jpeg|png|webp)/.test(f.content_type || '') && f.url) {
                const img = document.createElement('img'); img.src = f.url; img.alt = KINDS[f.kind] || f.kind; img.loading = 'lazy';
                a.appendChild(img);
            }
            const s = document.createElement('span');
            s.textContent = `${KINDS[f.kind] || f.kind} · ${f.filename}`;
            a.appendChild(s);
            box.appendChild(a);
        });
    }

    $('save').addEventListener('click', async () => {
        const status = $('dStatus').value;
        const admin_notes = $('dNotes').value;
        const { error } = await sb.from('orders').update({ status, admin_notes }).eq('id', current.id);
        if (error) { flash('Échec de l’enregistrement : ' + error.message); return; }
        Object.assign(current, { status, admin_notes });
        flash('Enregistré.');
    });

    $('copy').addEventListener('click', async () => {
        const o = current;
        const quoi = o.type_dossier === 'pc' ? 'un permis de construire de maison individuelle'
            : o.type_dossier === 'dp' ? 'une déclaration préalable'
            : 'un dossier de mairie dont le type est à déterminer (déclaration préalable ou permis ; payé comme une déclaration préalable)';
        const commande = FIELDS.map(k => `${k}: ${k === 'terrain_modifie' ? (o[k] ? 'oui' : 'non') : (o[k] ?? '')}`);
        const photos = currentFiles.map(f => `- ${f.kind} (${f.filename}) : ${f.url || 'lien indisponible'}`);
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
        try { await navigator.clipboard.writeText(text); flash('Copié. Collez-le dans Claude Desktop.'); }
        catch (e) {
            const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
            document.execCommand('copy'); t.remove(); flash('Copié.');
        }
    });

    sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') start(); });
    start();
})();
