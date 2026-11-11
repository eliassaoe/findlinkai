-- Applied 11 Nov 2026 as "bf2026_winback_allowlist" (see docs/black-friday-ltd-2026.md).
-- 1) ltd_allowlist += past customers who are not active subscribers (reason bf2026_winback):
--    paid before (subscription_id / is_unlimited / customer_id / plan_type), no LTD,
--    no AppSumo, and NOT (has subscription_id AND used the product in the last 60 days).
-- 2) ltd_campaign_audience.segment ('free' | 'winback'); refresh_ltd_campaign_audience()
--    now also inserts allowlisted past customers as 'winback'.
-- The exact SQL is in the Supabase migration history; this file records the intent.
alter table public.ltd_campaign_audience add column if not exists segment text not null default 'free';
