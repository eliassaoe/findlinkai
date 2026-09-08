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

## Campaign gift codes (8 Sep 2026)

A campaign link can hand out a bigger starting grant than the geo tier. The
amount lives **only** in the Worker:

```js
const GIFT_CREDITS = {
    coldemail_1000: 1000     // icp30k_recruiting cold-email sequence, email 1
};
```

How a code travels:

1. The email links to `https://linkfinderai.com/100free?utm_...`. `100free.html`
   stores `lf_gift = coldemail_1000` in localStorage and bounces to
   `/sign-up?gift=coldemail_1000&utm_...` (UTMs preserved for attribution).
2. `sign-up.html` reads `?gift=`, keeps it in localStorage (so it survives the
   Google redirect), shows the "1,000 free credits are waiting" banner, and
   posts `gift` with the signup. `confirmation-signup.html` posts the stored
   value on the Google path.
3. The Worker looks the code up. Known code -> that grant, geo tier ignored
   (the list was hand-picked). Unknown or missing code -> the normal grant.
   `gift` is also forwarded to n8n for the record; n8n may ignore it.

Nothing a visitor can type in the URL becomes more than what is in the table.
Anyone who has the link can use it, which is the accepted cost of a link that
has to work from an email with no login.

To run another campaign: add a line to `GIFT_CREDITS`, mirror the amount in
`GIFT_BANNERS` in `sign-up.html` (banner copy only), paste the Worker into the
dashboard, link to `/sign-up?gift=<code>` (or add a landing stub like
`100free.html`). To end one: delete its line and re-paste — old links then
fall back to the normal grant, nothing breaks.

**This is not live until the Worker is re-pasted into the Cloudflare
dashboard** (see "Do NOT `wrangler deploy`" above). `worker.paste-safe.js` is
the copy to paste. Until then the pages send `gift` and the live Worker
silently ignores it.

Both signup paths run through this Worker — the email/password form in
`sign-up.html` and the Google flow in `confirmation-signup.html`, which posts
here with `provider:'google'` — so one edit covers both.
