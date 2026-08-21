# Lifecycle email, built inside PostHog

This replaces the Instantly plan that used to live in this file. Instantly stays what
it is good at — cold outreach to strangers. Everything that talks to people who already
have a LinkFinder account now runs on **PostHog Workflows**, because the segments, the
triggers, the sending, and the reporting are all in one place and there is no list to
export, clean, and re-import every month.

Everything below **already exists** in the PostHog project. Nothing sends until you do
the two setup steps in the next section.

## Before anything sends: two steps, both yours

**1. Create the email channel.** Workflows → Channels → New channel → Email.
Set the from-name and from-email. Use **`eliasse@linkfinderai.com`** — the four workflow
drafts are already configured with exactly that address, so matching it means you change
nothing else.

Do **not** send lifecycle mail from `linkfinderai-outbound.com`, `linkfinderai-sales.com`,
or any of the other cold-outreach lookalike domains. To someone who signed up at
linkfinderai.com, a mail from a lookalike domain reads as phishing. They mark it spam,
and the complaint lands on a domain you need for real outbound.

**2. Verify the domain.** PostHog shows SPF and DKIM records after you add the address.
Put them in Cloudflare DNS. If `linkfinderai.com` already has an SPF record, **merge**,
never add a second one:

```
v=spf1 include:existing-service.com include:mailgun.org ~all
```

Verification takes a few minutes to propagate. Green check mark, then you can enable.

**3. (Recommended) Create two message categories.** Workflows → Opt-outs → Message
categories. Make one for **Product & onboarding** and one for **Offers & upgrades**, then
assign each workflow email to the right one. Without categories, an unsubscribe from the
upgrade email also silences the welcome email — which is not what you want. The project
currently has zero categories.

## The four workflows

All four are saved as **drafts**. A draft never runs. Open each one, check the sender is
picked up, use **Test run** (it sends nothing to real people), then enable.

### 1. Checkout recovery — picked a plan, never paid

| | |
|---|---|
| Trigger | `plan_selected` or `checkout_redirect_started` |
| Shape | wait 2h → email → wait 3d → email → exit |
| Guard | conversion goal on every payment event, so a payer never receives either mail |
| Masking | once per person per 7 days |

The first email asks one question — did it break, or was it the price — rather than
pitching. The second offers the pay-as-you-go pack, because "wrong shape" is a more common
objection than "too expensive" and the $25 pack answers it.

### 2. Credit wall — ran out, never saw pricing

| | |
|---|---|
| Trigger | `credits_exhausted` or `bulk_results_gated_shown` |
| Shape | wait 30m → email → exit |
| Guard | conversion goal on payment events |
| Masking | once per person per 30 days |

124 people hit this wall in the last 120 days and never reached a pricing page. This is the
cheapest gap in the funnel to close: they already wanted more.

### 3. New user activation — welcome, rescue, upgrade

This is the big one. **566 people signed up in the last 30 days and 464 of them never ran
a single lookup.** No email has ever gone to any of them.

```
signup_success
  └─ wait 20m ─→ welcome email
       └─ wait up to 1 day for enrich_started
            ├─ ran one  ─→ wait 6d ─→ upgrade email ─→ exit
            └─ timed out ─→ "you haven't run anything" email
                 └─ wait up to 5 more days for enrich_started
                      ├─ ran one  ─→ wait 6d ─→ upgrade email ─→ exit
                      └─ timed out ─→ exit (stop bothering them)
```

The waits are `wait_until_condition` steps on the real `enrich_started` event, not guesses
about who activated. Anyone who pays leaves via the conversion goal. Each person enters
once, ever.

### 4. Win-back broadcast — tried it, went quiet

A batch send, not an event trigger. **It does not fire when you enable it** — you dispatch
it deliberately, which is the correct shape for a one-off broadcast.

It leads with the country-subdomain bug: `fr.linkedin.com`, `in.linkedin.com` and the rest
were being rejected as invalid, so people were told their perfectly good link was wrong.
That is fixed and shipped. An honest, specific disclosure is the only thing that earns a
second try from someone who already walked away.

## Send the win-back in three waves

914 dormant users match. Sending all of them in one blast from a freshly verified domain
is the single fastest way to burn it. Three static cohorts already exist, tiered by how
much the person actually used the tool:

| Cohort | ID | People | When |
|---|---|---|---|
| Win-back wave A — 6+ lookups | `505122` | 147 | First. Most engaged, lowest complaint risk. |
| Win-back wave B — 3 to 5 lookups | `505123` | 246 | After A's bounce and complaint rates look clean. |
| Win-back wave C — 1 to 2 lookups | `505125` | 520 | Last. Weakest intent, highest bounce risk. |

Workflow 4 points at wave A. To send the next wave, open the trigger, swap the cohort, and
dispatch again.

Every cohort already excludes your own addresses (`hamoureliasse`, `eliasseiapro`), the
disposable domains that showed up in the raw list (`mailvn.biz`, `dardr.com`, `onionmail`),
anything with `test` in the address, and anyone who has ever paid. They are **static**
snapshots on purpose: a broadcast should go to a fixed list, and PostHog batch triggers
cannot evaluate behavioural cohorts anyway.

`Win-back — tried LinkFinder, went quiet` (`505119`) is the same segment as a **live**
cohort. It cannot be used for a batch send, but it is the right thing to watch on a
dashboard, and it is what you would rebuild the static waves from next quarter.

There is also a pre-existing `Signed up - never activated` cohort (`346914`, 166 people).
Workflow 3 covers everyone who signs up from now on; that cohort is the backlog, and it
needs its own broadcast with different copy — "you tried it" is false for people who never
did.

## The six email templates

Saved in Workflows → Library. Each workflow carries its own copy of the content, so these
are the editable reference versions — change one here and you can drop it into a step in
the builder with two clicks.

| Template | Used by |
|---|---|
| Checkout — did the upgrade break for you? | Workflow 1, step 1 |
| Checkout — follow-up, price or wrong shape | Workflow 1, step 2 |
| Credit wall — you ran out of credits | Workflow 2 |
| Welcome — your credits are ready | Workflow 3, step 1 |
| Activation — you signed up but haven't run anything | Workflow 3, rescue step |
| Upgrade — you're past the free tier | Workflow 3, final step |
| Win-back — was the result any good? | Workflow 4 |

All of them are plain founder-style mail: short, specific, one question, no graphics. That
register is not a stylistic preference — the seven emails ever sent from the old Instantly
campaign got a 29% reply rate and one $1,000 opportunity writing exactly like this.

Every one carries `{{ unsubscribe_url }}` in the footer and a plain-text fallback.

## One thing to fix in the product

`app.html:1185` tells people *"Starter plan gives 5,000 credits/mo for $49"*, but the plan
array at `app.html:1709` — the one that actually drives checkout — says **60,000**. One of
those two numbers is wrong on a live pricing surface. The credit-wall email quotes 60,000
because that is what the checkout code uses; if 5,000 is the true figure, the email needs
changing too.

## What to watch after enabling

PostHog captures email engagement as ordinary events, so opens, clicks, bounces, and
unsubscribes are queryable alongside everything else. The numbers that decide whether this
is working:

- **bounce rate** — the one that damages the domain. Stop and re-clean if it goes above 2%.
- **complaint rate** — above 0.1% and you pause.
- `enrich_started` within 48h of the welcome or rescue email — does workflow 3 actually
  move the 464?
- payments attributed to workflow 1 — the abandoned-checkout money is the most recoverable
  revenue on the list.
