# GTM Signal Engine

A self-learning, signal-driven outbound workflow for n8n.

```
Trigify signal ─► Findymail (find + verify) ─► guardrails ─► Claude ─► Deliveryman
                                                   ▲                        │
                                                   │                        ▼
                                          campaign_memory.db ◄──── positive reply webhook
```

Every positive reply writes the replier's company description, tech stack and job
title into `conversions`. The next signal is qualified against that growing set,
so the definition of a good lead is learned from wins rather than fixed at setup.

## What is in here

| Path | What it is |
| --- | --- |
| `n8n/gtm-signal-engine.json` | The workflow. Import it into n8n as-is. |
| `config.json` | Offer, ICP and disqualifier guardrails. Edit any time; the running workflow picks it up on the next signal. |
| `src/server.js` | The memory service — fronts `config.json` and `campaign_memory.db` over HTTP. |
| `src/db.js` | SQLite schema and queries. |
| `src/init-db.js` | Database initialiser (`--seed`, `--reset`, `--show`). |
| `test/` | 26 tests: workflow structure, and every Code node run against real payloads. |
| `.env.example` | Every environment variable, with what it is for. |

Zero npm dependencies. The service uses `node:sqlite` and `node:http`, both
built into Node 22.5+, so nothing needs a compiler on the n8n host.

## Why there is a service and not just nodes

n8n has no SQLite node, and its Code node cannot `require` a database driver.
The options were an `Execute Command` node shelling out to the `sqlite3` binary —
brittle, self-hosted-only, and it puts SQL in a shell string — or a small local
API. The API won: every node in the workflow stays a plain HTTP Request, the
workflow imports into n8n Cloud as well as self-hosted, and `config.json` gets
re-read from disk on every call, which is what makes it editable at runtime.

If you would rather not run a service, `Node 3` and `Node 6b` are the only two
nodes that touch it. Both can be swapped for `Execute Command` nodes calling
`sqlite3 campaign_memory.db "..."` on a self-hosted instance.

## Setup

### 1. Start the memory service

```bash
cd gtm-workflow
cp .env.example .env          # fill in the keys
node src/init-db.js --seed    # create campaign_memory.db (--seed adds 3 examples)
npm start                     # listens on 127.0.0.1:8787
```

`--seed` is worth running once: it puts three conversions in the table so you can
see the lookalike gate in its enforced state on the first test signal. Drop them
with `node src/init-db.js --reset` before going live.

If n8n runs in Docker and the service on the host, the service must bind somewhere
the container can reach — set `MEMORY_SERVICE_HOST=0.0.0.0`, set
`MEMORY_SERVICE_TOKEN` to a real secret, and point
`MEMORY_SERVICE_URL` at `http://host.docker.internal:8787`.

### 2. Import the workflow

n8n → Workflows → Import from File → `n8n/gtm-signal-engine.json`.

After import, one thing needs a click: open **Claude Opus 5** and attach your
Anthropic credential. Everything else authenticates from environment variables,
so there are no other credentials to create.

### 3. Set the environment on the n8n host

Copy the variables from `.env.example` into the n8n process environment
(`environment:` in docker-compose, or the systemd unit — not into a file n8n
reads, it does not read one). n8n must also allow expression access to them:

```
N8N_BLOCK_ENV_ACCESS_IN_NODE=false   # this is already the default
```

### 4. Wire up the two webhooks

- **Trigify** → HTTP Request action → `POST https://<n8n>/webhook/trigify-signal`,
  with header `x-webhook-secret: $TRIGIFY_WEBHOOK_SECRET`.
- **Deliveryman** → reply/interested webhook → `POST https://<n8n>/webhook/deliveryman-reply`,
  with header `x-webhook-secret: $DELIVERYMAN_WEBHOOK_SECRET`.

Both secrets are optional — leave the variable unset and the check is skipped —
but an open webhook that spends model credits and sends email is worth a header.

## The workflow, node by node

**Node 1 · Trigify Signal Webhook** → **1b · Normalise Signal**
Trigify payloads are composed by you in its HTTP Request action, so there is no
fixed schema. The normaliser reads every field through a fallback chain
(`prospect` / `lead` / `person` / flat), strips protocol, `www.` and path off the
domain, and folds the signal into one readable `signal_context` line for the
copywriter. A malformed signal is routed to the skipped response, never thrown —
a bad webhook should not show up as a red execution.

**Node 2 · Findymail** — `/api/search/name` finds the address, `/api/verify`
proves it. **2c · Filter Risky Emails** then drops anything that is not an
unambiguous `verified: true`, plus role addresses (`info@`, `sales@`) and free
mailboxes. A catch-all domain accepts every address at SMTP time and bounces
later; that is the failure mode that burns a warmed inbox pool, so a missing
`verified` field is treated as unverified rather than given the benefit of the
doubt.

