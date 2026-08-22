# Patch for `linkfinderai-sign-up`

Written against the deployed source, not guessed at. Three small edits.

## What reading the real worker changed

I had assumed the signup worker created the account and could simply stop passing
`email_confirm: true`. It does not. It validates, rate-limits, and **forwards to
an n8n webhook on Railway** which does the actual account creation. The n8n
workflow is not in either repo — `scalelinkfinderai` holds only the Dockerfile
and `railway.json` — so it cannot be edited from here.

Two other things the real source settled:

- **Disposable domains are already blocked**, server-side, against a
  `DISPOSABLE_DOMAINS` KV namespace. My earlier deliverability note recommending
  this was redundant; it has been corrected.
- **Starting credits are geo-tiered**, not a flat number:
  `standard = 150`, and `low_conversion = 25` for IN, PK, NG, BD, EG.
  So "hold 90 of the 100" was wrong — the amount to hold differs per signup.

That last point is why the patch below stashes the held amount rather than
assuming it, and why `verify-email` now reads it back instead of using a constant.

## The idea

The worker already computes `startingCredits` and passes it to n8n. So cap it
there and remember the difference. **n8n needs no change** — it keeps storing
whatever number it is handed.

## Edit 1 — constants, next to the existing geo block

```js
const LOW_CONVERSION_COUNTRIES = new Set(['IN', 'PK', 'NG', 'BD', 'EG']);
const SIGNUP_CREDITS = { low_conversion: 25, standard: 150 };

// Password signups get this much until they confirm the address. Google
// signups are exempt: Google verified the address before it reached us.
const VERIFY_CAP = 10;
```

## Edit 2 — in `handleSignup`, right after `startingCredits` is computed

```js
const startingCredits = SIGNUP_CREDITS[geoTier];

// --- email verification hold ------------------------------------------
const isGoogle = (provider || 'email') === 'google';
const grantedNow  = isGoogle ? startingCredits : Math.min(VERIFY_CAP, startingCredits);
const heldCredits = startingCredits - grantedNow;

// Stash what is owed so verify-email can release exactly the right number
// later. Keyed by normalized email because that is the only identifier that
// exists at this point - the account row does not exist yet. 90 days is well
// past the point where anyone is going to confirm.
if (heldCredits > 0 && env.RATE_LIMITS) {
  try {
    await env.RATE_LIMITS.put(`held_${normalizedEmail}`, String(heldCredits), {
      expirationTtl: 60 * 60 * 24 * 90
    });
  } catch (e) {
    // If the stash fails, fall back to granting in full rather than
    // stranding someone's credits with no record of what they are owed.
    console.error('held-credit stash failed, granting in full', e);
    return grantInFull();
  }
}
```

…and change the single line in the n8n payload:

```js
   geoTier: geoTier,
-  startingCredits: startingCredits
+  startingCredits: grantedNow,
+  emailVerified: isGoogle,      // n8n may ignore this; harmless if so
+  heldCredits: heldCredits      // ditto - useful if you later add the column
 })
```

`grantInFull()` is just the existing path with `startingCredits` unchanged —
inline it however reads best.

## Edit 3 — bind the KV namespace to `verify-email`

`verify-email` has to read the same namespace. In its `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "<the same id linkfinderai-sign-up uses>"
```

Get the id from the signup worker's settings in the Cloudflare dashboard, or
`wrangler kv namespace list`.

## What is still unknown, and how to find out

The app learns it is unverified from the **credits worker**, which is also just a
proxy — it forwards `{token}` to an n8n webhook and returns the JSON verbatim.
So `email_verified` has to come from somewhere. Two options, in preference order:

1. **Have the credits worker ask `verify-email`** and merge the answer in. No n8n
   change at all. Sketch is in `CREDITS_PATCH.md`.
2. Add the field to the n8n response, if editing that workflow is easy for you.

Before either, check what n8n already returns — it may include the email or the
verified flag already:

```bash
curl -s -X POST https://linkfinderaicredits.hamoureliasse.workers.dev/ \
  -H 'Content-Type: application/json' -H 'Origin: https://linkfinderai.com' \
  -d '{"token":"<a-real-token>"}'
```

If that response contains an `email`, option 1 gets simpler still.
