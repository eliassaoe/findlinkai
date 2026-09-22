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

## Signup farm + retired gift code (22 Sep 2026)

`coldemail_1000` was minted 9,991 accounts between 13 and 22 Sep. `GIFT_CREDITS`
is now **empty** — old `/100free` links fall back to the standard grant, nothing
breaks. Full write-up in `docs/incident-signup-farm.md`.

Three checks were added, all before the KV reads so a scripted attempt costs
nothing:

- `BLOCKED_SIGNUP_DOMAINS` — the 23 domains the farm rotated through.
- `FARM_EMAIL_SHAPE` — `lf-` + 8 chars including a digit. Narrow on purpose:
  `lf-outreach@` is a plausible team alias and must still get through.
- `DOMAIN_SIGNUPS_PER_DAY` (5) — per-domain daily cap, the rule that
  generalises to the next farm. Consumer mailboxes are exempt; gmail is 75.5%
  of real signups and capping it would refuse real people all day.

**If you add a campaign code again:** keep the amount near the standard grant,
and do not ship it without a cap on redemptions. A public code worth 20x the
normal grant, repeatable, is a mint.

## Allowlist + multi-account rules (22 Sep 2026)

`COUNTRY_POLICY = 'allowlist'`. Only `ALLOWED_COUNTRIES` can sign up — proven
revenue markets (US, FR, GB, UA, CA, NL, SG, JP) plus high-income peers. A new
market now has to be let in on purpose instead of being admitted by default.

**US/UK only would cost 46% of the customer base** — 11 of the 24 paying
customers outside the blocked tier, France first among them, which converts
better than the US. `new Set(['US','GB'])` is the one-line change if that is
wanted anyway.

Multi-account rules, all failing open when KV is missing:

| rule | value | why |
|---|---|---|
| `ACCOUNTS_PER_IP_PER_DAY` | 1 | was 3; catches the second free account from one machine |
| `DOMAIN_SIGNUPS_PER_DAY` | 2 | was 5; the farm averaged 434 per domain |
| `FARM_EMAIL_SHAPE` | `lf-` + 8 chars w/ digit | narrow on purpose |
| `BLOCKED_SIGNUP_DOMAINS` | 23 domains | the farm's own list |

The IP rule refuses a second colleague behind one office NAT on the same day.
They are routed to sales rather than a dead end; for a product sold to teams
that is arguably the right destination, but it is a real cost, not a free win.

## Country block (22 Sep 2026)

`COUNTRY_POLICY` decides what `LOW_CONVERSION_COUNTRIES` means at the door:

```js
const COUNTRY_POLICY = 'block';   // 'block' | 'grant' | 'tier'
```

- `'tier'`  - the old behaviour: everyone signs up, the tier only sets the grant.
- `'grant'` - everyone signs up, the tier gets zero free credits.
- `'block'` - the tier cannot create an account. **Current setting.**

The refusal is a 403 with `code: 'country_not_supported'`; `sign-up.html` and
`confirmation-signup.html` both branch on that exact string, so changing it
breaks the message on two pages. It fires `signup_blocked_country` in PostHog.

Two properties worth not breaking, both pinned by
`tests/signup-country-policy.test.mjs`:

- It refuses **before** either KV read, so a blocked attempt costs nothing.
- It **fails open** on an unknown country. `getCountry()` returns null when
  `request.cf` is unavailable; blocking on null would refuse every signup on
  earth the day that happens.

Login is a different Worker, so existing accounts - including a paying
customer's team in one of those countries - are unaffected. The rationale, the
numbers and the caveats are in `docs/geo-block.md`.

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
