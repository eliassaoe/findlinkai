# Our own GTM agent: what to build, and what not to build first

Written 2026-09-06, after reading `workers/explee-autogtm/` (README, BASELINE,
SENDING, SOURCES), the AutoGTM clone, and a live check of the Instantly workspace.

**The idea is right. The starting point in it is wrong.**

Building our own agent instead of staying on a vendor is correct, and for a sharper
reason than "we can assemble it": it is the only way to unblock the single biggest
cost lever we have measured. But lead-finding is the part of the funnel that is
already cheapest and already works, and starting there spends weeks on the one thing
that is not broken.

## What already exists — do not rebuild this

`workers/explee-autogtm/` is not a sketch. It has:

- A working Explee API client (`explee.py`) with defensive field reading (`first_of`,
  `ShapeError`) because the response shapes are undocumented.
- **A GitHub Actions loop already running** — `.github/workflows/explee-followups.yml`,
  daily 07:00 UTC, with a dry-run default, an `EXPLEE_APPLY` variable to arm it, a
  manual "Actually send" button, and a `concurrency` group so two runs cannot double-mail
  a lead. The deploy-on-GitHub-and-let-it-run part of the idea **is already built and
  proven.**
- 64 offline tests (`test_explee_autogtm.py`).
- `recover.py` (win-back for replies that never booked), `leadsource_test.py`,
  `followups.py`, `baseline.py`, `instantly_leads.py`, a Sheets bridge.

The new system should be that workflow growing new steps, not a second system beside it.

## The measured reality: leads are not the bottleneck

From `BASELINE.md`, real dashboard numbers for 7 days to 2 Sept 2026:

| | |
|---|---|
| Emails sent | 5,231 |
| Replies | 55 — **1.05%** |
| Interested | 14 |
| Cost per interested lead | **$11.21** |
| Explee lead cost | **~$0.025** — cheapest of eight sources reviewed in SOURCES.md |

Two failures, neither of them sourcing:

1. **Deliverability.** 1.05% reply against 3-8% for good cold email, and a prospect
   (Louise Condevaux, foxpilot.io) wrote back *"il faudrait déjà apprendre à envoyer
   des mails qui ne partent pas dans les spams"*. Explee sends from a **shared
   pre-warmed pool** as `Brian Carter <b@usetidegrove.com>` — not our domain, not our
   reputation.
2. **Interested -> booked.** 14 interested, 1 booked. `docs/outbound-angle.md` records
   the same failure at scale: **571 interested, 0 meetings.** `BASELINE.md` computes
   that the $50-per-call target is exactly a 22% interested-to-booked rate — the
   variable worth 2x-5x, and the one nobody is instrumenting.

Swapping in a better lead source moves $0.025. Fixing placement and booking moves the
other $11.19.

## Why building our own actually is the right call

`SENDING.md` is the argument, and it is stronger than the original framing:

> **Explee's "your own mailboxes" mode is not live.** Explee, asked directly on
> 2 Sept 2026: *"That option is visible in the app but isn't live — picking it only
> records your interest."*

So on Explee, moving off the shared pool is **blocked by their roadmap, indefinitely**.
Building our own agent routes around it: use Explee as a *lead data API* and send
through Instantly on our own warmed domains. That is not a preference, it is the only
available path to the biggest lever.

Explee supports this — it has standalone search/enrich endpoints independent of its
campaign product:

```
POST /public/api/v1/search/nl-to-filters      # plain-English ICP -> filter shape, free
POST /public/api/v1/search/people             # 1 credit/person, 1.5 if email found
POST /public/api/v1/search/people-by-domains
POST /public/api/v1/find-and-enrich
```

`explee.py` already wraps all of them.

## Live check of our sending capacity — read before planning volume

Instantly workspace, checked 2026-09-06. **Nine mailboxes across three domains**
(`linkfinderai-outbound.com`, `linkfinderai-contact.com`, `linkfinderai-with.com`):

- `stat_warmup_score: 100` and `warmup_status: 1` on all nine — warmup is healthy.
- Tracking domains `CTD_ACTIVE` on all nine.
- **`status: -1` on all nine.** In Instantly, 1 is active; -1 is not. **Verify these
  are actually sendable before building anything on them.** Nothing in this plan works
  if the accounts are disconnected.
- `daily_limit: 15` each, `warmup.limit: 12`, `sending_gap: 5`.

**Capacity: 9 x 15 = 135 emails/day, ~4,050/month.** Explee pushed 5,231 in *seven
days*. So our own infrastructure is roughly 5x smaller — and that is the plan's
central bet:

| | Explee shared pool | Ours, if placement fixes reply rate |
|---|---|---|
| Sends/week | 5,231 | ~945 |
| Reply rate | 1.05% (measured) | 4% (assumed — **unproven**) |
| Replies/week | 55 | ~38 |
| Interested/week (25% of replies) | 14 | ~9 |

**We would send 5.5x less mail for ~35% fewer interested leads, at a fraction of the
cost** — and only if the reply rate really does move. That assumption is the whole
plan and it is worth testing on 200 emails before buying more inboxes. If placement
does not lift the reply rate, add inboxes (Zapmail/Mailforge ~$3.25-4 each, per
SENDING.md) rather than abandoning the approach.

## Architecture

One engine, two lead sources, one reply loop.

