# campaign-signup

The signup page for cold-email campaigns, served from a **throwaway domain** so
the link in the email never points at `linkfinderai.com`.

## Why it exists

A link domain that gets reported as spam ends up on URL blocklists. If that
domain is `linkfinderai.com`, every email that mentions it — password resets,
receipts, replies — starts landing in spam, and the site itself can get a
warning in browsers. So the email links to a domain we can afford to lose. It
hosts the whole signup; the visitor only touches `linkfinderai.com` once the
account exists, when they are sent to `/app` with their token.

`linkfinderai.com/100free` still exists and still works (other channels can use
it). It just must not go in a cold email.

## What is in here

| path | what |
|---|---|
| `public/100free.html` | The signup page. Same backends, same form, same error handling as `sign-up.html` on the main site, minus the ad pixels. Every visit gets the `coldemail_1000` gift by default (`?gift=<code>` overrides). |
| `public/confirmation-signup.html` | Where Google sends the browser back. Reads the email off the Supabase session, posts to the signup Worker with `provider:'google'`, sends the visitor to `linkfinderai.com/app`. |
| `public/index.html` | `/` bounces to `/100free`, query string intact. |
| `public/js/lf-attribution.js` | Copy of the main site's UTM capture, so PostHog sees `utm_campaign` on every event here. Re-copy it when the original changes. |
| `public/robots.txt` | `Disallow: /`. Nothing here should be indexed. |
| `worker.js` | Any path that is not one of the files above is redirected to `linkfinderai.com` + same path. No 404s on this domain. |

The credit amount is decided by `GIFT_CREDITS` in `workers/signup/worker.js`,
never here. See `workers/signup/README.md`.

## Deploy

**1. The domain is `linkfinderai-team.com`** (Namecheap, 8 Sep 2026). It is
not an Instantly sending domain and nothing else uses it, so it can be lost
without consequence. Never swap in `linkfinderai.com` or a subdomain of it: a
subdomain shares the root's reputation.

**2. Put the zone on Cloudflare DNS.** A Worker custom domain needs that.
In Cloudflare: Add a domain → `linkfinderai-team.com` → Free plan → note the
two nameservers it assigns. In Namecheap: Domain List → Manage → Nameservers
→ **Custom DNS** → paste those two → save. Propagation is usually minutes,
sometimes hours; Cloudflare emails when the zone is active.

**3. The route is already set** in `wrangler.toml`
(`linkfinderai-team.com`, `custom_domain = true`).

**4. Deploy.**

```
cd workers/campaign-signup
wrangler deploy
```

No secrets, no KV. Wrangler creates the DNS record and certificate.

**5. Allow the Google return URL in Supabase.** Dashboard → Authentication →
URL Configuration → Redirect URLs → add

```
https://linkfinderai-team.com/confirmation-signup
```

Without this the Google button breaks: Supabase ignores an unlisted
`redirectTo` and sends people to the Site URL instead, where nothing finishes
the signup. Gmail users **can only** sign up with Google (the password form
routes them there), so this step is not optional.

**6. Test before sending.** In a private window:

- open `https://linkfinderai-team.com/100free?utm_source=coldemail&utm_medium=email&utm_campaign=icp30k_recruiting&utm_content=e1_credits`
- sign up once with Google and once with a fresh work email
- both should end on `linkfinderai.com/app` with a balance of 1,000
- open `https://linkfinderai-team.com/anything-else` and check it
  lands on `linkfinderai.com/anything-else`

## The link for the email

```
https://linkfinderai-team.com/100free?utm_source=coldemail&utm_medium=email&utm_campaign=icp30k_recruiting&utm_content=e1_credits
```

If Instantly's click tracking is on, the URL the recipient sees is the
`inst.<sending-domain>` tracking domain, which then redirects here. Either way
`linkfinderai.com` never appears in the email.

## Tracking

Every event from this site carries `campaign_site: true`, and `signup_success`
carries `gift: coldemail_1000` plus the UTMs. A funnel of `signup_page_viewed`
→ `signup_success` filtered on `campaign_site = true` is the campaign's
conversion rate.

## Keeping it in sync

This page is a copy of the signup contract, not a shared component. When
`sign-up.html` or `confirmation-signup.html` on the main site change how they
talk to the Worker (fields, error codes, URLs), mirror it here.
