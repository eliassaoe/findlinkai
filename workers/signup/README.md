# linkfinderai-sign-up

A copy of the live Worker at
`https://linkfinderai-sign-up.hamoureliasse.workers.dev/`, kept here so the
signup grant is reviewable in git instead of existing only in Cloudflare.

## Do NOT `wrangler deploy` from this folder

There is deliberately no `wrangler.toml`. The live Worker has two KV bindings:

- `DISPOSABLE_DOMAINS` — blocks throwaway email domains
- `RATE_LIMITS` — 3 accounts per IP per 24h (`7a3cab8946f7487babd34458524bb4fa`)

Deploying from here without those bindings would leave both checks silently
disabled — `isDisposable()` and the rate limiter both log a warning and return
"allow" when their namespace is missing. That fails open, which is the worst
possible way for it to fail.

**Change it in the Cloudflare dashboard editor instead.** It is one line.

## The /100free route (7 Sept 2026)

`POST /100free` is the same handler as `POST /`, plus one step: once n8n has
created the account and returned its token, the worker calls the
onboarding-tasks worker's `/tasks/signup-grant` and the account receives the
`signup_100free` bonus (1,000 credits) before the browser gets its answer. It
reuses the G2 review payout exactly: the same `user_task_completions` row, the
same `increment_user_credits()` call, and the same unique index that makes it
one grant per account. The amount lives in that worker's `TASK_CONFIG`, not
here; this file only names the task.

The bonus is on top of `SIGNUP_CREDITS`, as a G2 review would be: a standard
/100free signup ends at 1,050, a low-conversion one at 1,010. If it should be
exactly 1,000, send `startingCredits: 0` on that route.

**One more binding to add in the dashboard**, next to the two KV namespaces:

- `SIGNUP_GRANT_KEY` — a secret shared with the onboarding-tasks worker
  (`wrangler secret put SIGNUP_GRANT_KEY` over there). Without it the route
  still creates the account but grants nothing, and says so in the log and in
  the response (`signup_grant: {error: 'grant_not_configured'}`).

The page also sends `utm: {utm_source, ...}`. The five utm_* fields are
whitelisted here, forwarded to n8n (which may ignore them), and passed to the
grant call, which writes them onto `linkfinderai_users` and onto the PostHog
`signup_credits_granted` event. See `docs/100free-landing.md`.

Test: `node workers/signup/worker.test.mjs` (n8n and the grant call are faked).

### `worker.paste-safe.js`

Generated from `worker.js` by turning every `//` line comment into a `/* */`
block, for pasting into the dashboard editor. The copy committed before this
change had `*/` closers inside the `CONSUMER_DOMAINS` array and did not run;
it is now regenerated from source, and a diff of the two files with comment
lines removed is empty.

## The change (22 Aug 2026)

```js
// was
const SIGNUP_CREDITS = { low_conversion: 25, standard: 150 };
// now
const SIGNUP_CREDITS = { low_conversion: 10, standard: 50 };
```

Everything else in this file is byte-for-byte what is already live, plus
comments. See `docs/credit-grant.md` for why those two numbers.

## Verify it actually took effect

The Worker only *sends* `startingCredits` to n8n:

```js
body: JSON.stringify({ ..., geoTier: geoTier, startingCredits: startingCredits })
```

If the n8n workflow ignores that field and applies its own constant, editing
this changes nothing. **Sign up with a fresh email and check the balance reads
50, not 150.** If it still says 150, the number is also hardcoded in n8n and has
to change there too.

Both signup paths run through this Worker — the email/password form in
`sign-up.html` and the Google flow in `confirmation-signup.html`, which posts
here with `provider:'google'` — so one edit covers both.
