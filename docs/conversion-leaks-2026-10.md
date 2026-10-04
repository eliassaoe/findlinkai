# Where people drop: 30-day funnel read (2026-09-04 → 2026-10-04)

**Source:** PostHog 263837, person-level, `$host = linkfinderai.com`.
**Scope:** allowed (tier-1) countries only. IN, PK, BD, PH, NG, EG, TH, VN, ID,
KE, LK, NP are excluded: the sign-up worker geo-blocks most of them on purpose
(HTTP 403), and they produced 0 payers in the window.

## Read this first: signups did not break

Daily signups fell from ~25 to ~5 on 2026-09-23. That is the geo block, not a
bug. Split by country, the whole drop is IN/PK/BD/PH (IN went 124 signups →
0); US, GB, FR, DE and CA convert as before. Before 09-23, Google signup looked
like it completed at ~33% on desktop. Most of that is bots: 09-10, 09-14 and
09-15 carry ~140 "visitors" with one pageview and one Google click who never
come back. Real desktop Google signup completes at ~70–80%.

Don't "fix" either of these.

## The funnel, tier-1 only

| Step | People |
| --- | --- |
| Visitors | ~4,250 |
| Used a free tool | 1,260 |
| Signed up | 209 |
| Ran an enrichment | 154 |
| Opened pricing / clicked upgrade | 52 |
| Picked a plan | 13 |
| Reached checkout | 11 |
| Paid | 5 (9 abandoned at checkout) |

## Leak 1: the free tool result is the whole job (largest)

| Tool users | People | Signed up |
| --- | --- | --- |
| Got a result, never tried a 2nd lookup | 896 | **19 (2%)** |
| Hit the gate, ignored it | 196 | 3 |
| Hit the gate, clicked its CTA | 81 | **48 (59%)** |

The gate converts. Almost nobody reaches it, because the one free lookup
already gives them what they came for. The post-result spreadsheet offer gets
33 clicks from 838 views (4%).

**Shipped:** experiment `tool-result-reveal-gate`
(<https://us.posthog.com/project/263837/experiments/471663>), in
`js/lf-gate.js`. The `reveal` arm masks the key part of the first result
(`j•••@acme.com`, `linkedin.com/in/j•••`, `+•(•••)•••-••42`) and offers "Reveal
it free". The unmasked values wait in `localStorage.lf_reveal_pending`;
`js/lf-reveal-handoff.js` shows them on the first signed-in `/app` load, so the
promise is kept. `/sign-up` says "Your result is ready" while a value is
pending.

- Exposure (`$feature_flag_called`) fires only when a visitor without an
  account gets a real answer. Not-found results, the visitor's own echoed input
  and bare domains (company-url-finder) are never masked and never exposed.
- Also fixed for both arms: the spreadsheet offer used to fire while the panel
  still showed the spinner, and printed "Searching for professional email..."
  as row 1. It now waits for the answer.
- Primary metric `signup_success` (7d). Secondary: signup → `enrich_started`
  (14d), `checkout_payment_success`.
- The experiment is a **draft**: its flag is off and everyone gets control
  until someone launches it.

## Leak 2: new accounts never run out of credits

Of 208 tier-1 signups, 164 (79%) ran 0–2 enrichments and **10 ever hit the
credit wall**. Average active days: ~2.4. With credits left over, nobody has a
reason to pay. Day one also stacks the onboarding-route chooser (144 shown, 29
picked), the founder-call prompt (103 shown, 12 clicked) and the sales-call
intercept (33 shown, 32 dismissed).

Not changed yet. Next candidates: retire the sales-call intercept for new
accounts (97% dismiss) and get users to a second session. See
`docs/next-step-routing.md` before adding anything to `app.html`.

## Leak 3: pricing → plan → payment

52 opened pricing, 13 picked a plan, 11 reached checkout, 5 paid. Many open
pricing with their 50 free credits untouched (14 people), which is curiosity,
not intent. The checkout numbers are too small to act on yet; watch
`checkout_abandoned` by plan (PAYG Small/Medium are what actually sells).

## Which pages bring payers, and is traffic the lever? (180 days)

First pageview per person, payers = `checkout_payment_success`,
`subscription_upgraded` or `subscription_renewed`.

| Landing page | Visitors | Payers | Per 1k visitors | Google visitors Jul → Sep |
| --- | --- | --- | --- | --- |
| `/` | 5,891 | 10 | 1.7 | 577 → 652 |
| `/linkedin-search-by-email` | 4,988 | 4 | 0.8 | 1,100 → 622 (−43%) |
| `/company-url-finder` | 1,261 | 1 | 0.8 | 217 → 182 |
| `/linkedin-url-finder` | 4,414 | 2 | 0.45 | 561 → 362 (−35%) |
| `/linkedin-email-finder` | 4,928 | 0 | 0 | 1,228 → 630 |
| `/instagram-profile-url-finder` | 6,386 | 0 | 0 | 1,961 → 512 |

- Even the best tool pages produce about one payer per 1,000 visitors.
  Doubling traffic to all of them adds roughly 1–2 payers a month. Traffic is
  not the binding constraint; visitor → payer is (same conclusion as
  `docs/traffic-capture-verdict.md`).
- Payers are API buyers: 22 of ~26 payers in the window viewed `/api-access`,
  against 539 of ~2,500 free signups.
- Alternative / vs pages showed 1 payer from 144 visitors here. That is one
  person; `docs/listicle-aeo-results.md` measured the group at a 1.3% signup
  rate on 1,313 visitors. Do not read it as a winning page type.
- Paid search has barely been tried: 9 paid-click visitors in 180 days.
- The −35–43% drop on the two best tool pages needs Search Console (rankings
  vs clicks) to diagnose. PostHog cannot tell the difference.
