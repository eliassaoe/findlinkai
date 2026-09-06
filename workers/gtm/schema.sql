-- Our own GTM system: data model.
--
-- Mirrors the shape Explee's AutoGTM exposes (project -> campaign -> offer +
-- audience + per-stage instructions) so the UI is familiar, with three additions
-- that Explee does not have and that BASELINE.md says we need:
--
--   1. gtm_outcomes.booked_at  — interested->booked is THE missing number. BASELINE.md:
--      "$50 per call is exactly a 22% interested-to-booked rate", and it is on no
--      dashboard. docs/outbound-angle.md: 571 interested, 0 meetings. Measure it here.
--   2. gtm_prompts is versioned    — so a prompt change is attributable to a result.
--   3. gtm_patterns                — what the copywriter learned from replies that won.
--
-- Multi-client from day one: gtm_clients -> gtm_projects -> gtm_campaigns.

-- ---------------------------------------------------------------- clients

create table if not exists gtm_clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- projects

-- One per client brand/domain. Holds the facts replies are allowed to draw on.
create table if not exists gtm_projects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references gtm_clients(id) on delete cascade,
  name          text not null,
  domain        text,
  -- "Project docs" in Explee: the ONLY facts the reply agent may assert.
  facts         text not null default '',
  booking_link  text,
  cc_email      text,
  -- Instantly mailboxes this project sends from. Empty = all.
  sending_emails text[] not null default '{}',
  daily_cap     integer not null default 100,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (client_id, name)
);

-- --------------------------------------------------------------- campaigns

create type gtm_campaign_status as enum ('draft','running','paused','done');
create type gtm_audience_kind   as enum ('b2b','influencer');

create table if not exists gtm_campaigns (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references gtm_projects(id) on delete cascade,
  name         text not null,
  status       gtm_campaign_status not null default 'draft',
  kind         gtm_audience_kind not null default 'b2b',

  -- Offer (Explee: "Your offer")
  offer            text not null default '',
  customer_problem text not null default '',
  example_clients  text[] not null default '{}',
  keywords         text[] not null default '{}',

  -- Audience (Explee: "Audience"/"Targeting")
  target_role       text not null default '',
  target_geography  text not null default '',
  positive_criteria text[] not null default '{}',
  negative_criteria text[] not null default '{}',

  -- Instantly campaign this pushes into.
  instantly_campaign_id text,

  created_at   timestamptz not null default now(),
  unique (project_id, name)
);

-- ----------------------------------------------------------------- prompts

create type gtm_stage as enum ('first_email','follow_up','reply');

-- Versioned. Never UPDATE a row — insert a new version. The UI edits the head
-- version; every message records which version wrote it, so a change in reply
-- rate can be attributed to a prompt change.
create table if not exists gtm_prompts (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references gtm_campaigns(id) on delete cascade,
  stage         gtm_stage not null,
  version       integer not null,
  -- Free-text operator instructions. Explee caps these at 3000 chars; same cap
  -- keeps them portable and keeps the cached prefix small.
  instructions  text not null default '' check (length(instructions) <= 3000),
  -- 'lead' = write in the lead's own language.
  language      text not null default 'lead',
  follow_up_every_days integer not null default 3,
  max_follow_ups       integer not null default 2,
  created_at    timestamptz not null default now(),
  created_by    text,
  unique (campaign_id, stage, version)
);

create index if not exists gtm_prompts_head_idx
  on gtm_prompts (campaign_id, stage, version desc);

-- ------------------------------------------------------------------- leads

create type gtm_email_source as enum
  ('explee','linkfinder_linkedin','linkfinder_name','provided','llm_guess','none');

create table if not exists gtm_leads (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references gtm_campaigns(id) on delete cascade,

  email        text,
  email_source gtm_email_source not null default 'none',
  -- Only true for a resolver-verified address. Sending gates on this; see
  -- docs/autogtm-evaluation.md for why an LLM-guessed address must never send.
  email_verified boolean not null default false,

  full_name    text,
  first_name   text,
  last_name    text,
  title        text,
  company      text,
  company_domain text,
  linkedin_url text,
  location     text,
  language     text,

  -- Whatever the source returned, kept whole so the copywriter can cite it.
  raw          jsonb not null default '{}'::jsonb,
  -- Influencer campaigns only.
  audience_size integer,
  content_types text[],

  fit_score    integer check (fit_score between 1 and 10),
  fit_reason   text,

  suppressed   boolean not null default false,
  suppressed_reason text,

  created_at   timestamptz not null default now(),
  unique (campaign_id, email)
);

