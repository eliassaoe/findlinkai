# AppSumo codes

Deal: **60,000 credits per year**, added in one lump when the code is redeemed and
again on every anniversary. Codes stack (2 codes = 120,000/yr).

## Flow

`/redeem-code` → code starts with `LFAS-` → `rpc appsumo_redeem(p_code, p_email, p_password, p_token)`
(anon key, Supabase project `snxhsboboatjywgwdeds`). Any other code still goes to the old
`linkfinder-redeem` worker, unchanged.

- **New email** → creates the `linkfinderai_users` row the same way an email signup does
  (`email`, `mdp`, 16-char `token`), so `/log-in` works with that email + password.
- **Existing email** → credits that account, but only if the password matches its `mdp`
  or the browser holds that account's token (`localStorage.lf_token_backup`, set by `/app`).
  Google-signup accounts have no password: they log in first, then redeem.
- Grants `credits += 60000`, `appsumo_yearly_credits += 60000`, `is_unlimited = true`
  (the "has paid" marker — so the farm guard leaves the credits alone and `ltd_eligibility`
  treats them as past payers).
- Redirects to `/app?token=...`. PostHog events: `appsumo_redeemed`, `appsumo_redeem_failed`.
- AppSumo redemption URL can prefill the code: `https://linkfinderai.com/redeem-code?code=LFAS-...`

Yearly grant: cron `appsumo-yearly-topup` (daily, 04:23 UTC) runs `appsumo_yearly_topup()`,
which adds `appsumo_yearly_credits` to `credits` when `appsumo_topup_at` is a year old.
Unused credits roll over (it adds, it does not reset).

This is separate from the Dodo LTD (`ltd_monthly_credits`): AppSumo users never count as
LTD seats and never get the monthly refill.

## Operations (SQL editor, service role)

Codes are **never** committed — this repo is public.

    -- more codes
    select * from appsumo_generate_codes(500, 'appsumo-batch2', 60000);
    -- export a batch for the AppSumo upload
    select code from appsumo_codes where batch = 'appsumo-2026-11' and status = 'available';
    -- AppSumo refund: revoke the code, stop its yearly grant, take back 60k (never below 0)
    select appsumo_revoke('LFAS-XXXX-XXXX-XXXX');
    -- who redeemed what
    select code, status, redeemed_email, redeemed_at from appsumo_codes where status <> 'available';

Batch `appsumo-2026-11`: 1,000 codes generated 5 Nov 2026.
