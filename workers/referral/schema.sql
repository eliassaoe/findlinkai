-- ===========================================================================
-- Referral program v2
-- ===========================================================================
--
-- The v1 program is not migrated and not reused. Its attribution lived in
-- linkfinderai_users.refered_by, a single free-text column that ended up
-- holding three unrelated things at once:
--
--   "null"  (the literal string)          4,645 rows  -- a client bug
--   real affiliate codes                      1 code  -- 26 signups, 2 paid
--   marketing tags: producthunt, reddit,
--   anchor, peerpush, nxgntools, test_xyz  ~30 rows
--
-- One commission row was ever written. Nothing in there can be trusted to say
-- who referred whom, so v2 starts from empty tables and leaves refered_by
-- alone for whatever still reads it.
--
-- Design rules, in order of importance:
--
--   1. A commission is only ever created by a signature-verified Dodo webhook.
--      Never by the browser. The browser can ask "what am I owed" and nothing
--      else. This is the whole difference between this and a credit faucet.
--   2. Attribution is first-touch and locked at signup. One row per referred
--      user, enforced by the primary key, so it cannot be rewritten later by
--      anyone who re-lands on a different link.
--   3. Idempotent on Dodo's payment id, so a webhook retry (Dodo retries) can
--      never pay the same commission twice.
--   4. RLS on, with no policies. These tables hold payout addresses and money;
--      only the workers reach them, with the service role key, which bypasses
--      RLS. Any anon/authenticated client gets nothing. Six existing tables in
--      this project are exposed precisely because this step was skipped.

-- --------------------------------------------------------------------------
-- Who can refer, and where they get paid
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_partners (
    user_id        text PRIMARY KEY,
    code           text NOT NULL UNIQUE,
    payout_email   text,
    payout_method  text NOT NULL DEFAULT 'paypal',
    -- 'active' | 'blocked'. Blocked keeps history but stops new commissions.
    status         text NOT NULL DEFAULT 'active',
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT referral_partners_status_chk CHECK (status IN ('active','blocked')),
    -- Codes go in URLs and get typed by hand. Keep them unambiguous.
    CONSTRAINT referral_partners_code_chk   CHECK (code ~ '^[a-z0-9]{6,24}$')
);

-- --------------------------------------------------------------------------
-- Who was referred by whom. One row per referred user, ever.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_attributions (
    referred_user_id  text PRIMARY KEY,
    -- Denormalised on purpose: if a partner ever changes code, existing
    -- attributions must keep pointing at the person, not the string.
    partner_user_id   text NOT NULL REFERENCES referral_partners(user_id) ON DELETE CASCADE,
    code              text NOT NULL,
    referred_email    text,
    signed_up_at      timestamptz NOT NULL DEFAULT now(),
    -- Set when something looks off (same email domain as the partner, partner
    -- referring themselves). Kept rather than rejected so it can be reviewed;
    -- commissions on a flagged attribution land as 'review', never 'approved'.
    flagged_reason    text,
    CONSTRAINT referral_no_self CHECK (referred_user_id <> partner_user_id)
);

CREATE INDEX IF NOT EXISTS referral_attributions_partner_idx
    ON referral_attributions (partner_user_id);

-- --------------------------------------------------------------------------
-- The money. Written only by the webhook.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_commissions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_user_id     text NOT NULL REFERENCES referral_partners(user_id) ON DELETE CASCADE,
    referred_user_id    text NOT NULL,
    -- The retry guard. Dodo retries webhooks; without this a flaky response
    -- pays the same commission repeatedly.
    dodo_payment_id     text NOT NULL UNIQUE,
    dodo_subscription_id text,
    dodo_event_type     text,
    -- Stored in major units (dollars), already divided from Dodo's cents.
    gross_amount        numeric(12,2) NOT NULL,
    currency            text NOT NULL DEFAULT 'USD',
    rate                numeric(5,4)  NOT NULL,
    commission_amount   numeric(12,2) NOT NULL,
    -- pending  : inside the refund window, not yet owed
    -- approved : past the window, owed, will be included in a payout
    -- review   : flagged attribution, needs a human before it can be approved
    -- paid     : included in a completed payout
    -- void     : refunded, charged back, or rejected on review
    status              text NOT NULL DEFAULT 'pending',
    created_at          timestamptz NOT NULL DEFAULT now(),
    approved_at         timestamptz,
    paid_at             timestamptz,
    payout_batch        text,
    CONSTRAINT referral_commissions_status_chk
        CHECK (status IN ('pending','approved','review','paid','void'))
);

CREATE INDEX IF NOT EXISTS referral_commissions_partner_idx
    ON referral_commissions (partner_user_id, status);
CREATE INDEX IF NOT EXISTS referral_commissions_created_idx
    ON referral_commissions (created_at);

-- --------------------------------------------------------------------------
-- Click funnel. Without this the dashboard can only show conversions, and a
-- partner whose link is being seen but not converting looks identical to one
-- who never shared it.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_clicks (
    id          bigserial PRIMARY KEY,
    code        text NOT NULL,
    clicked_at  timestamptz NOT NULL DEFAULT now(),
    -- Salted hash, never the raw address: this is enough to spot one machine
    -- inflating a click count, and is not a stored identifier for a person.
    ip_hash     text,
    referrer    text,
    country     text
);

CREATE INDEX IF NOT EXISTS referral_clicks_code_idx ON referral_clicks (code, clicked_at);

-- --------------------------------------------------------------------------
-- Lock everything down. Workers use the service role key, which bypasses RLS;
-- every other client gets nothing. No policies are created deliberately.
-- --------------------------------------------------------------------------
ALTER TABLE referral_partners     ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_commissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks       ENABLE ROW LEVEL SECURITY;
