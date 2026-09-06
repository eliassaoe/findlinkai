# Our own GTM system

Explee's AutoGTM, rebuilt on parts we own: **Explee for lead search, our own
qualifier and copywriter, Instantly for sending.** Multi-client, and it runs
itself on GitHub Actions.

Why, and the cost arithmetic: `docs/own-gtm-agent-plan.md`.
Read `workers/explee-autogtm/BASELINE.md` first — it holds the only measured
numbers we have, and every design decision here traces back to one of them.

## Status

All four phases are built. **111 offline tests pass.** No live API call has been
made from this directory — see "What is unproven".

```
gtm.py            the three steps in one file — start here
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
tests/            111 tests, no network, no keys
```

## The short path: `gtm.py`

Everything below this section is the full system. `gtm.py` is the three steps
on their own — Explee finds the leads, we write the email, Instantly gets the
campaign — in one stdlib file with no database, no config objects and no
framework. It is what to reach for when the question is "does the flow work".

```bash
export EXPLEE_API_KEY=... INSTANTLY_API_KEY=... OPENROUTER_API_KEY=...
export LINKFINDER_API_KEY=...          # optional, see 1b

python3 gtm.py \
  --find "B2B training companies in France" \
  --role "Founder, CEO, Head of Sales" \
  --offer "We run your outbound end to end. You pay per meeting held." \
  --limit 10                            # dry run: prints the emails, stops
python3 gtm.py ... --apply              # creates the campaign, PAUSED
```

**The n8n flow no longer uses the people search at all.** It went, in order:
`find-and-enrich` (hung), `/search/people` (returned nothing), and now **Explee
finds the companies and LinkFinder lists the people at each one**:

```
Config -> Explee: search companies -> Domains -> LinkFinder: employees at each
       -> One item per lead -> LinkFinder: fill missing emails -> Write -> Instantly
```

`company_domain_to_employees` is 1 credit per employee **with the email included
in that** — no second lookup for anyone who comes back with an address. This is
the one part confirmed against the live API: `demos.fr` (a French training
company, squarely in the ICP) returned five directors, two with emails, in one
call. Filling in `Company domains` on the Campaign screen skips the Explee node
entirely and uses your list.

The company-search body is the documented one — `filters.definition` plus
`page_size`, not `company_filters` and `limit`, which is what the earlier
attempts sent. The path is a Config field (`explee_companies_path`) because it
is the one shape not yet confirmed against a response; if it 404s, fix it there
rather than in a node.

`gtm.py` has **not** been moved to this path — it still calls `/search/people`.
The n8n flow is the live one.

**Why it searches rather than uses find-and-enrich.** `/search/people` is one
request with one response. `/find-and-enrich` is the async sibling that also
resolves emails, and it has never been seen to finish: two separate jobs sat at
`status: "pending"` with `contacts: null` and `progress_pct: 99`, `eta_seconds:
0`, while `found` climbed past `target` — 21 against a target of 10 on the
second — and `credits_charged` stayed `null` throughout. It is still reachable
behind `--explee-enrich`, and the n8n flow no longer offers it at all. If Explee
fixes it, it is the cheaper path and worth going back to: its search half is
free and it charges 1.5-5 credits only per address found.

**1b — turning profiles into addresses.** Explee charges only for addresses it
finds, so a search for 10 routinely returns contacts with `email` empty.
Search returns profiles, not addresses. LinkFinder AI resolves them: the
person's LinkedIn URL if Explee gave one, otherwise name + company.
`--linkfinder-max` caps how many (default 10, `0` disables), and the cap
matters because **LinkFinder charges whether or not it finds an address** — 10
credits from a LinkedIn URL, 7 from a name. A 402 or 429 stops the lookups and
keeps every lead already resolved; it does not end the run.

This is also why `--limit` defaults to 25 rather than the number of leads you
want: search is free for the first 100 results, so look at more people than you
need and let the resolver decide how many become leads.

> The credit numbers come from `app.html`'s `creditCosts`, which `CLAUDE.md`
> names as authoritative. The public docs page contradicts itself — "1 credit =
> 1 API request, regardless of endpoint" in Credits & Limits, "from 1 credit …
> up to 50 for `linkedin_profile_to_phone`" at the top of the same page. 10 and
> 7 are the numbers the app bills.

### Diagnosing "no data" — `probe-explee.py`

Run it from a machine that can reach the API. It walks a ladder and prints a
verdict, because "no leads" has four different causes that need different fixes:

| | | |
| --- | --- | --- |
| A | balance | free; everything 402s at or below zero |
| B | `nl-to-filters` | free; Explee converts English into **its own** filter object |
| C | search with B's filters | verbatim, so the shape is Explee's, not a guess |
| C2 | `search/companies` | the documented `filters` + `page_size` body |
| D / D2 | `search/people` | our body, then the same with `page_size` |
| E | control | deliberately broad |

