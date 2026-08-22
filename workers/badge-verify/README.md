# badge-verify

Confirms a user really put the LinkFinder badge on their site, with a **followed**
link, before the 1,000-credit task pays out.

```
POST /  {"user_token": "...", "site_url": "https://theirsite.com/"}
     -> {"verified": true, "domain": "theirsite.com"}
     -> {"verified": false, "error": "link_is_nofollow"}
```

## Why it is written defensively

It fetches a URL an untrusted user supplies. That is server-side request forgery
in its plainest form, so:

- scheme allow-list (`http`/`https` only)
- no IP literals in any encoding - dotted quad, IPv6, decimal, hex
- no `localhost`, `.local`, `.internal`, `.lan`, `.home.arpa`, or bare hostnames
- no credentials in the URL
- **every redirect hop is re-validated** - `redirect: 'follow'` would let a public
  URL bounce the worker into private space, so hops are followed by hand
- 512KB read cap and an 8s timeout, so a hostile server cannot hold a worker
  open or feed it an unbounded body
- their own domain only; `linkfinderai.com` is refused, or the task would pay for
  a link we placed ourselves

It holds no secrets and talks to no other service, so even a missed case cannot
reach Supabase or Dodo.

## What counts as followed

An `<a>` whose host is `linkfinderai.com` (or a subdomain) and whose `rel` carries
none of `nofollow`, `sponsored`, `ugc`. `noopener`/`noreferrer` are fine. One
followed link is enough even if other nofollowed ones sit beside it.

Failures are distinguished: `no_link` means the badge is missing, `link_is_nofollow`
means it is there but not passing authority. Those need different fixes, and "not
verified" would be useless feedback for both.

## Payout guards

One claim per account, one per domain (`www.` normalised away), both with a
one-year TTL. A failed check writes nothing, so a user whose site was briefly
down does not lose their claim.

## Deploy

```
cd workers/badge-verify && wrangler deploy
```

Nothing to configure. Then set `BADGE_VERIFY_WORKER` in `app.html` if the
deployed URL differs from `https://badge-verify.hamoureliasse.workers.dev`.

## The thing to be aware of

This task pays credits for a followed link. Google's link spam policy treats
"exchanging goods or services for links" as a link scheme, and credits have a
posted price. Eliasse was told this on 22 Aug 2026 and chose dofollow
deliberately - the alternative offered was `rel="nofollow ugc"`, which carries no
policy risk and keeps the referral traffic. Switching later is a one-token change
in `UNFOLLOWED` plus new copy on `badge.html`.
