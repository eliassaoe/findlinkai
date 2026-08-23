# `email_verified` is wrong on 4,616 accounts — 23 Aug

## The trigger

A signup used `fgeygjf@gmail.com`. Google hard-bounced it: *"The email account
that you tried to reach does not exist."*

The important part is not the fake address. It is that **`@gmail.com` says
nothing about how someone signed up**. Anyone can type `anything@gmail.com` into
an email+password form. Gmail is the most common real domain AND the most
common fake one, so the domain carries no signal in either direction.

## What the data says

Joining `linkfinderai_users` to `auth.users` on email, and splitting by whether
a password was set (`mdp`), which is the actual signup-method discriminator:

| signup | auth row | confirmed | accounts | gmail | subscribers | credits held |
|---|---|---|---|---|---|---|
| email+password | **none** | no | **4,616** | 3,350 | 8 | **1,137,375** |
| no password (Google) | yes | yes | 1,902 | 1,572 | 20 | 410,794 |
| email+password | yes | yes | 74 | 52 | 3 | 245,201 |
| email+password | yes | no | 2 | 0 | 0 | 5 |

**4,616 accounts — 70% of the base — have no Supabase auth row at all.** Nothing
ever verified them. 3,350 are `@gmail.com`, which is exactly the shape of the
bounce above.

## Why the flag is useless

`migration.sql` backfilled every existing account to `email_verified = true`,
so the column now reads:

- **6,571 rows `true`** — of which only **1,955** are confirmed in `auth.users`
- **23 rows `false`** — of which **21 ARE confirmed in `auth.users`**

Wrong in both directions. The column records that a backfill ran, not that an
address exists. **`auth.users.confirmed_at IS NOT NULL` is the only trustworthy
signal.** The verify-email worker already uses it, via the `email_is_confirmed`
RPC — the worker is correct; the column it writes alongside is not.

## Two costs

**Deliverability.** Campaigns are gated on `email_verified`, which is `true` for
6,571 people. The reactivation campaign is aimed at ~6,500 dormant users. Send
that and a large share go to addresses no one has ever confirmed. SES puts a
sender under review at a 5% hard-bounce rate and `linkfinderai.com` has no
sending history to absorb a spike. One send could cost the domain.

**1,137,375 credits are sitting on never-verified accounts** — nearly 3x the
410,794 held by Google-verified users.

## And they do not convert

| segment | accounts | subscribers | rate |
|---|---|---|---|
| Google-verified | 1,902 | 20 | **1.05%** |
| email+password, unverified | 4,616 | 8 | **0.17%** |

A verified user is **6x** more likely to subscribe. So excluding the unverified
from the reactivation send is not only safer, it removes the part of the list
that was never going to pay.

## Fix, in order

1. **Recompute the column from truth**, do not trust the backfill:
   ```sql
   UPDATE linkfinderai_users u
   SET email_verified = EXISTS (
     SELECT 1 FROM auth.users a
     WHERE lower(a.email) = lower(u.email) AND a.confirmed_at IS NOT NULL
   );
   ```
   Roughly 4,616 rows flip to `false` and 21 flip to `true`.

2. **Gate the reactivation send on the recomputed flag** — about 1,955 people,
   not 6,500. Ramp 100 → 500 → batched from there, watching bounce rate.

3. **Finish the signup credit cap** (task #17). It is still pending, and the
   1.1M credits above are what "pending" has cost. An email+password signup
   should get `VERIFY_CAP` until confirmed, never the full grant.

4. **Add a typo catch at signup** — `gmaill.com`, `gmial.com`, `gma.com` are
   already in the base per `workers/lifecycle-email/DELIVERABILITY.md`. A "did
   you mean gmail.com?" prompt costs nothing and catches honest mistakes, which
   are a different problem from deliberate fakes but bounce identically.

## Do not do this

Do not infer anything from the email domain. No allowlist of "real" providers,
no blocklist of disposable ones as the primary check. The only questions that
matter are whether an auth row exists and whether it is confirmed.

---

## Shipped 23 Aug: gmail goes through the Google button

**The rule:** `@gmail.com` / `@googlemail.com` cannot be used on the
email+password form. They must sign in with Google instead.

**Why this is airtight rather than merely restrictive:** a gmail address *is* a
Google account. Anyone with a real one can always click the Google button — same
address, one click — and Google verifies it for us at no cost. The only people
the rule stops are those typing a gmail they do not own, because they cannot
pass Google's login. That is exactly the population we wanted to remove.

It closes **73%** of the hole on its own: 3,350 of the 4,616 never-verified
accounts are gmail.

**Deliberately not extended to other free providers.** Yahoo, Outlook, Hotmail,
iCloud and Proton have no OAuth provider on this site, so blocking them would
leave real people with no route in at all. `DELIVERABILITY.md` puts free
consumer domains at 75.7% of signups — most of the base — so a blanket ban on
consumer email would be a self-inflicted wound. If Microsoft OAuth is added
later, `outlook/hotmail/live` can join the same rule on the same reasoning.

Those addresses stay allowed on the password path and are handled by the
verification cap (task #17) instead.

### Also fixed while wiring it

`sign-up.html` read `errorData.message`, but the worker replies with
`{ error }`. **Every server-side rejection was being swallowed** and shown as the
generic "Failed to create account. Please try again." — including the
disposable-domain block, which has been invisible to users this whole time.

Fixing that exposed a second bug waiting behind it: the branch tested
`msg.includes('email') || msg.includes('already')`, and the disposable message
is *"Please use a permanent **email** address to sign up."* Once `msg` was
populated, that would have told those users their address was already
registered. The test is now `includes('already')` only.

### Files

- `workers/signup/worker.js` and `worker.paste-safe.js` — the rule, after the
  disposable check and before IP rate limiting
- `sign-up.html` — reads `error`, handles `code: 'use_google_signin'` by
  pointing at the Google button and scrolling to it, fires
  `signup_routed_to_google` so the rule's cost is measurable

### Watch this after deploy

`signup_routed_to_google` vs `signup_success`. If the routed count is large and
Google signups do not rise to match, the rule is losing real users somewhere and
should be revisited.