C works and D does not → the body shape is wrong and B printed the right one.
E works and C/D do not → the shape is fine, the ICP is too narrow. Nothing
works → account level, and the status code says which. The verdict logic is
exercised against a local mock in all four of those states.

### Checking Explee by hand

`check-explee.sh` runs the two calls the flow makes — balance, then
`search/people` with the exact body the workflow sends — and prints the raw
responses. Pass a task id to also poke a `find-and-enrich` job that never
finished. **The agent sandbox cannot reach `api.explee.com`, `api.instantly.ai`
or `api.linkfinderai.com`: the egress policy answers 403 to CONNECT.** Nothing
in this directory has ever made a live call to any of them from a session, so
this script is how the shapes get confirmed.

### What has been confirmed live, through the MCP servers

The LinkFinder MCP server runs outside the sandbox, so its half is checked:

| Call | Result |
| --- | --- |
| `find_linkedin_url_from_name` "Satya Nadella"/"Microsoft" | `{"status":"success","result":"https://www.linkedin.com/in/satyanadella"}` |
| `find_email_from_linkedin_profile` on that URL | `{"status":"success","result":""}` — looked, found nothing, still charged |
| `find_leads_ai` | **403, broken in production** — see below |

**`result` is a bare string, not an object.** Both the n8n Code node and
`gtm.py` accept either (`typeof res === 'string' ? res : res && res.email`), so
the parsing is right, and `""` meaning "found nothing" is the semantics both
already assume.

**`find_leads_ai` is returning 403 to callers right now.** The body is
`full-permission-actor-not-approved` from Apify — the actor behind it needs its
permissions approved at `console.apify.com/actors/IoSHqwTR9YGhzccez`. Two
things worth fixing beyond the approval: every customer calling that endpoint
gets this today, and the error is passed through raw, so the response leaks an
internal stack trace with `node_modules` paths, the fact that the backend runs
on n8n, and the Apify actor id. That should be a clean error message.

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

**That is half right, and the published API says which half.** Explee's search
takes a `criteria` list and scores every result 0-5 against it with reasoning,
for +0.1 credit each. It CAN judge fit, more cheaply than a model call per lead —
so we pass the campaign's criteria there and let it filter. What it cannot do is
read the company's site today and return one sourced thing worth opening on. A
0-5 score is a filter, not a first line.

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

    Explee search   free to 100    then 1cr/person (+0.1/criterion)
    qualify         cents          decides if a send is worth spending
    resolve email   see below      ONLY for leads that passed
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

`ui/index.html` — one file, ~570 lines, **no build step, no database, no login,
no library.** Hosted at `linkfinderai.com/gtm-console`; `ui/build.py --write`
renders it to `gtm-console.html` at the repo root. Edit the master, rebuild,
commit both.

**Three screens**, because there are three decisions:

| | |
|---|---|
| **Campaign** | what you sell, who to, and the facts the agent may state |
| **Emails** | the per-stage instructions, versioned |
| **Run** | start the workflow, watch it, hold the Instantly campaign id |

It was nine tabs, a three-level sidebar and four header buttons. Most of that
was structure imposed on config that is really one page, plus a Queue tab that
went dead when Supabase came out of the browser — it read lead rows localStorage
never has, so it said "nothing sourced yet" forever.

Prompts stay versioned: saving appends rather than overwrites, so a change in
reply rate is attributable to a change in the prompt, and any prior version can
be restored.

**One campaign at a time, on purpose.** Multi-client lives in the JSON files —
one per campaign, committed — which is simpler than a sidebar tree for one
operator and is what the runner reads anyway.

### Starting a run

The **Run** screen dispatches the `gtm` workflow through the GitHub API. That is
where the secrets live and where the APIs are reachable, so the browser asks
GitHub to act rather than pretending it can call Explee itself; `api.github.com`
sends CORS headers, so this needs no backend. Add a fine-grained PAT with
**Actions: read and write** under Keys.

Buttons are weighted by risk: **Check capacity** is primary and free, sourcing
and reply-drafting are dry runs, and the one button that sends real mail is a
danger style behind a confirm.

### Or: download an n8n workflow

**Download n8n workflow** on the Run screen renders everything on these screens
as an importable flow. `end-to-end.n8n.json` in this directory is that file
with placeholder keys. Import it as a **new** workflow, pick your OpenRouter
credential on the Model node, fill the placeholders in Config, run.