create index if not exists gtm_leads_sendable_idx
  on gtm_leads (campaign_id, email_verified, suppressed, fit_score desc);

-- Cross-project suppression. Never mail the same person from two clients.
create table if not exists gtm_suppression (
  email       text primary key,
  reason      text not null,
  added_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- messages

create table if not exists gtm_messages (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references gtm_leads(id) on delete cascade,
  stage         gtm_stage not null,
  step          integer not null default 1,
  prompt_id     uuid references gtm_prompts(id),
  subject       text,
  body          text not null,
  language      text,
  -- Set once handed to Instantly.
  sent_at       timestamptz,
  instantly_message_id text,
  created_at    timestamptz not null default now()
);

create table if not exists gtm_replies (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references gtm_leads(id) on delete cascade,
  body          text not null,
  received_at   timestamptz not null,
  -- Filled by the classifier in learning.py.
  sentiment     text check (sentiment in ('interested','question','not_now','no','ooo','unsubscribe','other')),
  classified_at timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- outcomes

-- The table BASELINE.md says decides everything. One row per lead that replied.
create table if not exists gtm_outcomes (
  lead_id       uuid primary key references gtm_leads(id) on delete cascade,
  replied_at    timestamptz,
  interested_at timestamptz,
  -- THE number. Cost per call = spend / booked. Nothing else moves it as hard.
  booked_at     timestamptz,
  lost_at       timestamptz,
  lost_reason   text,
  notes         text,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- learning

-- Mined from messages whose lead reached interested_at or booked_at. Injected
-- into the copywriter's prompt as evidence, never as a template to copy.
create table if not exists gtm_patterns (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references gtm_campaigns(id) on delete cascade,
  -- Null campaign_id = learned across the whole project/client.
  project_id   uuid references gtm_projects(id) on delete cascade,
  stage        gtm_stage not null,
  kind         text not null check (kind in ('opening','angle','ask','subject','structure','avoid')),
  pattern      text not null,
  evidence     text,
  -- How many won messages support it, and how many losing ones contradict it.
  wins         integer not null default 0,
  losses       integer not null default 0,
  mined_at     timestamptz not null default now(),
  active       boolean not null default true
);

create index if not exists gtm_patterns_lookup_idx
  on gtm_patterns (campaign_id, stage, active, wins desc);

-- A pattern earns its place in the prompt only with enough support. Kept as a
-- view so the threshold is visible and changeable without a code deploy.
create or replace view gtm_active_patterns as
  select * from gtm_patterns
   where active and wins >= 3 and wins > losses * 2;

-- ---------------------------------------------------------------------- RLS
--
-- Applied to the live project 2026-09-06. Two migrations, and the second one
-- exists because the first was wrong in a way worth remembering.
--
-- The first cut granted `to authenticated using (true)`. That looked right and
-- was not: auth.users in this project is the APP's user table — 5,116 rows,
-- 3,841 confirmed — so every customer who signed in could have read and written
-- campaign config and lead lists. "Authenticated" is not "us".
--
-- The fix is an explicit operator allowlist. Membership is granted with the
-- service role key, out of band; nobody can add themselves.
--
-- The runner never signs in. It uses the service role key from GitHub Actions,
-- which bypasses RLS entirely.

create table if not exists gtm_operators (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  added_at timestamptz not null default now()
);

alter table gtm_operators enable row level security;

create policy gtm_operators_read on gtm_operators
  for select to authenticated using (user_id = auth.uid());

create or replace function gtm_is_operator() returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from gtm_operators where user_id = auth.uid()) $$;

-- Then, for every gtm_* table:
--   alter table <t> enable row level security;
--   create policy gtm_operators_all on <t> for all to authenticated
--     using (gtm_is_operator()) with check (gtm_is_operator());
