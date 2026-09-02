-- Tenant mapping for the Explee-backed MVP.
--
-- Explee has no project-creation endpoint, so onboarding is: the customer signs
-- up and describes what they sell, you create their project and campaign by hand
-- in Explee, then paste the ids back here. This schema is the join between "a
-- user of ours" and "an object in our single Explee organization".
--
-- Everything the customer is allowed to see is derived from tenant_campaigns.
-- The API never takes a campaign id from the browser on trust.

create extension if not exists pgcrypto;

create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique,          -- auth.users.id
  email       text not null,
  company     text,
  project_id  bigint,                        -- Explee project id, null until you create it
  created_at  timestamptz not null default now()
);

-- What the customer fills in at signup. You read this backstage; it is the
-- brief you paste into Explee.
create table if not exists onboarding_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  offer          text not null,              -- what they sell
  customer_problem text,
  target_role    text,
  target_geography text,
  target_company_size text,
  instructions   text,                       -- their brief for the first email
  followup_instructions text,
  language       text default 'en',
  calendly_url   text,
  notes          text,
  submitted_at   timestamptz not null default now()
);
create index if not exists onboarding_tenant_idx on onboarding_requests(tenant_id);

-- The authorization table. One row per campaign the customer may read.
create table if not exists tenant_campaigns (
  campaign_id  bigint primary key,           -- Explee campaign id
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  status       text not null default 'pending_setup',
  calendly_url text,
  created_at   timestamptz not null default now(),
  activated_at timestamptz
);
create index if not exists tenant_campaigns_tenant_idx on tenant_campaigns(tenant_id);

-- The states the customer sees. Deliberately fewer than Explee's, because the
-- customer does not need to know about lead searches and review countdowns —
-- they need to know whether to come back yet.
--
--   pending_setup  "We're building your campaign"   (you have not touched it)
--   waiting_leads  "Finding your leads"             (project + campaign exist)
--   active         "Sending"                        (emails going out)
--   paused         "Paused"
--   done           "Finished"
--
-- Explee's own campaign status is authoritative for active/paused; these two
-- early states exist because Explee has no row at all until you make one.
alter table tenant_campaigns drop constraint if exists tenant_campaigns_status_check;
alter table tenant_campaigns add constraint tenant_campaigns_status_check
  check (status in ('pending_setup','waiting_leads','active','paused','done'));

-- Bookings stay ours: Explee cannot tell you who booked, and the whole offer is
-- booked calls. See ../schema.sql for the full version; this is the minimum.
create table if not exists bookings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete set null,
  campaign_id   bigint,
  invitee_email text not null,
  invitee_name  text,
  starts_at     timestamptz,
  event_uri     text unique,
  created_at    timestamptz not null default now()
);
create index if not exists bookings_tenant_idx on bookings(tenant_id);

-- RLS: the API uses the service key and does its own scoping, but the browser
-- also holds an anon key, so lock the tables it could otherwise read.
alter table tenants             enable row level security;
alter table onboarding_requests enable row level security;
alter table tenant_campaigns    enable row level security;
alter table bookings            enable row level security;

drop policy if exists tenant_self on tenants;
create policy tenant_self on tenants
  for select using (user_id = auth.uid());

drop policy if exists onboarding_self on onboarding_requests;
create policy onboarding_self on onboarding_requests
  for select using (tenant_id in (select id from tenants where user_id = auth.uid()));

drop policy if exists campaigns_self on tenant_campaigns;
create policy campaigns_self on tenant_campaigns
  for select using (tenant_id in (select id from tenants where user_id = auth.uid()));

drop policy if exists bookings_self on bookings;
create policy bookings_self on bookings
  for select using (tenant_id in (select id from tenants where user_id = auth.uid()));
