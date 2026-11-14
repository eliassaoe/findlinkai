-- Dossier Express, 14 nov. 2026 : fichier clients propre au service, offre « 10 minutes », relances photos.
--
-- dossier_clients : un contact par email, rempli dès que la personne arrive au dernier écran
-- (même si elle ne paie pas). Serveur uniquement : RLS active, aucun droit pour anon/authenticated.
-- L'offre -30 % n'est accordée qu'une fois par email, à une personne qui n'a jamais payé,
-- dans les 10 minutes qui suivent offer_started_at (horodaté côté serveur, un rechargement ne le relance pas).

create table public.dossier_clients (
    email             text primary key,
    nom               text,
    entreprise        text,
    tel               text,
    first_seen_at     timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    offer_started_at  timestamptz,
    utm               jsonb not null default '{}'::jsonb
);
alter table public.dossier_clients enable row level security;
revoke all on public.dossier_clients from anon, authenticated;

alter table public.orders
    add column offre_10min           boolean not null default false,
    add column checkout_product      text,
    add column photo_reminders_sent  integer not null default 0,
    add column last_photo_reminder_at timestamptz;
