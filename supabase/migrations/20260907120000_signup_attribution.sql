-- Signup attribution on the account row.
--
-- PostHog already knows which campaign an account came from (lf-attribution.js
-- registers utm_* as super properties and the signup pages pass them to
-- identify()). Nothing in the database did, so a cohort could not be joined to
-- credits, plans or revenue without going through PostHog. These columns are
-- written by the onboarding-tasks worker during the /100free signup grant
-- (see workers/onboarding-tasks/worker.js, handleSignupGrant), and are free
-- for any other signup path to fill in later.
--
-- Additive and idempotent: no existing column is touched, no row is rewritten.

alter table public.linkfinderai_users
  add column if not exists signup_landing text,
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_term       text,
  add column if not exists utm_content    text;

comment on column public.linkfinderai_users.signup_landing is
  'Path of the landing page the account was created through, e.g. /100free. NULL for the default flow.';
comment on column public.linkfinderai_users.utm_campaign is
  'Campaign parameters at signup, as sent by the landing page. Same values as the PostHog person properties.';

-- The only query this needs to serve is "everyone from campaign X", and
-- "everyone who signed up through /100free".
create index if not exists linkfinderai_users_signup_landing_idx
  on public.linkfinderai_users (signup_landing)
  where signup_landing is not null;

create index if not exists linkfinderai_users_utm_campaign_idx
  on public.linkfinderai_users (utm_campaign)
  where utm_campaign is not null;
