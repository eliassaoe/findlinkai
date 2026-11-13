-- Dossier Express : commandes de déclarations préalables / permis de construire.
--
-- Tout le trafic public passe par les Edge Functions create-order, dodo-webhook
-- et client-order (clé service_role). Le navigateur n'a AUCUN accès direct :
-- RLS activé, aucune politique pour anon. Seul l'admin (email listé dans
-- public.dossier_admins, connecté par lien magique) lit et met à jour.
--
-- `create table` sans `if not exists` exprès : si une table du même nom existe
-- déjà dans ce projet, la migration échoue au lieu de se greffer dessus.

create table public.orders (
    id                      uuid primary key default gen_random_uuid(),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    status                  text not null default 'en_attente_paiement'
                            check (status in ('en_attente_paiement', 'payee', 'en_preparation',
                                              'en_relecture', 'livree', 'deposee', 'annulee', 'remboursee')),
    type_dossier            text not null check (type_dossier in ('dp', 'pc', 'a_determiner')),
    montant_ht_cents        integer not null check (montant_ht_cents > 0),

    entreprise              text not null,
    contact_nom             text not null,
    contact_email           text not null,
    contact_tel             text not null,
    nom_client_final        text not null,
    adresse_chantier        text not null,
    code_postal             text not null,
    ville                   text not null,
    type_ouvrage            text not null check (type_ouvrage in ('veranda', 'extension', 'pergola', 'carport',
                                              'abri_jardin', 'piscine', 'solaire_toiture', 'solaire_sol',
                                              'menuiseries', 'cloture')),
    surface_m2              numeric(8,2) not null check (surface_m2 >= 0),
    hauteur_m               numeric(6,2) not null check (hauteur_m >= 0),
    surface_existante_m2    numeric(8,2) check (surface_existante_m2 >= 0),
    dimensions              text not null,
    distance_limites        text not null,
    materiaux               text not null,
    couleurs                text not null,
    description             text,
    terrain_modifie         boolean not null,
    piscine_abri_hauteur_m  numeric(6,2) check (piscine_abri_hauteur_m >= 0),

    client_token            text not null unique,
    utm                     jsonb not null default '{}'::jsonb,

    dodo_payment_id         text unique,
    paid_at                 timestamptz,
    amount_paid_cents       integer,
    currency                text,
    emails_sent_at          timestamptz,
    admin_notes             text not null default ''
);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);

create table public.order_files (
    id            uuid primary key default gen_random_uuid(),
    order_id      uuid not null references public.orders(id) on delete cascade,
    created_at    timestamptz not null default now(),
    kind          text not null check (kind in ('photo_facade', 'photo_ensemble', 'photo_rue',
                                                'plan_ou_devis', 'complement')),
    storage_path  text not null unique,
    filename      text not null,
    content_type  text,
    size_bytes    bigint,
    uploaded_by   text not null check (uploaded_by in ('formulaire', 'suivi_client', 'admin'))
);

create index order_files_order_idx on public.order_files (order_id);

-- Un webhook Dodo livré deux fois n'est traité qu'une fois (clé = en-tête webhook-id).
create table public.dodo_webhook_events (
    webhook_id   text primary key,
    received_at  timestamptz not null default now(),
    event_type   text,
    payment_id   text,
    order_id     uuid,
    outcome      text
);

-- L'adresse admin est insérée au déploiement, jamais écrite dans ce dépôt public :
--   insert into public.dossier_admins (email) values ('votre@adresse');
create table public.dossier_admins (
    email text primary key check (email = lower(email))
);

create or replace function public.is_dossier_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.dossier_admins
        where email = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

revoke all on function public.is_dossier_admin() from public;
grant execute on function public.is_dossier_admin() to authenticated;

create or replace function public.orders_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger orders_touch_updated_at
    before update on public.orders
    for each row execute function public.orders_touch_updated_at();

alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.dodo_webhook_events enable row level security;
alter table public.dossier_admins enable row level security;

create policy orders_admin_select on public.orders
    for select to authenticated using (public.is_dossier_admin());
create policy orders_admin_update on public.orders
    for update to authenticated using (public.is_dossier_admin()) with check (public.is_dossier_admin());
create policy order_files_admin_select on public.order_files
    for select to authenticated using (public.is_dossier_admin());

-- L'admin ne peut modifier que le statut et les notes.
revoke update on public.orders from authenticated;
grant update (status, admin_notes) on public.orders to authenticated;
revoke all on public.orders, public.order_files, public.dodo_webhook_events, public.dossier_admins from anon;

-- Bucket privé pour les photos et plans : 15 Mo par fichier, images et PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dossiers', 'dossiers', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);

create policy dossiers_admin_read on storage.objects
    for select to authenticated
    using (bucket_id = 'dossiers' and public.is_dossier_admin());

-- Supabase accorde par défaut EXECUTE à anon sur les nouvelles fonctions : on le retire.
revoke execute on function public.is_dossier_admin() from anon;
revoke execute on function public.orders_touch_updated_at() from anon, authenticated;
