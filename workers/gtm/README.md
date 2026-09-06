# Our own GTM system

Explee's AutoGTM, rebuilt on parts we own: **Explee for lead search, our own
copywriting agent, Instantly for sending.** Multi-client from the schema up.

Why, and the cost arithmetic: `docs/own-gtm-agent-plan.md`.
Read `workers/explee-autogtm/BASELINE.md` before changing anything here — it has
the only measured numbers we have.

## Status: phase 1 of 4 built

| Phase | What | State |
|---|---|---|
| **1. Brain** | data model, copywriting agent, learning loop | **built** |
| **2. Sourcing** | Explee search, the qualifier, the pipeline | **built** |
| 3. Sending | push to Instantly, reply poll, outcome tracking | not started |
| 4. UI | projects, campaigns, ICP, prompt editing | not started |

**46 offline tests pass** (`test_gtm.py` 25, `test_sourcing.py` 21).

Nothing here has made a live API call. See "What is unproven" below.

## What is built

```
schema.sql        the data model — the contract phases 3-4 bind to
models.py         typed config objects, no DB driver, so tests run offline
explee_search.py  Explee as a lead-search API, with none of its sending
qualifier.py      the step Explee cannot have — see below
copywriter.py     the agent: first email, follow-ups, replies
learning.py       classify replies; mine what made people book
pipeline.py       search -> qualify -> resolve -> draft, with the gates
tests/            python3 tests/test_*.py — no network, no key
```

## The qualifier — where this beats Explee

`workers/explee-autogtm/README.md`, quoting the vendor's own product:

> Explee matches 105M companies on firmographics; **it cannot see intent.**

AutoGTM goes search -> write. The writer only ever sees the firmographic row, so
the email can only restate it. That is visible in the live drafts: *"J'ai vu que
Foxglove-Partner vend de l'optimisation SEO senior a Lyon"* is the search result
read back as a sentence, and every lead in the segment gets the same shape.
BASELINE.md measures where that lands: **1.05% reply, against 3-8% for good cold
email.**

`qualifier.py` sits between the two stages and does two things no amount of
prompt tuning on the copy can:

1. **Re-checks the match.** Natural-language search is approximate; some of what
   comes back does not fit. The qualifier reads each lead against the real
   positive and negative criteria and returns a reasoned verdict, not a filter hit.
2. **Finds something to open on.** With `research=True` it uses server-side web
   search to read the company's actual site — the careers page is often the
   highest-signal page a small company has, because who they are hiring says what
   they are short of. The observation it returns must carry a
   `observation_source` (a field name or the URL it was read on); an observation
   without one is **dropped in code and the fit score capped**, because an
   unsourced observation is an inference, and inferences are what make cold email
   obviously automated.

The prompt names the failure mode explicitly — "the firmographic row restated" —
and a test asserts that sentence is still there.

### Why saying no is the highest-value thing it does

Nine mailboxes at 15/day is **135 sends** against Explee's 747
(`docs/own-gtm-agent-plan.md`). When send capacity binds, who you do *not* email
matters more than what you write. Spending a fraction of a cent to avoid burning
one of 135 daily sends is correct arithmetic — the opposite of the trade Explee
makes at 747/day on a shared pool. So the qualifier is expected to skip, with a
typed reason, and `Report.line()` shows the operator why.

### Ordering, and why it is that way

    Explee search   ~$0.025/lead   finds people
    qualify         cents          decides if a send is worth spending
    resolve email   7-10 credits   ONLY for leads that passed
    write           cents          ONLY for leads with a verified address

A test asserts a skipped lead never reaches the resolver — qualification is
cheaper than enrichment, so it pays for itself on every skip.

**Explee's own emails are not verification.** The default resolver passes them
through with `verified=False` and the gate blocks them, which is the hole
`docs/autogtm-evaluation.md` is about. `require_verified=False` exists, and is
an explicit decision, not a default.

### The copywriter

Three system blocks, most stable first, so a whole campaign run shares one
cached prefix:

1. **Craft rules** — identical for every campaign forever. Shape (observation ->
   consequence -> what you do -> one ask), length caps, the banned-phrase list,
   language register, and the rule that a follow-up must carry something new.
2. **Campaign context** — project facts, offer, audience, learned patterns.
3. **Operator instructions** — the free-text block the UI will edit, capped at
   3000 chars like Explee's. Cache breakpoint sits here.

