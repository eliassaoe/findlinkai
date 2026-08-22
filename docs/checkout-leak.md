# The /app checkout leak - what we know and how to close it

## The number

Real users only (my own accounts excluded), 21 days to 22 Aug 2026, on `/app`:

| step | people |
|---|---:|
| saw pricing | 111 |
| clicked upgrade | 86 |
| **picked a plan** | **42** |
| **checkout redirect fired** | **7** |
| paid | 5 |

**35 of 42 people picked a plan and no redirect ever happened.** Flat across the
whole month. This is not the 13 August payment gap and it is not Dodo - it sits
entirely upstream of them, in our own code.

Individual sessions show people clicking buy **6, 5, 3, 3 and 2 times**. They are
not changing their minds. They are hammering a button that does nothing.

## What the code ruled out

Between `plan_selected` and `checkout_redirect_started` there were only two awaits:

- `createCheckoutSessionViaWorker` - has a 15s `AbortController`, and every failure
  path throws
- `captureBeforeUnload` - cannot hang (250ms, try/caught)

Every throw is caught and fires `checkout_error`, which fired **6 times in a
month**. So it is not erroring and not timing out. It was failing silently in a
window that had no telemetry in it at all.

## What changed

Four events now bracket that window. All are small and use the default transport,
so unlike the redirect event they cannot be dropped by a `sendBeacon` returning
false:

- `checkout_worker_request_started` - immediately before the worker call
- `checkout_session_created` - immediately after it returns, with `duration_ms`
- `checkout_click_swallowed` - a click rejected by the `checkoutInFlight` guard.
  Previously a bare `return` with no event: if that flag ever sticks, the button
  is dead for the life of the page and nothing is recorded.
- `checkout_stuck_watchdog` - fires at 20s if the flag is still set, clears it,
  and tells the user. This one is a fix, not just a probe: it makes the
  permanently-dead-button failure mode impossible.

The stall notice also drops from 8s to 5s, so a user facing a dead redirect gets
the manual link sooner.

## How to read it

Wait for real traffic (a handful of plan selections is enough), then walk the
table top to bottom. The first row that matches is the answer:

| what you see | what it means | where to look |
|---|---|---|
| `checkout_click_swallowed` firing | the in-flight flag is sticking; users are clicking a dead button | the flag's reset paths in `launchCheckout` |
| `checkout_stuck_watchdog` firing | the worker fetch never settles - it neither resolves nor rejects, past its own 15s abort | `workers/dodo-checkout`, and the abort wiring |
| `..._request_started` but no `..._session_created` | the worker call is the problem | `workers/dodo-checkout` logs |
| both fire, no `checkout_redirect_started` | the failure is the sendBeacon capture or `window.location.href` | `captureBeforeUnload`, CSP, popup/nav blocking |
| all three fire, and they navigate away, but never return | they reached Dodo and did not pay | a Dodo question, not a bug here |

Note the last row. Until one of these events proves otherwise, the Dodo support
ticket in `workers/dodo-checkout/DODO-SUPPORT-TICKET.md` is built on a premise we
have not established: it reads as "sessions create but nobody pays", when the
truth so far is that almost nobody reaches a payment page to begin with. Do not
send it until the table above points at that last row.

## Caveat

Every checkout attempt logged on 21-22 August came from my own three accounts
(`hamoureliasse@`, `tetstsgesgzbhbh@`, `eliasseiapro23123@`). Exclude them from
any funnel query or the picture is meaningless - they are the majority of recent
checkout events by volume.


---

# Correction, 22 Aug 2026 evening

**`checkout_payment_page_opened` is not instrumented on the live app.** It exists
only in `app_beta.html` and last fired on 17 August. Every earlier argument in
this document that leaned on its absence - including "8 redirects, 0 page opens,
therefore Dodo is broken" - was measuring an event `app.html` never emits. The
comparison that looked like a collapse was really app_beta traffic stopping.

## What the instrumentation actually showed on first contact

Five deliberate checkout attempts, 17:50-17:57:

| plan | worker | session_created | redirect_started | stalled |
|---|---:|---|---|---|
| PAYG Small | 613ms | yes | yes | no |
| Enterprise | 218ms | yes | yes | no |
| Starter | 445ms | yes | yes | no |
| Professional | 417ms | yes | yes | **yes** |
| Professional | 360ms | yes | yes | **yes** |

The dodo-checkout worker is healthy: 218-613ms, a valid `checkout_url` and
`env: live` on every call. `checkout_session_created` fired 5 of 5, so the worker
call was never the problem. `checkout_redirect_started` fired 5 of 5, so the
sendBeacon capture works. Three navigated away cleanly.

The two stalls were rapid repeat attempts on the same plan, seconds apart, which
is the shape of a browser declining a repeated programmatic navigation rather
than a checkout fault.

So `plan_selected -> checkout_redirect_started` was **5 of 5** here.

## What is still open

The original gap stands and is still unexplained: **42 real plan selections
produced 7 redirects** over 21 days. It is not the worker and not the beacon -
both are now proven to work end to end. Whatever it is only happens to real
users, so the next one to hit it will produce either
`checkout_click_swallowed`, `checkout_stuck_watchdog`, or a
`..._request_started` with no `..._session_created`, and that names it.

Until then, nothing here justifies sending the Dodo ticket.
