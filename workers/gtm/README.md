# Our own GTM system

Explee's AutoGTM, rebuilt on parts we own: **Explee for lead search, our own
qualifier and copywriter, Instantly for sending.** Multi-client, and it runs
itself on GitHub Actions.

Why, and the cost arithmetic: `docs/own-gtm-agent-plan.md`.
Read `workers/explee-autogtm/BASELINE.md` first — it holds the only measured
numbers we have, and every design decision here traces back to one of them.

## Status

All four phases are built. **64 offline tests pass.** No live API call has been
made from this directory — see "What is unproven".

```
schema.sql        the data model (Postgres/Supabase)
models.py         typed config objects, no DB driver, so tests run offline
explee_search.py  Explee as a lead-search API, with none of its sending
qualifier.py      the step Explee cannot have — see below
copywriter.py     first email, follow-ups, replies
linkfinder.py     email resolution; the only thing that sets verified=True
instantly.py      sending on our own warmed mailboxes, and the reply poll
learning.py       classify replies; mine what made people book
pipeline.py       search -> qualify -> resolve -> draft, with the gates
run.py            the CLI. Dry by default; sending needs --apply
ui/index.html     the console. One file, no build step
tests/            64 tests, no network, no keys
```

## Quick start

```bash
pip install anthropic
cd workers/gtm

# config from the console (Supabase), or drop --db to use example-campaign.json
export SUPABASE_URL=... SUPABASE_KEY=...

python3 run.py capacity                                   # what can send today
python3 run.py source --db --campaign "organismes de formation FR/BE/LU" \
        --limit 20 --research --resolve                   # search, qualify, draft
python3 run.py send   --db --campaign "..."               # dry run
python3 run.py send   --db --campaign "..." --apply       # creates/uses PAUSED
python3 run.py arm    --campaign-id <id> --apply          # actually go live
```

Nothing sends without `--apply`, and `send --apply` still only creates a
**paused** campaign. Arming is a third, separate decision. There is no undo on a
send, so there are three doors.

## The qualifier — where this beats Explee

`workers/explee-autogtm/README.md`, quoting the vendor's own product:

> Explee matches 105M companies on firmographics; **it cannot see intent.**

AutoGTM goes search -> write. The writer only ever sees the firmographic row, so
the email can only restate it. It is visible in the live drafts: *"J'ai vu que
Foxglove-Partner vend de l'optimisation SEO senior a Lyon"* is the search result
read back as a sentence, and every lead in the segment gets the same shape.
BASELINE.md measures where that lands: **1.05% reply, against 3-8% for good cold
email.**

`qualifier.py` sits between the two stages and does two things no amount of
prompt tuning on the copy can:

1. **Re-checks the match.** Natural-language search is approximate. The qualifier
   reads each lead against the real positive and negative criteria and returns a
   reasoned verdict with a typed skip reason, not a filter hit.
2. **Finds something to open on.** With `--research` it uses server-side web
   search to read the company's own site — the careers page especially, because
   who a small company is hiring says what it is short of.

Every observation must carry an `observation_source` (a field name, or the URL it
was read on). An unsourced observation is **dropped in code and the fit score
capped**, because an unsourced observation is an inference, and inferences are
what make cold email obviously automated. The prompt names the failure mode by
name — "the firmographic row restated" — and a test pins that sentence.

### Saying no is the highest-value thing it does

Nine mailboxes at 15/day is **135 sends** against Explee's 747. When send
capacity binds, who you do *not* email matters more than what you write.
Spending a fraction of a cent to avoid burning one of 135 daily sends is correct
arithmetic — the opposite of the trade Explee makes at 747/day on a shared pool.

### The gates, cheapest first

    Explee search   ~$0.025/lead   finds people
    qualify         cents          decides if a send is worth spending
    resolve email   7-10 credits   ONLY for leads that passed
    write           cents          ONLY for verified addresses

A test asserts a skipped lead never reaches the resolver. **Explee's own emails
are not verification** — they pass through as `verified=False` and are blocked;
`instantly.add_leads` raises on an unverified address as a second lock on the
same door.

## The copywriter

Three system blocks, most stable first, so a campaign run shares one cached
prefix: craft rules (byte-identical forever) -> campaign context -> the
operator's 3000-char instructions, with the cache breakpoint there. A test
asserts no lead data appears above the breakpoint; one stray name destroys cache
reuse for the whole run.

**Grounding is absolute.** The agent asserts only what is in the project's facts.
Operator instructions override any craft rule except that one, and the prompt
says so. A thin lead yields a short email flagged `confidence: "low"`, never
invented specifics.

## The learning loop

`classify_reply` (Haiku, per reply) labels inbound mail. `mine_patterns` (Opus,
weekly) compares outbound emails whose lead **booked** against those that did not.

**It anchors on `booked_at`, never `interested_at`.** `docs/outbound-angle.md`
records 571 leads marked interested and 0 meetings booked; optimising for
"interested" teaches the agent to write polite non-answers. Below 10 bookings it
returns nothing, and a pattern reaches the prompt only at
`wins >= 3 and wins > losses * 2` — enforced in code and mirrored in the
`gtm_active_patterns` view. Patterns arrive as counted evidence labelled "not
text to reuse".

