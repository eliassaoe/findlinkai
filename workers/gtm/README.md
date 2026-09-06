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
as an importable n8n flow — the Explee search built from your ICP, the prompt
with your offer and facts in it, and the push to Instantly. Import with
`⋯ → Import from File` and it runs there: no Python, no Actions, every step a
node you can see and change.

Ten nodes (nine with your own domain list), three types (`manualTrigger`,
`code`, `httpRequest`), one straight line, **no loop**. The connections are
derived from the node list rather than written out, so a node that is added or
dropped cannot leave a dangling name or an unreachable node behind — the first
version of the company-search change did exactly that, and the structural check
caught it. Anything that could have been a `splitOut` or a `Set` is a
Code node instead, because a workflow that fails to import is worse than one
with an extra node.

**There is no polling because there is no job.** The first two versions of this
flow used `/find-and-enrich` and hung — first on gating the loop on
`meta.status === 'completed'` (Explee reports `pending` long past
`progress_pct: 99`), then, once that was fixed to gate on the `contacts` array,
on the job simply never closing: `found` climbed past `target` while
`credits_charged` stayed `null`. Chasing that with a better loop was the wrong
fix. `/search/people` answers synchronously and LinkFinder resolves the
addresses, so every node either returns or fails visibly, and the whole class
of bug is gone along with the `Wait`, `Ready?` and `Done?` nodes.

**Explee is the primary people source; LinkFinder is the fallback.** Explee
`search/people-by-domains` matches job titles semantically against the
campaign's target roles, so it answers "who at this company is my buyer".
LinkFinder's `company_domain_to_employees` takes a seniority bucket instead,
and the live call on `demos.fr` shows what that costs: a Technical Director
based in Russia and a CFO came back — real directors, wrong people. Precision
on who gets the email is worth more than the difference.

The difference is cost. Explee returns profiles without addresses at 1 credit
each, so every one goes through email resolution downstream at 10 credits a
LinkedIn URL; LinkFinder bundles the email into its own 1 credit when it has
one. On a domain Explee has nobody for, LinkFinder gets the turn — never both,
and the two shapes normalise to the same fields, so the writer cannot tell
which answered. If neither finds anyone the node throws naming the domains
rather than handing an empty list to the writer.

**The flow stops at a paused campaign, and says so.** `Build the lead` throws
if `instantly_campaign_id` is still a placeholder — after the emails are
written, so they are visible in the node output and only the destination is
missing. Leads are added with `skip_if_in_campaign` and
`skip_if_in_workspace`; arming the campaign is still a decision you make in
Instantly.

`end-to-end.n8n.json` in this directory is the whole thing, generated from the
console and ready to import: five placeholders in the Config node and nothing
else to fill in.

### The prompt

It is written into the agent node as **plain text**, not an expression, so what
you read in n8n is what the model is given. The Emails screen shows the same
composition before you generate anything. Regenerate from the console to change
it; editing it in n8n works too and lasts until the next import.

Eight sections, composed from the console: who you are writing as (project name
and domain), what we sell (the offer), the only things you may state as true
(project facts, booking link, nameable clients), who you are writing to (role,
company keywords, geography, should-be and should-not-be criteria, the problem
they likely have), how to write it, never, the campaign's extra instructions,
and the output contract.

The craft rules are anchored to 2026 cold-email data rather than taste:

| Rule | Why |
| --- | --- |
| 75-100 words, never over 125 | 50-125 words replies **2.4x** better than over 200; 75-100 peaks |
| One concrete observation from the brief | signal-based personalisation runs **5-18%** reply against **1-3%** generic |
| One ask, and it is a reply not a call | lowest-commitment CTA wins a first touch; two asks cause decision paralysis |
| Subject 4-7 words, curiosity plus relevance | beats clever subject lines on opens |
| Problem-first, in PAS order | signal-anchored PAS lands **8-15%** |

Sources: [Instantly's 2026 benchmark report](https://instantly.ai/cold-email-benchmark-report-2026),
[Saleshandy on 53M emails](https://www.saleshandy.com/blog/cold-email-statistics/),
[Autobound's 2026 guide](https://www.autobound.ai/blog/cold-email-guide-2026),
[Unify on PAS vs AIDA](https://www.unifygtm.com/explore/cold-email-frameworks-b2b-saas).

Worth keeping in perspective: the same sources say signal timing moves reply
rates more than framework choice does. The prompt is not the lever that matters
most — who you send to, and when, is.

**The writer is an n8n AI Agent, and it only sees a brief.** `Write the email`
is `@n8n/n8n-nodes-langchain.agent` with an `lmChatOpenAi` model node on
`ai_languageModel` — the node type and version copied from the agent in the
live LinkFinder workflow rather than guessed. Pick your existing OpenAI
credential (the one pointed at OpenRouter) on the Model node; the model id
comes from Config, and the whole system prompt is one editable Config field.

An agent is not needed to write one email from a record — that is a single
completion with no tools to call. It is here because the model becomes a
dropdown, the prompt becomes a field, and when the writer eventually needs to
read the prospect's site or check recent news, the shape is already right.
`Build the lead` reads the agent's `.output` and a raw completion's
`.choices[0].message.content`, so swapping back is one node.

Each lead gets its own call and its own subject and body — but the writer is
handed `brief`, not the row. The raw Explee row carries NACE sector scores,
follower counts, photo urls and a `company_geo` that said `CN` for Microsoft:
noise that dilutes the signal and invites invention. The brief is name, title,
headline, company, what the company does, industry, size and location — 391
bytes instead of 697 on a real row, and `what_the_company_does` is exactly the
concrete observation the prompt asks for.

**The resolver works to a wall clock, not just a count.** n8n kills a Code
node at 300s (`N8N_RUNNERS_TASK_TIMEOUT`), and a serial loop over 47 leads with
a 1.1s spacer and the occasional 8s job poll goes straight through that — which
is exactly what happened on the first real run. It now runs
`linkfinder_concurrency` lookups at a time (3 by default, under Starter's 5
requests/second) against a `linkfinder_budget_seconds` deadline (240), skips
polling a job when there is not enough budget left for it, and **returns the
leads it did resolve instead of dying with nothing**. The node log says what
happened: how many emails, roughly how many credits, how many were past
`linkfinder_max`, and why it stopped early if it did.

The same 47 leads that timed out resolve in about 12 seconds of wall time in a
harness with 200ms responses.

**LinkFinder runs inside one Code node, not five.** The people from the search
go through `linkedin_profile_to_email` (10 credits) or
`lead_full_name_to_email` (7), capped by `linkfinder_max` in Config, spaced
~1/s against the rate limit, and polled if a lookup answers with a `job_id`
instead of a result. It is a Code node using `this.helpers.httpRequest` rather
than an HTTP node plus a poll loop because pairing an HTTP node's response back
to its lead across a loop is precisely where a flow like this breaks. If the
key is a placeholder, or this n8n build has no `this.helpers.httpRequest`, the
node degrades to what the flow did before: no email, no send.

Two buttons: one embeds your keys so it runs on import (**keep that file local**),
one leaves placeholders in the Config node.

**Not verified against a live n8n.** The JSON is structurally checked — required
fields on every node, no dangling or unreachable connections, unique ids, the
loop closes — but nothing here has imported it. If a node comes in red, tell me
which and it is a one-line fix.

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
