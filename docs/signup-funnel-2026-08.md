# The signup funnel — where the ~378 go

**Date:** 2026-08-31 · **Source:** PostHog 263837, last 30 days, unique users.

Started from a web-analytics gap (1,022 hit `/sign-up`, 546 hit
`/confirmation-signup`) and measured it on the real events instead. The page
event count is close (1,027) but the outcome is better than the pageview proxy
suggested: **`/confirmation-signup` undercounts because Google signups land
there differently.** Real completion is 649/1,027 = **63%**, not 53%.

## The funnel

| step | users | of page views |
| --- | --- | --- |
| `signup_page_viewed` | 1,027 | — |
| `signup_google_clicked` | 573 | 55.8% |
| `signup_email_method_selected` | 199 | 19.4% |
| **chose neither** | **255** | **24.8%** |
| `signup_form_submitted` (email only) | 175 | — |
| `signup_success` | 649 | 63.2% |
| `signup_failed` | 38 | 3.7% |

Split of the ~378 lost:

| where | lost | share of loss |
| --- | --- | --- |
| never clicked either button | ~255 | **67%** |
| inside the Google OAuth round trip | ~99 | 26% |
| abandoned the email form after choosing it | ~24 | 6% |
| genuinely blocked by an error | ~8–14 | 3% |

## Errors are not the leak

Of the 38 users who hit `signup_failed`, **24 later signed up successfully, 11
later logged in, and 27 went on to run an enrichment.** Most recover. Fixing
errors would win single digits.

## By device

| device | viewed | chose a method | success | rate |
| --- | --- | --- | --- | --- |
| Desktop | 757 | 562 | 499 | 65.9% |
| Mobile | 270 | 173 | 148 | 54.8% |

Mobile is 11 points worse, but desktop still loses 26% before any click. The
"chose neither" loss is broad, not one broken layout — so it is an intent,
trust, or expectation problem on the page, not a bug to find.

## What was actually wrong in the code

`signup_failed` fired with `reason: 'server_error'` at the **top** of the
non-ok branch, before anything had been read off the response. So an address
that was already registered, a Gmail redirect, a blocked consumer domain and a
genuine 500 all recorded as `server_error`. That is why 59 of 61 failure events
carried that one reason and the bucket could not be acted on.

Fixed in `sign-up.html`: the response is parsed and classified first, then
reported once with the real reason and the HTTP status —
`already_registered` · `routed_to_google` · `consumer_domain_blocked` ·
`server_error`.

Two branches have **never fired in this project's history**:
`signup_routed_to_google` and `signup_blocked_consumer_domain`. The worker does
not appear to return `use_google_signin` or `business_email_required` at all, so
that handling is dead code. The worker is not in this repo and the Cloudflare
connector is unauthenticated in this session, so that is unconfirmed.

## What to do next, in order

1. **Watch session replays of the 255.** Session replay is enabled on this
   project. Ten recordings of people who fired `signup_page_viewed` and no
   method event will answer in an hour what no amount of querying will.
2. **Then act on the page.** Two thirds of the loss is people not starting. That
   is copy, proof, and what the page asks for — not a bug.
3. **Re-read the failure reasons in a week**, now that they are classified.
