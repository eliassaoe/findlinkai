# Partner lifetime codes — InfoStack (11 Nov 2026)

InfoStack sells a LinkFinder AI lifetime deal to its coach and entrepreneur
list and sends each buyer one single-use code. Terms agreed with Cary Richards
(Gmail thread "Hi Eliasse, here's the info I promised you", 21–22 Oct):

- $99 lifetime, **10,000 credits a month**, refilled every month, no rollover promised
- 50/50 net revenue split; InfoStack pays our share 30 days after close with a sales report
- **30-day money-back guarantee**, no questions asked; refunds are handled by InfoStack
- Waitlist emails 23, 25, 28, 29 Nov; sale live 30 Nov and 1 Dec 2026
- Support: support@linkfinderai.com
- Buyers redeem at **linkfinderai.com/redeem-code** (`/redeem` redirects there,
  because the October email said `/redeem`). Never the `/lifetime-deal` page.

## How the codes work

Same table, page and RPC as AppSumo (`docs/appsumo-codes.md`):

- `appsumo_codes` has two new columns: `monthly_credits` and `partner`.
- InfoStack codes start with `LFIS-`, `partner = 'infostack'`, `monthly_credits = 10000`.
- `/redeem-code` sends `LFAS-` and `LFIS-` codes to `rpc appsumo_redeem`. A code
  with `monthly_credits > 0` adds 10,000 credits now and sets `ltd_monthly_credits`;
  the existing `ltd_monthly_topup` cron refills it every month. The account is
  created on redeem if the email is new, exactly as for AppSumo.
- `appsumo_revoke(code)` on a refund takes back the 10,000 and stops the refill.
- Tested 11 Nov in a rolled-back transaction: redeem → 10,000 credits +
  `ltd_monthly_credits = 10000`, second redeem refused, revoke → 0 and no refill,
  AppSumo path unchanged. Page tested in Playwright with the RPC mocked.

Migration: `supabase/migrations/20261111200000_partner_ltd_codes.sql`.
Pinned by `tests/partner-ltd-codes.test.mjs`.

## Operations (SQL editor, service role) — codes are never committed

    -- generate
    select * from partner_generate_ltd_codes(500, 'infostack-2026-11', 'infostack', 'LFIS', 10000);
    -- export
    select code from appsumo_codes where batch = 'infostack-2026-11' and status = 'available';
    -- refund (InfoStack tells us which code)
    select appsumo_revoke('LFIS-XXXX-XXXX-XXXX');
    -- sales check against InfoStack's report
    select status, count(*) from appsumo_codes where partner = 'infostack' group by 1;

Batches: `infostack-2026-11` (500 codes) and `infostack-test` (1 test code),
generated 11 Nov 2026 and sent to Cary by email.

## Known gap

`ltd_monthly_topup` ADDS the monthly amount every month, so unused lifetime
credits roll over (docs/ltd-campaign.md describes a "raise up to the allotment"
refill that is not what the live function does). Generous to buyers, but it is
a growing cost on heavy accounts. Changing it affects every lifetime account,
so it is the owner's call.
