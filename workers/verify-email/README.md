# Email verification

Stops fake addresses from getting a funded account, and — the reason it was built
now — stops them from getting marketing email. Amazon SES puts a sender under
review at a 5% hard-bounce rate, and `linkfinderai.com` has no sending history to
absorb a spike.

## The shape of it

**Only email/password signups are affected.** Of 1,808 signups in the last 180
days, **1,377 came through Google** and were verified by Google before they ever
reached us. They are never capped, never see the banner, and get marketing email
as normal. The **431 email/password signups** are the ones nobody ever checked,
and they are the ones this gates.

| | Google (76%) | Email + password (24%) |
|---|---|---|
| Credits at signup | full grant | `VERIFY_CAP` (10) |
| Can use the app | yes | yes |
| Can upgrade / pay | yes | yes |
| Banner in the app | no | yes, until confirmed |
| Marketing email | yes | **no**, until confirmed |

The cap is not a lockout. They can run lookups, hit the paywall, and buy —
nothing about the revenue path is blocked. What is withheld is free credits and
email.

## Run migration.sql first

The live schema is `linkfinderai_users` — 21 columns, and **none of them is `id`,
`auth_id` or `email_verified`**. `token` is the identifier. `migration.sql` adds
the flag, indexes the token, backfills existing accounts to verified so nobody
already using the product is retroactively capped, and creates a
security-definer `email_is_confirmed(email)` because `auth.users` is not readable
through PostgREST and there is no `auth_id` on the account row to join with.

## Deployed

**`https://verifyemail.hamoureliasse.workers.dev/`** — the app and the landing page
both point at it.

```bash
cd workers/verify-email
wrangler secret put SUPABASE_URL          # https://snxhsboboatjywgwdeds.supabase.co
wrangler secret put SUPABASE_SERVICE_KEY  # service_role key, NOT the publishable one
wrangler deploy
```

### Check it end to end

Take a real `token` from an account row and run:

```bash
# 1. A verified (Google) account. Expect email_verified true, credits_pending 0.
curl -s -X POST https://verifyemail.hamoureliasse.workers.dev/status \
  -H 'Content-Type: application/json' -H 'Origin: https://linkfinderai.com' \
  -d '{"token":"<a-google-account-token>"}'

# 2. A junk token. Expect HTTP 401 {"error":"Unknown token"} - proves the
#    Supabase lookup is wired up, rather than silently matching nothing.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://verifyemail.hamoureliasse.workers.dev/status \
  -H 'Content-Type: application/json' -d '{"token":"definitely-not-a-real-token"}'
```

`{"error":"Unknown token"}` on a token you know is real means `ACCOUNTS_TABLE` or
`TOKEN_COLUMN` in `wrangler.toml` does not match the schema. A 500 means the
service_role key is missing or wrong, or `migration.sql` has not been run —
check `wrangler tail`.

The service_role key is required because the worker reads `auth.users` (to see
`email_confirmed_at`) and writes credits. It must never reach the browser.

Check `wrangler.toml` before deploying: the table and column names are vars, so
if the accounts table is not `users` or the token column is not `token`, change
them there rather than in the code.

## Three changes outside this worker

**1. The credits worker** (`linkfinderaicredits`) must return two extra fields:

```js
return Response.json({
  credits: row.credits,
  email_verified: row.email_verified === true,   // NEW
  verify_cap: 10                                 // NEW
});
```

`app.html` is already written against these and **ignores them if absent** — the
banner only appears on an explicit `false`. So this worker and the app can be
deployed in any order, and nothing changes for anyone until this field appears.

**2. The signup worker** (`linkfinderai-sign-up`) must stop auto-confirming
password signups and grant the capped amount:

```js
// was: email_confirm: true  (this is what makes every address "valid")
const isGoogle = payload.type === 'google';
await admin.createUser({ email, password, email_confirm: isGoogle });
await db.insert({ email, credits: isGoogle ? FULL_GRANT : 10,
                  email_verified: isGoogle });
```

Keep returning the token and keep redirecting into the app. The account works
immediately; it is only the credit balance that waits.

**3. Supabase → Authentication → URL Configuration**: add
`https://linkfinderai.com/verify-email` to the redirect allow-list, and point the
"Confirm signup" template at it. Supabase sends the email; we do not need a
transactional sender of our own.

## How the pieces talk

```
signup (password) ──► account created, 10 credits, email_verified = false
                      Supabase sends the confirmation email
                              │
app.html ──► credits worker ──► {credits, email_verified:false, verify_cap:10}
                              │
                              ├─► banner appears: "capped at 10 credits…"
                              │   └─► "Send it again" ──► POST /resend
                              │
                              └─► POST /claim (once per session)
                                      │
user clicks the link ──► /verify-email ──► POST /claim
                                      │
                          worker asks Supabase: email_confirmed_at set?
                                      │  yes
                          credits += VERIFY_HELD_CREDITS, email_verified = true
```

`/claim` runs from **both** the landing page and the app. That is deliberate:
people confirm on their phone and then use the app on a laptop, and only the
app-side call releases the credits in that case. It is idempotent — there is a
test for the double-top-up.

## Tests

`node worker.test.mjs` covers the fourteen cases that matter,
including: the top-up never runs before Supabase confirms, running `/claim`
twice does not pay twice, a missing `email_verified` column reads as unverified
rather than verified, a verified user is never emailed again, Supabase's 429 is
surfaced as a wait rather than an error, and the CORS header never reflects a
foreign origin.
