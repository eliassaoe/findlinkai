# Signup refusals — what each one is, and where it sends the person

**Date:** 2026-10-04 · **Source:** PostHog 263837, `signup_failed`, last 30 days.

## The 403s are the country restriction, not bot protection

52 people got `403` on the email form between 22 Sep and 4 Oct. All of them
were in IN, PK, BD, PH, TH, BR, MY, TR, KG and UG. Every email signup that got
through in that window came from the US, Europe or Japan. So the 403 is the
live signup Worker refusing by country.

That restriction is **intentional** and is staying. It is not in
`workers/signup/worker.js`. That copy is stale: the live Worker was changed in
the Cloudflare dashboard around 22 Sep. n8n never sees these requests. Railway's
HTTP log for the signup webhook shows 200s, and no 403s.

It covers **Google signups too**. `confirmation-signup.html` posts to the same
Worker. Google signups from those countries went from 289 (1–22 Sep) to 1
(23 Sep – 4 Oct), while 165 people still reached `/confirmation-signup`. Nobody
saw this because the Google page never reported a failure.

## What was wrong, and what changed

| refusal | before | now |
| --- | --- | --- |
| 403 country, email form | `reason: server_error`, "Failed to create account. Please try again." 39 of 52 then tried Google and were refused again | `reason: geo_restricted`. Says plainly that new accounts can't be created from their region, **Google included**, with links to log in and to support@ |
| 403 country, Google | Headed **"Account Already Exists"**, body `Server error: 403 - …`, nothing sent to PostHog | Headed "Sign-up not available in your region", same message, `signup_failed {method:'google', reason:'geo_restricted'}` |
| 429 (3 accounts / network / 24h) | `reason: server_error`, "Too many accounts created from this network." with no next step | `reason: rate_limited`. Gives hours to wait, another network, log in, and support@ |
| any other Google failure / timeout | "Account Already Exists" heading, untracked | Neutral heading, tracked as `server_error` / `session_error` / `timeout` |

## The two refusals that already lead somewhere (no change)

- **Gmail on the password form → Google** (`routed_to_google`, 23 people): 18
  clicked Google afterwards, and 18 ended up with an account or logged in.
- **Consumer mailbox blocked** (`consumer_domain_blocked`, 8 people): 7 came
  back with a work email (5) or used Google (2).

`tests/signup-refusals.test.mjs` pins all of the above.

## If the country list changes

The list lives only in the live Worker. The pages key off the **403 status**,
not a country list, so they need no change. Before trusting this repo's
`workers/signup/worker.js`, paste the live source back into it.