**Node 3 · Load Config + Learning Feedback** — one call to `POST /memory/context`
returns four things: live `config.json`, the top-N conversions rendered as
`past_positive_replies_list` (empty string when the table is empty), whether this
person has been mailed before, and the deterministic hard-guardrail verdict.
Folding them into one call means one round trip instead of four, and the
guardrail result lets **Passes hard guardrails?** drop a hopeless lead *before*
paying for a model call.

**Node 4 · AI Agent** — two sequential tasks in one structured system prompt:

- **Task A, the lookalike gate.** Below `learning.lookalike_enforced_after_n_conversions`
  (default 3) the gate is advisory and the agent judges on the ICP alone — three
  data points is not a pattern. At or above it, the gate is enforced: the prospect
  must conceptually resemble a recorded win, and the agent must name which one and
  on what property. A fail returns `{ "qualified": false, "reason": "..." }` and
  the run stops.
- **Task B, the copy.** Three sentences, 60 words, observation → frictionless
  offer → low-pressure CTA, with the banned-phrase list from `config.json` and a
  self-check pass before returning.

Output is pinned by a structured output parser, so downstream nodes get typed
JSON rather than prose that happens to look like JSON.

**Node 5 · Deliveryman** → **5b · Log Outreach.** The `metadata` block on the
send request is what comes back on the reply webhook. `Log Outreach` is both the
suppression list and the backfill source for Node 6 — without that row, a reply
cannot become a lookalike profile.

**Node 6 · Reply webhook** → **6a · Classify Reply** → **6b · Record Conversion.**
The classifier is an allow-list, never a "not negative" test: only an explicitly
positive or interested event is recorded. A bounce or an out-of-office written
into `conversions` would poison the qualification context for every future lead.
Anything the reply payload does not carry is backfilled server-side from
`outreach_log`, so a bare `{email, sentiment}` webhook still produces a usable
profile.

## Tuning it

Everything below is a `config.json` edit, live, with no restart:

| Want to | Change |
| --- | --- |
| Change the offer or CTA | `offer.frictionless_offer`, `offer.cta` |
| Widen or narrow who qualifies | `icp.*` |
| Add a hard rule | `disqualifiers.hard.*` — deterministic, runs before the model |
| Add a judgement rule | `disqualifiers.soft_notes` — the agent applies it |
| Ban a phrase | `copywriting.banned_phrases` |
| Make the lookalike gate stricter sooner | `learning.lookalike_enforced_after_n_conversions` |
| Feed the agent more/fewer wins | `learning.recent_conversions_limit` |

## Two things to confirm before you go live

**Deliveryman.ai does not publish an open API reference.** The base URL, path and
body field names in Node 5 (`https://api.deliveryman.ai/v1/emails`, `to.email`,
`subject`, `body_text`) are the workflow's defaults and are the one part of this
that has not been verified against real docs. Check them against your account,
then set `DELIVERYMAN_API_BASE` and `DELIVERYMAN_SEND_PATH` — it is an
environment change, not an edit. If the body field names differ, the request body
is a single expression in that one node.

**The model is `claude-opus-5`, not Claude 3.5 Sonnet.** That generation is
retired. To use something else, change the model string on the **Claude Opus 5**
node. To switch provider entirely, delete the connection from Claude to the
agent's Chat Model port, enable the **DeepSeek** node next to it and drag it on
instead — the prompt and the output parser work unchanged.

## Memory service API

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness, schema version, paths, conversion count. Unauthenticated. |
| `GET /config` | `config.json` straight off disk. |
| `GET /memory/conversions?limit=N` | Recent conversions plus the rendered prompt block. |
| `POST /memory/context` | Node 3. Config + corpus + suppression + guardrail verdict. |
| `POST /memory/conversions` | Node 6b. Records a positive reply, backfilling from `outreach_log`. |
| `POST /memory/outreach` | Node 5b. Suppression list and backfill source. |

All routes except `/health` take `Authorization: Bearer $MEMORY_SERVICE_TOKEN`
when that variable is set.

## Tests

```bash
npm test
```

26 tests. The workflow ones assert that every connection points at a real node,
that nothing is orphaned, that the agent has exactly one model and one parser,
and that no secret is baked into the export. The behavioural ones lift each Code
node's source straight out of the workflow JSON and run it in a stub of the n8n
Code sandbox against real payload shapes — nested Trigify, flat Trigify, a
Findymail miss, a catch-all, a role address, a bounce, a spoofed webhook secret.
So a change to a Code node is checked by the same tests whether you edit the JSON
or re-export from n8n.
