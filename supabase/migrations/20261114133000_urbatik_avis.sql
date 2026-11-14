-- Urbatik : avis clients réels. Demandés par email quand le gérant passe une commande en « livree »,
-- saisis par le client sur /avis?token=…, publiés seulement après validation dans l'admin.
create table public.dossier_avis (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null unique references public.orders(id) on delete cascade,
    created_at timestamptz not null default now(),
    note smallint not null check (note between 1 and 5),
    commentaire text check (char_length(commentaire) <= 1500),
    prenom text, entreprise text, ville text,
    approved boolean not null default false
);
alter table public.dossier_avis enable row level security;
revoke all on public.dossier_avis from anon, authenticated;
alter table public.orders add column review_requested_at timestamptz;
create view public.urbatik_avis_publics as
  select note, commentaire, prenom, entreprise, ville, created_at from public.dossier_avis where approved order by created_at desc;
grant select on public.urbatik_avis_publics to anon;
