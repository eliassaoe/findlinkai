# Deliverability: do we need email verification?

Short answer: **yes, but not at signup, and not with a verification API first.**
The cheap fixes get most of it, and the expensive one is only worth it for the
blasts.

## The threat, stated precisely

Amazon SES sits behind PostHog email. SES puts an account under review at a
**5% hard-bounce rate** and suspends sending above it. `linkfinderai.com` is a
brand-new sending domain with no reputation, which is the worst position to be in
when a bounce spike lands: there is no history to absorb it.

The danger is not the steady drip. SES and PostHog suppress an address
automatically after its first hard bounce, so a bad address costs you exactly one
bounce, ever. The danger is a **large first send to a backlog of old, never-tested
addresses** — which is precisely what the win-back broadcast is.

## What the data actually says

Every distinct signup address in the last 180 days, bucketed:

| Bucket | People | Share |
|---|---|---|
| Free consumer (gmail, outlook, yahoo…) | 1,365 | 75.7% |
| Business or other | 410 | 22.8% |
| **Suspicious local part** (`test…`, `asdf…`, `fake…`) | **21** | **1.2%** |
| **Junk TLD** (`.xyz`, `.buzz`, `.click`) | **5** | **0.3%** |
| **Malformed** | **1** | **0.1%** |

So ~1.6% is *obviously* junk by pattern. That is comfortably under 5% — but
pattern matching only catches the careless fakes. It cannot see
`jonh@gmail.com` (a typo), or a real-looking address at a domain with no mailbox.
The true bounce rate is unknown until we send, and it is certainly higher than 1.6%.

**The root cause is architectural.** `sign-up.html` posts to the signup worker,
gets a token back, and redirects straight to the dashboard. There is no
confirmation email and no verification step — anyone can type anything and get a
funded account. `confirmation-signup.html` exists but is not in this path.

## The gate that is now live

Every one of the six workflows carries a trigger filter: **person property
`email_verified` `is_not` `"false"`**. An explicitly-unverified address cannot
enter any campaign.

The filter is `is_not false` rather than `is true` on purpose. Accounts created
before this existed have no such property at all, and `is true` would have
silently emptied every campaign of its entire existing audience. `is_not false`
lets legacy accounts through and blocks only addresses we have positively
identified as unconfirmed.

| Workflow | version | filter live |
|---|---|---|
| 1. Checkout recovery | 12 | yes |
| 2. Credit wall | 7 | yes |
| 3. New user activation | 17 | yes |
| 4. Win-back broadcast | 7 | yes (alongside the cohort) |
| 5. Pricing → call | 5 | yes |
| 6. API / MCP | 3 | yes |

Note the mechanic: these workflows are active, so a patch stages a **draft** and
changes nothing until `workflows-publish` with `confirm:true`. Patching without
publishing looks like it worked and does nothing.

## Done already

**27 addresses suppressed project-wide** via PostHog's opt-out list, so no
workflow can ever send to them. Reversible with `opt-outs-remove`. Notable
entries: `rpjkkk@gmaill.click` and `bjhkl;@gma.com` are typo-squats of gmail.com
that would hard-bounce; the rest are `test*@gmail.com` style addresses, most of
them almost certainly our own.

## What to do, cheapest first

**1. ~~Block at the form.~~ CORRECTION: most of this already exists.**
Reading the deployed `linkfinderai-sign-up` source showed it already blocks
disposable domains server-side against a `DISPOSABLE_DOMAINS` KV namespace,
already normalizes Gmail dots and plus-addressing, and already rate-limits to
three accounts per IP per day. My recommendation here was redundant and I had no
business making it without looking first.

What is genuinely still missing is the **typo catch** — `gmaill.click`,
`gma.com`, `d.com` all got through, because they are not disposable domains, they
are near-misses on real ones. A "did you mean gmail.com?" prompt on the signup
form is the remaining win, and it recovers real people who never got their
account rather than just blocking junk.

**2. Don't treat all sends as equally risky.**
A fresh signup's address was typed minutes ago and is low-staleness, so the drip
campaigns are relatively safe even without verification. Old addresses in a
cohort are the risk. Send accordingly.

**3. Verification API — for the blasts only.**
Verifying every signup costs money forever and mostly re-confirms gmail addresses
that were fine. Verifying the ~913 dormant win-back addresses once, before
dispatching to them, targets the spend exactly where the risk is. Do not route
customer emails through a third-party cold-email tool to do it.

**4. Confirm the email — BUILT.** See `workers/verify-email/README.md`. Password
signups are capped at 10 credits and excluded from marketing until they confirm;
Google signups (76% of all signups) are unaffected. The client half is shipped
and inert until the credits worker returns `email_verified`.

## The gate on the win-back broadcast

Workflow 4 is **enabled but deliberately not dispatched**. Batch triggers do not
fire on enable; sending is a separate `workflows-run-batch`. Do not run it until:

1. The live drip campaigns have produced real `$workflows_email_bounced` data, and
2. That bounce rate is under 2%.

Then dispatch **wave A only** (147 people, cohort 505122), check the bounce rate
again, and only then repoint the trigger at wave B (505123) and wave C (505125).
Three smaller sends with a check between them is the difference between finding a
problem at 147 addresses and finding it at 913.
