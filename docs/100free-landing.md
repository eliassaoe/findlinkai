# /100free — 1,000 credits at signup

**Date:** 2026-09-07

A signup page that puts 1,000 credits on the account before the user has
signed in once. It is not a promo system: it is the G2 review reward with a
different trigger and a different amount.

## Where the money moves

| Piece | Where | What it reuses |
| --- | --- | --- |
| The amount | `workers/onboarding-tasks/worker.js`, `TASK_CONFIG.signup_100free` | Sits next to `g2_review: 1000` |
| The ledger row | `user_task_completions` (`task_name = 'signup_100free'`, `credits = 1000`) | Same table and shape as every task payout |
| The credit | `increment_user_credits()` via `creditUser()` | The one atomic RPC every payout uses |
| One per account | Unique index `user_task_completions_one_per_task` | Same index that stops a second G2 payout |
| The trigger | `POST /tasks/signup-grant`, called by the signup worker | New; server-to-server, gated by `SIGNUP_GRANT_KEY` |

The bonus is **on top of** the normal starting grant (50, or 10 in the
low-conversion tier), exactly as a G2 review would be. A standard /100free
account therefore starts at 1,050. To make it exactly 1,000, have the
`/100free` route send `startingCredits: 0` to n8n.

## The sequence

```
/100free ──► POST signup-worker/100free {email, password | provider:'google', utm}
                │
                ├─► same validation, geo tier, rate limit as POST /
                ├─► n8n creates the account, returns {token}
                ├─► POST onboarding-tasks/tasks/signup-grant {key, user_token, task_name, attribution}
                │       insert ledger row ─► increment_user_credits(+1000)
                │       PATCH linkfinderai_users {signup_landing, utm_*}
                │       PostHog: signup_credits_granted (distinct_id = token)
                └─► browser gets {token, signup_grant:{credits_awarded, credits_balance}}
                        posthog.identify(token, {signup_landing, utm_*})
                        posthog.capture('signup_success', {landing:'/100free', ...})
                        redirect to /app?token=...
```

Google signups take the same path. `/100free` writes `lf_landing` and
`lf_landing_utm` to localStorage before the OAuth redirect; `confirmation-signup`
reads them back, posts to the worker's `/100free` route, and clears them.

The grant is bound to the worker path. There is no code to type and no query
parameter to survive a redirect. What the browser cannot do is claim the grant
for an existing account: `/tasks/complete` refuses `signup_grant` tasks, and
`/tasks/signup-grant` needs the key only the signup worker holds.

## What can go wrong, and what happens

| Failure | Outcome |
| --- | --- |
| Grant call fails after n8n succeeded | Account exists with the base grant. Response carries `signup_grant.error`; the page fires `signup_grant_failed`. One retry on a network error, none on a definite refusal. |
| Credit RPC fails after the ledger row was written | Row is deleted so the account can be retried; nothing is marked paid. |
| Same account granted twice (retry, replay, race) | The unique index refuses the second row: 409, no credit. |
| `SIGNUP_GRANT_KEY` missing on the signup worker | No grant, logged loudly, `signup_grant.error = grant_not_configured`. The signup itself is unaffected. |
| n8n returns no token | No grant (there is nothing to credit yet). The page's recovery login fires `signup_grant_failed` with `no_token_recovered_via_login`. |

Every miss is a `signup_grant_failed` event in PostHog with a reason, so the
accounts to pay by hand are a filter away.

## Counting it

- `signup_credits_granted` — server-side, one per paid account, with
  `credits_awarded`, `credits_balance`, `landing_page` and the utm fields.
  This is the number.
- `signup_success` with `landing = '/100free'` — browser-side, includes
  `signup_grant_credits` (0 when the bonus did not land).
- `signup_grant_failed` — the gap between the two.

In SQL, the same thing:

```sql
select count(*), sum(credits)
from public.user_task_completions
where task_name = 'signup_100free';

select utm_campaign, count(*)
from public.linkfinderai_users
where signup_landing = '/100free'
group by 1 order by 2 desc;
```

## Deploying, in order

1. Run `supabase/migrations/20260907120000_signup_attribution.sql` (adds the
   six attribution columns; nothing depends on them until the worker PATCHes).
2. `cd workers/onboarding-tasks && wrangler secret put SIGNUP_GRANT_KEY && wrangler deploy`.
3. In the Cloudflare dashboard, on `linkfinderai-sign-up`: add the
   `SIGNUP_GRANT_KEY` secret with the same value, then paste
   `workers/signup/worker.paste-safe.js` (see that folder's README for why it is
   not deployed from git).
4. Push this repo; GitHub Pages serves `100free.html` at `/100free`.

Until step 3, `/100free` creates accounts normally and grants nothing: the
route does not exist on the live worker yet, so the page would get a 404 from
it. Do not send traffic before step 3.

## Tests

```bash
node workers/onboarding-tasks/test-signup-grant.mjs   # the grant: 37 checks
node workers/signup/worker.test.mjs                    # the route: 37 checks
```

## Known exposure

1,000 credits land before the address is verified, because "before first
login" was the requirement. Password signups on this page are gated exactly as
on `/sign-up` (no disposable domains, no consumer mailboxes, Gmail routed to
Google, three accounts per IP per day), so the worst case is 3,000 bonus
credits per IP per day. If that is too much, the cheapest cut is to hide the
email form on `/100free` and leave the Google button, which is verified by
Google before the account exists.

The page is `noindex`: it exists for campaign links, not for search, and it
must not compete with `/sign-up`.