```
Start -> Config -> Instantly: check campaign
      -> Explee: nl-to-filters -> Filters -> Explee: search companies -> Domains
      -> People at each domain -> Qualify -> Explee: signals per company
      -> One item per lead -> LinkFinder: fill missing emails
      -> Write the email (+ Model) -> Build the lead -> Send? -> Instantly: add leads
```

Seventeen nodes (fourteen with your own domain list). No loop anywhere: every
async wait lives inside a Code node with a wall-clock budget, because two
earlier versions hung on a Wait/If poll. **Runs dry by default** — `dry_run`
in Config — which writes every email and never calls Instantly. Read them in
`Build the lead`. Flip the Mode on the Run screen to send.

#### Where the node bodies live

`ui/nodes/*.js`, one file per Code node, injected into the console by
`gen_nodes.py` (which `build.py` runs). They are real JavaScript: syntax-checked
in the async wrapper n8n uses, run end to end against fakes built from real
API shapes, and hit with adversarial cases — `ui/tests/run.sh` does all of it
and asserts the console carries the current bodies. The previous generator
hand-escaped these as concatenated strings; three bugs in this flow's history
were escaping mistakes and one deleted three nodes. That cannot happen now.

#### What was wrong, and what each node does about it

The first real run produced people who were not the ICP and emails that were
not the copy. Traced through the generated code: eleven causes. The rebuild
answers each one.

**Bad leads**

| Cause | Node | Fix |
| --- | --- | --- |
| The ICP went to Explee as prose with the geography inside the sentence; Explee returned Microsoft | `Explee: nl-to-filters` → `Filters` | Explee's own free converter turns the ICP into its structured filters. Continues on error and falls back to prose. |
| Company criteria scores were paid for and never read | `Domains` | reads them, drops below `min_criterion_score`, **ranks** |
| No country check anywhere; a lead in Ireland with company_geo CN went through | `Domains`, `Qualify` | ISO codes derived from the geography field; names mapped, not sliced |
| `Qualify` was off unless `title_keywords` was filled | `Qualify` | title words derived from the target roles by default, so the literal-title gate is on from the first run |
| The resolution cap kept the first 25 in arbitrary order | `Qualify` | person score, then company score, then Explee before LinkFinder; `max_leads` keeps the best |

**Bad emails**

| Cause | Node | Fix |
| --- | --- | --- |
| Leads went into an existing campaign as `{{subject}}`/`{{body}}`; if the template did not use them, **everyone got the static text** and nothing noticed | `Instantly: check campaign` | fetches the campaign before a credit is spent and refuses unless the sequence uses `{{ai_body}}` |
| `<br>` in a plain-text step renders literally | `Build the lead` | both `ai_body` (HTML) and `ai_body_text` (plain) |
| The Language selector on the Emails screen was never wired to the prompt | prompt | `## LANGUAGE` section; default from the first target country |
| No exemplar, no sender | prompt, console | one French example of the shape, `Sender name` on the project, first-name sign-off |
| Any preamble before the JSON dropped the lead silently | `Build the lead` | JSON found by brace matching; pairs by the email the model echoes, not by position; problems logged |
| The raw agent result went into the brief | `Explee: signals per company` | compacted: job postings become their titles, urls and reasoning dropped |

**Model default is now Sonnet 5**: $0.008 an email against Opus's $0.021 for
90 words from a structured brief. Change `LLM_MODEL` under Keys to override.

**Not verified against a live n8n or live APIs from this sandbox** — the
egress policy blocks all three API hosts. What is verified: the simulation
runs every Code node in order, from a company response to the Instantly
payload, using the real row shapes seen in this session. Microsoft is dropped
on country, a Sales Manager on title, a lead in Ireland on country, a Belgian
company with no Explee people falls through to LinkFinder, scores rank the
rest, a preamble and a fenced reply both parse, and dry run makes no Instantly
call. Two keys and a campaign stand between this and a real result.

### GitHub is the backend

**Save** commits `campaigns/<slug>.json` to the repo through the GitHub contents
API, and the workflow reads it from the checkout. Edit here, run there, one loop —
no file through your downloads folder, no server of ours, no database.

The PUT is create-or-update: it fetches the blob sha first and omits it when the
file is new. Content is base64 of UTF-8 bytes rather than `btoa`, which is
latin-1 only and would mangle every accent in French copy.

**Download** is still there as an escape hatch, and `run.py --campaign <file>`
reads either.

That is the whole integration. A database buys one thing — browser and runner
seeing the same rows without a file between them — and costs a login, an RLS
policy, and a public anon key in front of lead data. The repo already does the
job, with version history for free.

`store.py` and `run.py --db` still exist and still work if that changes. The
`gtm_*` tables are live behind an operator allowlist (see `schema.sql`), and the
runner writes leads, replies and outcomes there with the **service key**, which
never touches a browser.

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
