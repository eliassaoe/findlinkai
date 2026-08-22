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
