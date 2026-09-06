# Our own GTM system

Explee's AutoGTM, rebuilt on parts we own: **Explee for lead search, our own
copywriting agent, Instantly for sending.** Multi-client from the schema up.

Why, and the cost arithmetic: `docs/own-gtm-agent-plan.md`.
Read `workers/explee-autogtm/BASELINE.md` before changing anything here — it has
the only measured numbers we have.

## Status: phase 1 of 4 built

| Phase | What | State |
|---|---|---|
| **1. Brain** | data model, copywriting agent, learning loop | **built, 25 offline tests pass** |
| 2. Sourcing | Explee search -> leads, LinkFinder email resolution | not started |
| 3. Sending | push to Instantly, reply poll, outcome tracking | not started |
| 4. UI | projects, campaigns, ICP, prompt editing | not started |

Nothing here has made a live API call. See "What is unproven" below.

## What is built

```
schema.sql      the data model — the contract phases 2-4 bind to
models.py       typed config objects, no DB driver, so tests run offline
copywriter.py   the agent: first email, follow-ups, replies
learning.py     classify replies; mine what made people book
tests/          python3 tests/test_gtm.py — no network, no key
```

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
python3 workers/gtm/tests/test_gtm.py     # 25 tests, no network, no key
```

## What is unproven — read before trusting any of this

- **No live API call has been made from this directory.** Not to Anthropic, not
  to Explee, not to Instantly. The request shapes follow the current Claude API
  (Opus 5, adaptive thinking, `output_config.format`); they have not been run.
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

Phase 2 (sourcing) is the natural next chunk: Explee `/search/nl-to-filters` +
`/search/people` for discovery, LinkFinder for email resolution, writing into
`gtm_leads`. `workers/explee-autogtm/explee.py` already has the client, with the
defensive field reading that directory learned the hard way.

Before any of it sends: the three blockers in `docs/own-gtm-agent-plan.md` —
verify the nine Instantly mailboxes are actually sendable (all nine report
`status: -1`), top up the Explee balance (it is -$46.32 and Explee 402s every
request), and run the 200-email placement test.
