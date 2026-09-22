-- Applied to production 22 Sep 2026, during the incident.
--
-- Why this exists at all, when the signup Worker already does the same thing:
-- the Worker fix has to be pasted into the Cloudflare dashboard by hand, and
-- until that happens the farm keeps minting 1,000-credit accounts. This runs
-- wherever the row is written from - n8n, the Worker, a future service, psql -
-- and needs nobody to deploy anything. Defence in depth, not a duplicate.
--
-- Two rules, deliberately different in strength:
--
--   1. Farm-shaped accounts get ZERO credits, on INSERT *and* on UPDATE. The
--      UPDATE half is the point: zeroing them by hand did nothing, because the
--      farm re-funded the same rows minutes later.
--   2. A new unverified email/password account is capped at 10 credits, the
--      same VERIFY_CAP the Worker applies.
--
-- Rule 2 is INSERT-only on purpose. 274 real people signed up with a password,
-- never confirmed, and hold credits today; clawing those back retroactively
-- would punish genuine users for a hole that was never theirs.
--
-- Exemptions checked before either rule: anyone who has ever paid (customer_id
-- or subscription_id), anyone unlimited, and every Google signup. Google
-- accounts have no password (mdp IS NULL) and arrive verified by Google - they
-- are 76% of real signups and must never be touched by this.
--
-- Verified on the live table before cleanup:
--   lf-9x2qab71@acmecorp.com      1000 -> 0     (farm)
--   newuser@realcompany.com         50 -> 10    (legit password signup, capped)
--   google@realcompany.com          50 -> 50    (Google, untouched)
--   lf-outreach@realcompany.com     50 -> 10    (real alias: capped, NOT zeroed)
--   re-funding the farm row to 1000/500 -> still 0/0
--
-- To remove: DROP TRIGGER trg_signup_farm_credit_guard ON public.linkfinderai_users;

CREATE OR REPLACE FUNCTION public.signup_farm_credit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_local  text := split_part(lower(coalesce(NEW.email, '')), '@', 1);
  v_domain text := split_part(lower(coalesce(NEW.email, '')), '@', 2);
  v_is_farm boolean;
BEGIN
  IF NEW.customer_id IS NOT NULL
     OR NEW.subscription_id IS NOT NULL
     OR NEW.is_unlimited IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.mdp IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_farm :=
        v_domain IN (
          'summitpartners.com','northstar.io','vantagegrp.com','meridianpartners.com',
          'catalystlabs.co','bluepeak.io','acmecorp.com','quantumedge.io','brightlabs.co',
          'keystonegrp.com','apexindustries.com','mycompany.org','ironcladhq.com',
          'evergreenllc.com','pinnacleco.com','orbitalabs.co','summitworks.com',
          'peakridge.com','clearwater.io','northwindco.com','tritoncorp.com',
          'harborview.com','silverline.co')
     OR v_local ~ '^lf[-.][a-z0-9]{8}$' AND v_local ~ '[0-9]'
     OR v_local ~ '^lf\.[0-9]{6,}$';

  IF v_is_farm THEN
    NEW.credits := 0;
    NEW.protected_credits := 0;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.email_verified IS NOT TRUE
     AND coalesce(NEW.credits, 0) > 10 THEN
    NEW.credits := 10;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signup_farm_credit_guard ON public.linkfinderai_users;

CREATE TRIGGER trg_signup_farm_credit_guard
  BEFORE INSERT OR UPDATE OF credits, protected_credits
  ON public.linkfinderai_users
  FOR EACH ROW
  EXECUTE FUNCTION public.signup_farm_credit_guard();
