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
| all three fire, no `checkout_payment_page_opened` | navigation was issued and Dodo's page did not load | **then the Dodo ticket is right** - send it |

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