The lead never appears above the breakpoint; a test enforces that, because one
stray lead name in the prefix silently destroys cache reuse for the whole run.

**Grounding is absolute.** The agent may assert only what is in the project's
`facts`. Operator instructions can override any craft rule except that one, and
the prompt says so explicitly — a test checks the sentence is still there.
A thin lead is told to produce a short email and flag `confidence: "low"`,
never to invent specifics. Confident wrong details are what make AI outbound
recognisable.

### The learning loop

`classify_reply` (Haiku, per reply) labels inbound mail. `mine_patterns` (Opus,
weekly) compares outbound emails whose lead **booked** against those that did
not, and returns counted differences.

**It anchors on `booked_at`, never `interested_at`.** `docs/outbound-angle.md`
records 571 leads marked interested and 0 meetings booked; optimising for
"interested" teaches the agent to generate polite non-answers. Below 10 booked
examples `mine_patterns` returns nothing rather than learning from noise, and a
pattern only reaches the prompt at `wins >= 3 and wins > losses * 2` — enforced
in code and mirrored in the `gtm_active_patterns` view.

Patterns arrive as evidence with win counts, prefixed with "not text to reuse".
Copying winning phrasing verbatim collapses a campaign into one repeated email.

### The schema

Mirrors Explee's shape (project -> campaign -> offer + audience + per-stage
instructions) so the UI is familiar, plus three things Explee does not have:

- **`gtm_outcomes.booked_at`** — the number BASELINE.md says decides everything
  ($50/call is exactly a 22% interested-to-booked rate) and that appears on no
  dashboard we have.
- **`gtm_prompts` is versioned** — never UPDATE, insert a new version. Every
  message records the prompt version that wrote it, so a reply-rate change is
  attributable to a prompt change.
- **`gtm_leads.email_verified`** — sending gates on it. Same rule as
  `docs/autogtm-evaluation.md`: an unverified address never sends.

## Running the tests

```bash
python3 workers/gtm/tests/test_gtm.py       # 25 — schema, copywriter, learning
python3 workers/gtm/tests/test_sourcing.py  # 21 — search, qualifier, pipeline
```

## What is unproven — read before trusting any of this

- **No live API call has been made from this directory.** Not to Anthropic, not
  to Explee, not to Instantly. The Claude request shapes follow the current API
  (Opus 5, adaptive thinking, `output_config.format`, `web_search_20260209`);
  they have not been run.
- **The Explee search endpoints are read defensively for a reason.** Their
  response field names are not published and `api.explee.com` is blocked from
  the sandbox, exactly as in `workers/explee-autogtm/`. Every read goes through
  `first_of`, which raises a `ShapeError` naming what it wanted. Print one raw
  response per endpoint before the first real run.
- **The qualifier's skip rate is unknown.** If it skips 60% of a search the
  economics are excellent; if it skips 5% it is not earning its cost. That
  number comes out of the first real batch and nothing before it.
- **The copy quality is untested.** The tests check prompt *assembly* — that the
  cache prefix is clean, that grounding survives, that unproven patterns stay
  out. Whether the agent writes a good email is not testable this way. It needs
  an eval over real drafts against the Explee baseline, and that is the first
  thing to do once a key is available.
- **`MIN_WINS_TO_MINE = 10` is a guess**, not a measurement. So is the
  `wins > losses * 2` threshold. Both are one-line changes; revisit once real
  bookings exist.
- **The banned-phrase list is judgement, not data.** It encodes what reads as
  bulk email. If mining ever contradicts an entry, mining wins.

## Next

Phase 3 (sending): push drafts to Instantly, poll replies, write `gtm_outcomes`.
The one piece with no clean answer yet is the equivalent of Explee's test email
before a campaign arms — see the `send_test_email` gap in
`docs/gtm-mcp-swap-map.md`.

Phase 2 left one thing deliberately unwired: `pipeline.run` takes a `resolver`
callable and ships only `no_resolver`. The LinkFinder resolver is written and
tested in `docs/patches/autogtm-linkfinder-email.patch` (TypeScript); porting it
is small, and it is the only thing standing between this and verified addresses.

Before any of it sends: the three blockers in `docs/own-gtm-agent-plan.md` —
verify the nine Instantly mailboxes are actually sendable (all nine report
`status: -1`), top up the Explee balance (it is -$46.32 and Explee 402s every
request), and run the 200-email placement test.