## The console

`ui/index.html` — one file, Supabase JS from a CDN, **no build step**.

**Hosted at `linkfinderai.com/gtm-console`.** `ui/index.html` is the master;
`ui/build.py --write` renders it to `gtm-console.html` at the repo root, which is
how a plain-HTML page gets served. Edit the master, rebuild, commit both — never
hand-edit the root copy.

**It is noindex, not private.** The page carries `noindex, nofollow, noarchive`
and is kept out of the sitemap (`NOINDEX_ONLY` in `gen_sitemap.py`), and it is
deliberately *not* in robots.txt: that file is public, so a `Disallow` line would
advertise the path, and blocking the crawler would stop it ever reading the
noindex. Google will not list it. **Anyone with the URL can still open it** — put
it behind Cloudflare Access if that matters. It embeds no credentials; your
Supabase key lives in your own browser.

**Open it and it works.** With no Supabase configured it runs in **local mode**,
backed by browser storage and seeded with a worked example, so you can click
through the whole thing before any database exists. Nothing in local mode reaches
a server, and the agent cannot see it.

To connect it for real, hit **Connection** and paste your project URL and **anon**
key (never the service key — this is a browser page, so turn RLS on). From then
on `run.py --db` reads exactly what the console shows.

Clients -> projects -> campaigns in the sidebar. Per campaign: the offer, the
ICP with positive and negative criteria as chips, a per-stage prompt editor with
a live character count against the 3000 cap, and a **Sending** tab holding the
Instantly campaign id and the mailboxes.

**You do not have to create the Instantly campaign yourself.** Leave the id empty
and the first `send --apply` creates one, paused, and writes its id back into the
console. Paste an id instead and leads are added to a campaign you already made.

**Prompts are versioned, and the editor inserts rather than updates.** Every
message records the version that wrote it, so a change in reply rate is
attributable to a change in the prompt. The history table can restore any prior
version into the editor.

## Running itself

`.github/workflows/gtm.yml`, two cadences, and the split is the point:

- **replies, every 30 minutes.** Hot leads go cold in 24h and BASELINE.md
  records one sitting three days in *Needs reply* before it booked. This is
  where the money leaks.
- **source, weekdays 07:00 UTC.** Sending is capped by warmup at ~135/day; no
  schedule raises that. Running discovery hourly would only burn credits.

Both run **dry** until the repository variable `GTM_APPLY` is set to `true`.
Secrets: `ANTHROPIC_API_KEY`, `EXPLEE_API_KEY`, `LINKFINDER_API_KEY`,
`INSTANTLY_API_KEY`.

## Three blockers before the first real send

From `docs/own-gtm-agent-plan.md`, none of them code:

1. **All nine Instantly mailboxes report `status: -1`.** Warmup score is 100 and
   tracking domains are active, but `-1` is not sendable. `run.py capacity` is
   how you check; it exits non-zero when nothing can send.
2. **The Explee balance is -$46.32.** Explee 402s every request, free tier
   included, at or below zero.
3. **Run the 200-email placement test** before scaling. The whole plan rests on
   our own domains lifting the reply rate off 1.05%, and that is unproven.

## What is unproven

- **No live API call has been made from this directory** — not to Anthropic, not
  to Explee, not to Instantly, not to LinkFinder.
- **Explee's search response field names are unpublished** and the sandbox
  cannot reach the API. Every read goes through `first_of`, which raises a
  `ShapeError` naming what it wanted. Print one raw response per endpoint and
  fix the key lists before the first run — the same discipline
  `workers/explee-autogtm/` learned the hard way.
- **Instantly's exact v2 request shapes** are taken from cmn-labs/autogtm's
  client, not from a live call. `capacity` is the cheapest way to test the
  credentials and the shape at once.
- **Copy quality is untested.** The tests cover prompt assembly — clean cache
  prefix, grounding intact, unproven patterns excluded — not output. Judging the
  copy needs an eval over real drafts against the Explee baseline.
- **The qualifier's skip rate is unknown.** Skipping 60% makes the economics
  excellent; 5% means it is not earning its cost. That number comes out of the
  first real batch.
- **`MIN_WINS_TO_MINE = 10`** and `wins > losses * 2` are guesses, not
  measurements.

## Known gaps

- **`store.py` does not exist.** `run.py` reads campaigns from JSON
  (`example-campaign.json`) and the UI writes to Supabase; nothing yet bridges
  the two. It is the next piece and it is small.
- **`send` pushes one sequence for the batch,** not per-lead bodies. Correct
  would be one campaign with Instantly variables per lead. The drafts are all
  written and saved; only the push is naive.
- **No equivalent of Explee's pre-arm test email.** Instantly has no direct
  endpoint for it (`docs/gtm-mcp-swap-map.md`). The paused-then-arm split is the
  stand-in, not a replacement.
