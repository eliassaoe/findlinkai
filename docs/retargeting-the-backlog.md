# Why the campaign is sending 38 emails, and what actually unlocks the list

23 Aug 2026. Written because the instinct — "we have thousands of people who
used the site and we gave up on them" — is correct, and the proposed fix
(more sending domains) is aimed at the wrong constraint.

## What is actually running

Nine workflows are live in PostHog. They were created on 21, 22 and 23 August,
so they are two days old. Since going live they have sent **38 emails**:

| sent | delivered | opened | clicked | bounced | unsub | conversions |
|---:|---:|---:|---:|---:|---:|---:|
| 38 | 35 | 15 | 5 | 3 | 1 | 4 |

That is a 43% open rate and four conversions off 38 sends. The copy works. The
machine is not broken. It is simply new, and it is pointed at the wrong half of
the audience.

## Constraint 1: event triggers cannot reach anyone who already signed up

Eight of the nine live workflows are **event-triggered** — `signup_success`,
`credits_exhausted`, `plan_selected`, `pricing_modal_opened`, `enrich_started`.
An event trigger fires when the event happens. It does not backfill.

So every one of them only ever reaches people who do something *from now on*.
Going forward that is real volume — roughly 500 signups, 110 pricing views and
400 enrichments a month, so the flows will settle around 800–1,000 sends a
month on their own. But it is all future traffic.

The 6,578 people already registered are invisible to it. They signed up in the
past; the trigger already didn't fire. Nothing in the event-driven set will ever
mail them.

## Constraint 2: the one thing that can reach them has never been dispatched

Workflow 4, the win-back, is a **batch** trigger, not an event trigger. Its own
description says it: *"Batch triggers do NOT fire on enable: dispatch
deliberately with `workflows-run-batch`."*

It is marked active. It has never been run. The three waves are built and
sitting there:

| cohort | id | people |
|---|---|---:|
| Wave A — 6+ lookups | 505122 | 147 |
| Wave B — 3 to 5 lookups | 505123 | 246 |
| Wave C — 1 to 2 lookups | 505125 | 520 |

913 people, already segmented by engagement, already scrubbed of internal and
disposable addresses, waiting on one command that was never given.

And the waves are only the people who *used* the tool. The bigger silence:

| segment | people |
|---|---:|
| registered | 6,578 |
| ever ran an enrichment | 1,347 |
| **signed up, never ran anything** | **~5,231** |

Five thousand people created an account and never got a single email about it.
There is no cohort or workflow covering them at all.

## Constraint 3: a `signup_method = google` filter on eight of nine workflows

Every event-triggered workflow carries this in its trigger:

```
{"key":"signup_method","type":"person","value":["google"],"operator":"exact"}
```

Anyone who signed up with email and password is silently excluded. Over the
last 120 days:

| signup_method | people |
|---|---:|
| google | 1,395 |
| **email** | **429** |
| (not set) | 7 |

That is 23% of all signups getting nothing, permanently, with no error anywhere.
Among users engaged enough to enrich, exhaust credits or open pricing in the
last 90 days, 299 are `email` and 124 have the property unset — so **423 of the
most active users are filtered out** of every lifecycle email.

There is already a separate `email_verified is_not false` gate on all of these,
which is the check that actually matters. The google filter is doing no safety
work the verification gate isn't already doing.

## Constraint 4: the Instantly fleet is dead, and it is the wrong tool here

37 inboxes across 15 domains — `linkfinderai-sales.com`,
`linkfinderai-outbound.com`, `linkfinderai-partnerships.com`,
`get-unlimited-leads.com`, and the rest. **Every single one reports
`status: -1` with `autofix_failed: true`.** Many carry explicit auth failures
(`EAUTH — can't create new access token for user`); one is hard-blocked by
Gmail for exceeding its daily sending limit.

So: adding more domains would be adding to fifteen domains that already send
nothing, while still paying for them.

More importantly, domain count is the wrong lever for this list. These 6,578
people **signed up on linkfinderai.com**. Mail to them is first-party, and it
should come from `support@linkfinderai.com`, which is already verified with
DKIM, SPF and DMARC resolving. The repo's own deliverability note says exactly
why:

> Do not send lifecycle mail from `linkfinderai-outbound.com`,
> `linkfinderai-sales.com`, or any of the other cold-outreach lookalike domains.
> To someone who signed up at linkfinderai.com, a mail from a lookalike domain
> reads as phishing.

The many-domains playbook exists to spread *cold* volume across inboxes that
strangers will mark as spam. On a list that opted in, it converts a warm
first-party relationship into something that looks like a phishing run, and it
throws away the one asset that makes these emails open at 43% — the fact that
they recognise the sender.

The real constraint on sending to your own list is domain reputation and list
hygiene, and `linkfinderai.com` is nine days into having any sending history at
all. 913 dormant addresses that have never been contacted will bounce harder
than live traffic does. That is precisely why the three waves exist.

## What actually unlocks the money

1. **Drop the `signup_method = google` filter** from the eight event workflows.
   One property edit per workflow. Immediately widens every flow by ~23%, and
   by more among engaged users. `email_verified` stays as the real gate.
2. **Dispatch win-back wave A** (147 people). Watch bounce and complaint rates
   for 48h — stop above 2% bounce or 0.1% complaints. Then B, then C, several
   days apart. This is the only lever that reaches the existing list at all.
3. **Build the missing cohort**: signed up, never enriched, not internal, not
   disposable. ~5,231 people with no coverage anywhere. Different copy — "you
   tried it" is false for them. Wave it the same way.
4. **Fix or shut down Instantly.** Fifteen domains and 37 inboxes are either
   costing money for nothing or need reconnecting for genuine cold outreach.
   Either is fine. Paying for dead infrastructure is not.

Sequencing note: workflow 1 recovers abandoned checkouts, and checkout is the
thing that is broken (`docs/appsumo-100-paid.md`). Driving recovered buyers back
into a checkout that loses 38 of 50 people wastes the best list we have. Fix
checkout first, or at minimum point the recovery email at a payment link that
is known to work.