```
                B2B                         INFLUENCER
        Explee /search/people          Exa Websets (AutoGTM's path)
        firmographic, $0.025           open-web footprint
                 |                              |
                 +--------------+---------------+
                                |
                    LinkFinder email resolution
              (docs/patches/autogtm-linkfinder-email.patch)
                    verified / unverified flag
                                |
                        verified only -> send
                                |
                    Instantly: our 9 warmed mailboxes
                                |
                        reply loop + booking tracker
                                |
                     GitHub Actions, already built
```

The dual-audience part of the idea is the cleanest piece. AutoGTM's creator-shaped
schema (`total_audience`, `content_types`, `promotion_fit_score`) that made it a poor
B2B tool is **exactly right for the influencer half**, and Explee's firmographics is
exactly right for the B2B half. Two sources, one schema union, one sending and reply
engine. That is a coherent product, not a compromise.

## Does "a fraction of the cost" hold up? Yes — about 4x, and here is the arithmetic

The stack is: **Explee's search API for leads + our own AI for the copy + Instantly for
sending.** Costed against `SOURCES.md` and `SENDING.md`, per lead in a 4-email sequence:

| | Explee end-to-end | Ours |
|---|---|---|
| Lead (search + enrich) | $0.025 | **$0.025** — same API, same price |
| Copywriting | included | **~$0.003** (4 LLM generations) |
| Sending, 4 emails | $0.12 (4 x $0.03) | **~$0** — Instantly is a flat subscription |
| **Per lead** | **$0.145** | **~$0.037** |

`SOURCES.md:54` already carries the left column: *"Explee $0.025 + $0.12 = $0.145 per
lead"*. So this is not a new estimate, it is the repo's own number with the $0.12
removed. **3.9x cheaper**, and the saving compounds with sequence length because every
follow-up costs Explee another $0.03 and costs us another fraction of a cent.

At Explee's measured volume of 5,231 emails/week, sending alone is **$627/month**.
The same volume on our own inboxes needs ~50 mailboxes at $3.25-4 (Zapmail/Mailforge,
per SENDING.md) = **$160-200/month, fully managed**, on domains only we use. Cheaper
*and* it is the placement fix.

**That is the strongest version of the argument: the cost saving and the deliverability
fix are the same move.** We are not trading quality for price.

### The catch is throughput, not cost

We have **9 inboxes at 135 emails/day**. Explee was doing **747/day**. Scaling fast is
therefore a purchasing decision, not an engineering one: ~50 inboxes to match, ~$180/mo,
and they need 2-3 weeks of warmup before they carry full volume. Order them early —
warmup, not code, is the long pole.

Do not skip warmup to go faster. Sending cold from unwarmed inboxes is worse than the
shared pool we are leaving, and it is the one mistake that cannot be undone with money.

## The AGPL constraint — decide this before copying code

AutoGTM is **AGPL-3.0 with a real LICENSE file** (see `docs/autogtm-evaluation.md`).
"Take what we can from this repo" has two very different meanings:

- **Copy its code** -> our system is an AGPL derivative. Internal use is fine.
  Shipping `docs/ai-sdr-offer.md` on it means publishing our source, LinkFinder
  integration included.
- **Copy its design** — the sweep pattern, the fit-score gate, the digest, the
  creator schema — and write our own. No obligation.

Given the ambition here is our *own* system, **re-implement, do not vendor.** The
valuable parts are a few hundred lines of prompt and schema design, not the plumbing,
and the plumbing is the part we already have in `explee-autogtm/`.

## "Runs non-stop" — split the loop

Non-stop is right for one half and wrong for the other.

- **Sending: never continuous.** 135/day is a hard ceiling set by warmup, and
  exceeding it is how domains burn. Daily batch, respecting `daily_limit` and
  `sending_gap`, is correct.
- **Replies: as close to continuous as we can get, and this is where the money is.**
  `BASELINE.md`: hot leads go cold in 24 hours, and Jérôme BLAZY sat three days in
  *Needs reply* before booking. The current loop is daily and the README defends that
  as a human cadence — but that argument was written when the constraint was Explee's
  inbox. If we own the inbox, a **15-30 minute reply poll** costs nothing and directly
  attacks the 22% booking rate the whole $50 target rests on.

GitHub Actions supports both: keep the daily send job, add a short-interval reply job.
Actions' cron is best-effort and can be delayed under load — fine for replies, and a
reason not to build anything time-critical on it.

## Order of work

1. **Verify the nine mailboxes are sendable** (`status: -1`). Blocks everything.
2. **Top up the Explee balance.** It is **-$46.32**, and Explee 402s every request
   including free-tier ones. Nothing in `explee-autogtm/` can run until this is fixed.
3. **Placement test, 200 emails**, our mailboxes vs the Explee baseline, same copy.
   This tests the assumption the whole plan rests on, for about $6.
4. **Instrument interested -> booked.** It is not on any dashboard and it is worth
   2x-5x on cost per call. Cheapest possible version: a column, filled in by hand.
5. **Then** build the send/reply engine on our own mailboxes, reusing
   `explee-autogtm/`'s client, tests and workflow.
6. **Then** add the influencer source. It is the fun part and it is fifth.

Steps 1-4 are days, not weeks, and any of them could change what gets built in 5.

## Open questions

- Are the nine accounts actually disconnected, or is `-1` benign in this API version?
- Does the reply rate move on our own domains? Everything hinges on it.
- Who is the influencer half actually for — LinkFinder promotion, or a service we sell?
  `docs/traffic-capture-verdict.md` and `docs/ai-sdr-offer.md` point different ways.
