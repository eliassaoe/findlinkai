# Explee AutoGTM: the two optimisations

The plan behind this directory is one goal — **cost per call under $50** — and two
actions, both staying on AutoGTM:

1. **Test a higher-intent lead source** — `leadsource_test.py`. **This is the
   live one.** Explee matches 105M companies on firmographics; it cannot see
   intent. 500 Explee leads against 500 sourced leads, same copy, same week.
   Which sources, and what they cost: **[SOURCES.md](SOURCES.md)**.
2. **Follow up on people who replied but didn't book** — `recover.py`. Built and
   tested, but **parked on one missing input**: nothing in Explee knows who
   booked. See "the booking problem" below before running it.

Everything here talks to the Explee public API with the same `X-API-Key`.

## The three changes applied on 6 September 2026

Asked "what in the API cuts cost per lead", the answer was: nothing touches the
$0.03 an email, so everything inside AutoGTM is a 10-30% lever. Three of them
were chosen and built. Each is dry-run by default, gated on its own numbers,
and runs from GitHub Actions because this sandbox cannot reach the API.

| # | Change | Tool | What it needs from you |
|---|---|---|---|
| 1 | **Shorten the sequence** | `sequence.py` — `.github/workflows/explee-followups.yml`, task `measure` then `shorten` | Read Monday's `measure` table, then run `shorten` with **apply** ticked |
| 2 | **Pre-qualify leads before sending** | `prequalify.py` — same workflow, task `prequalify` | Pick the campaign, tick **apply**; compare in two weeks |
| 3 | **Win back replies that never booked** | `recover.py` — same workflow, task `followups`, already scheduled daily | Set the `EXPLEE_APPLY` variable to `true` |

**Where to see what any of it did: `linkfinderai.com/autogtm-report`.** Every
run rewrites that page (and `reports/latest.md`) and commits it: the last run
of each task, every replied lead and what they said, what was sent or would
have been, the sequence table, the run history, the balance. It is `noindex`,
absent from the sitemap and linked from nowhere — the same arrangement as
`/gtm-console` — which keeps it out of Google and nothing more: anyone with
the URL can read it, and it names people. It goes live with the next deploy
of `main`.

**Both prerequisites were cleared on 6 September:** the key is in the
repository as `EXPLEE_API_KEY` (the scheduled runs reach Explee) and the
balance was topped up. If a key ever gets pasted into a chat or a ticket,
rotate it under API Keys and replace the secret.

### Adding a customer project

Every project you run for a customer lives in your Explee organisation, so
the one `EXPLEE_API_KEY` reaches all of them. Adding one is a file:

```bash
python3 recover.py --init "Acme Corp"      # writes projects/acme-corp.json
```

Fill in `project_id` (the number in the Explee URL, `/app-auto-gtm/p/<id>`),
`language`, and the `copy` block: `offer` is the one line the nudges carry,
`sender` is the fallback signature (the nudge signs as the persona the lead
wrote to whenever it can read one). Commit the file. From the next run:

- the daily loop reads that project's replied threads and nudges like any other;
- the page gets its own **Follow-up loop — Acme Corp** block, with its own inbox
  link, and `reports/acme-corp/latest.md` its own report;
- the Monday measure covers its campaigns;
- `booked` / `stop` in a lead's note works the same, in their inbox.

Project files carry no secrets. If a project uses the optional Google Sheet
web app, its token goes in the `SHEET_TOKEN` environment variable, and a test
refuses a committed file that holds one. Arming is still one switch for every
project: `EXPLEE_APPLY`.

### 1. Shorten the sequence — `sequence.py`

```bash
python3 sequence.py measure                              # every campaign in the project
python3 sequence.py shorten --campaign 127292 --emails 2         # shows the PATCH
python3 sequence.py shorten --campaign 127292 --emails 2 --apply # does it
```

`measure` reads every replied thread (free GETs), counts which email each
person answered, and prints per campaign: replies and positive replies by step,
and for every shorter length the share of replies kept, the cost per reply, and
how much faster the lead pool burns. It recommends the shortest length that
keeps 80% of the replies and cuts cost per reply by at least 15% — one email is
always the cheapest per reply and also the one that throws away the most.
Threads younger than 14 days are left out: they have not had time to receive
email 3 or 4, so they can only flatter the early steps.

`shorten` re-measures and refuses unless the requested length clears the 15%
bar (`--force` overrides). It patches only `followups`; emails already sent are
untouched.

**Measured on 6 September, and the answer is: do not shorten.** The real field
is `{"max_touches": 2, "delay_days": 3}`, and `max_touches` counts the whole
sequence: of 47 settled human replies on *High ticket linkfinder AI*, 28 came
on email 1, 19 on email 2, none on a third — there is no third. So the
sequence is already two emails, the second one earns 40% of the replies, and
cutting to one would raise cost per reply. `measure` keeps running every
Monday; it will say so the week the split changes. (The first reading of the
field, +1 for a first email, recommended "shorten to 2" — which would have set
`max_touches` to 1. The zero at step 3 is what caught it, and `measure` now
shouts if a reply ever lands beyond the length it read.)

The workflow runs `measure` every Monday and writes the table into the job
summary. Read it, then *Run workflow* → `shorten` with the campaign, the number
of emails, and **apply** ticked.

### 2. Pre-qualify leads before sending — `prequalify.py`

```bash
python3 prequalify.py plan   --campaign 127292 --out prequalify.json     # free
python3 prequalify.py search --plan prequalify.json --max-people 1000 --min-score 4 \
                             --out qualified.leads.json --apply
python3 prequalify.py import --plan prequalify.json --leads qualified.leads.json --apply
python3 leadsource_test.py compare --arm source.arm.json --arm qualified.arm.json --period 30d
```

`plan` reads the campaign's own definition — role, geography, size, keywords,
positive and negative criteria, and the copy brief — turns the targeting into
filters with `nl-to-filters` (free) and the criteria into Explee's 0-5 scoring
criteria (negatives phrased so a high score means safe). `search` pages
`/search/people` with those criteria, keeps everyone who scores at least
`--min-score` on **every** criterion, batch-finds the missing emails, and
writes an import-ready file. `import` creates a new campaign in the same
project with the **same brief**, and writes both arm files so the existing
`compare` verdict applies unchanged.

What it costs: 1 credit a person plus 0.1 per criterion after the first 100,
then 1.5 credits per email found. 1,000 people on 4 criteria is about $12.60 of
search and at most $15 of emails; `search` prints the worst case and spends
nothing without `--apply`. **It is a test.** The campaign already carries these
criteria and Explee applies them its own way; this gates harder and on explicit
scores, and `compare` decides in two weeks whether that lifted the reply rate.

### 3. Win back replies that never booked — `recover.py`

Rebuilt on 6 September so that **nothing outside Explee is needed.** The first
live run died on the Google Sheet it used to depend on (the published CSV was
empty), so the sheet is gone from the default path. The lead note is the whole
interface:

- **To stop the loop on someone:** open the lead in the Explee inbox and type
  `booked` (or `rdv`, `stop`, `ne pas relancer`) in the note. Next run, they are
  skipped. The classifier also stops on its own for a "non merci", an
  out-of-office, an unsubscribe, or a reply that says the invite was accepted.
- **To see what the loop did to someone:** the same note. After every action it
  writes one plain line — *Suivi LinkFinder — 2026-09-06 : relance envoyée* —
  above its machine ledger.
- **To see everything at once:** `/autogtm-report`, or `reports/<project>/latest.md`.

Two things the first real dry run (6 September, 158 replied threads) taught
it, both now in the code:

- **Explee's auto-reply is already ON for this project** (delay 0), so every
  fresh reply gets an AI answer within minutes. The loop therefore never
  answers a fresh reply itself while that is on — it waits a day, and its job
  is the nudge afterwards: 2 days after the answer, then a final one 5 days
  later that asks for a plain yes or no. A reply that is a real **question** is
  never answered from a template in either mode; the page flags it *ANSWER THIS
  ONE YOURSELF*.
- **Explee sends as invented personas** ("Pete" at getliftember.com), and an
  API reply goes out from that same mailbox. So the nudge signs as the name the
  lead wrote to — read off their own greeting ("Hi Pete,") — never as Eliasse.

It runs every morning at 07:00 UTC as a **dry run** — the page and the report
show exactly what it would have sent. To arm it: Settings → Secrets and
variables → Actions → **Variables** → `EXPLEE_APPLY` = `true`. From then on a
hot lead who went quiet gets a nudge after 2 days and again 5 days later,
three at most. A sheet is still supported (`sheet.csv_url` or
`sheet.webapp_url` in the project file) for anyone who wants a list view, and
if one is configured but unreadable the run stops rather than mail someone it
could not check.

**Also flip the zero-code half of this on**, so a fresh reply gets an answer in
minutes rather than at 9am tomorrow:

```bash
python3 explee.py PATCH /public/api/v1/autogtm/projects/30475/autopilot \
    '{"auto_reply_enabled": true, "auto_reply_delay_minutes": 30}'
```

Set the project's `reply_instructions` in the app to propose two specific
times rather than a booking link — that is what `recover.py` does for the ones
that then go quiet.

## ⚠️ No call in this directory has ever been answered by the real API

`api.explee.com` is blocked by the sandbox this was written in, exactly like
`linkfinderai.com`. The endpoints, the pricing and the limits come from Explee's
published docs; the *response field names* for the inbox, thread and analytics
endpoints are not published, so every field is read through `first_of`, which
tries the plausible spellings and raises a `ShapeError` naming what it looked for
and what the payload actually held.

**Before the first `--apply`, spend one minute on this:**

```bash
export EXPLEE_API_KEY=...
python3 explee.py GET /public/api/v1/billing/balance
python3 explee.py GET /public/api/v1/autogtm/campaigns
python3 explee.py GET /public/api/v1/autogtm/campaigns/<id>/inbox?tab=replied
python3 explee.py GET /public/api/v1/autogtm/campaigns/<id>/inbox/<person_id>
python3 explee.py GET /public/api/v1/autogtm/campaigns/<id>/analytics
```

Read the JSON. If a key is spelled differently than the lists in `recover.py`
(`INBOUND_WORDS`, `message_direction`, `thread_view`) or `leadsource_test.py`
(`read_arm`), add the spelling — that is the whole integration risk, and a dry
run will tell you loudly rather than quietly reporting zero.

## Start here: sending is 83% of the cost

**[SENDING.md](SENDING.md)** — Explee sends as `Brian Carter <b@usetidegrove.com>`
while you already own nine warmed mailboxes on your own domains landing 100% in
the inbox. Moving sending onto them cuts cost per interested lead from $13.54 to
about $6, which is more than any lead source in this directory can do.

## The measured baseline

**[BASELINE.md](BASELINE.md)** — the real dashboard numbers as of 2 Sept 2026:
5,231 emails, 1.05% reply, 14 interested, $11.21 per interested lead. It replaces
the illustrative figures in the original plan, and it shows that the $50 target
is exactly a 22% interested-to-booked rate. Read it before deciding anything.

## It runs itself on GitHub Actions

`.github/workflows/explee-followups.yml` runs the loop **once a day at 07:00
UTC** — 9am in Paris over summer, 8am over winter — in this repository, on
GitHub's machines. No laptop, no server, no cron of your own -
the same reason `publish-integrations.yml` exists: Explee cannot be reached from a
development sandbox.

**You do exactly one thing:**

> Repository **Settings → Secrets and variables → Actions → New repository
> secret**, name it `EXPLEE_API_KEY`, paste the key from Explee's account menu →
> API Keys.

That is it. The schedule then runs a **dry run** each morning and prints exactly
what it would have sent, in the Actions tab. Read a few, and when the
drafts look right:

> Same page → **Variables** → New variable → `EXPLEE_APPLY` = `true`

Now it sends. Set that variable to anything else and it goes back to dry running -
no code change, no deploy. There is also a **Run workflow** button with an
*Actually send* checkbox for a one-off run.

Two runs never overlap (a `concurrency` group), so a lead cannot be mailed twice
by two schedules colliding.

**Daily is a trade, and it is the right one here.** A reply that lands at 9:05am
waits until tomorrow morning for its answer, and conversion does drop with the
hours. What you get back is a human cadence — one considered pass a day rather
than a machine replying within minutes of someone hitting send. If a particular
lead cannot wait, the **Run workflow** button does an immediate pass, and Explee's
own Auto-replies (project settings, `auto_reply_enabled`) cover the
answer-instantly case without this loop at all.

## Setup

```bash
python3 test_explee_autogtm.py         # 64 tests, no network, no key needed
```

**The API key never goes in a file that is committed.** Two places it can live,
and nothing here writes it anywhere else:

```bash
export EXPLEE_API_KEY=...                    # a shell, or your shell profile
echo 'EXPLEE_API_KEY=...' > secrets.env      # or this file, which is gitignored
```

`secrets.env` is the one to use for cron, so the key is not sitting in your
crontab. Get the key under **API Keys** in the Explee account menu, bottom-left.

## Action 2 — the lead source test (start here)

Read [SOURCES.md](SOURCES.md) first — it picks the source, and the answer
changed once France was the constraint. Short version: Explee is already the
cheapest lead in the market at ~$0.025, so no source is worth switching to for
cost — only for French coverage. The test worth running first is not a sending
test at all: take 500 French companies from SIRENE (free), ask Explee and Pharow
for the buyer at each, and compare fill rate. About $30, one day, no emails sent.

```bash
# 0. the ICP, in plain English -> the exact filter shape. Free, no credits.
python3 leadsource_test.py filters \
    --query "founders and heads of sales at B2B lead generation agencies and \
             sales-technology companies in the US and UK" --out filters.json
```

### The run: Pharow against Explee

Two new campaigns, same brief, same week, same ICP. The live campaign keeps
running and stays out of the test.

```bash
# 1. the ICP, in plain English -> the exact filter shape. Free.
python3 leadsource_test.py filters --out filters.json \
    --query "responsables et directeurs des achats in French companies of 250 to 1000 employees"

# 2. the Explee arm: 500 French buyers, ~$12 (1 credit a person, 1.5 an email found)
python3 leadsource_test.py control --filters filters.json --count 500 \
    --out explee.leads.json --apply

# 3. the Pharow arm: export from Pharow, then map its French headers.
#    French exports are semicolon-separated and titled Prenom/Nom/Email pro/Poste/
#    Site web - prepare sniffs the separator, maps those names and turns
#    "https://www.acme.fr/contact" into "acme.fr". Anything it cannot place is
#    listed so you can --map it.
python3 leadsource_test.py prepare --csv pharow-export.csv \
    --out pharow.leads.json --exclude explee.leads.json

# 4. both into AutoGTM on the SAME brief - import refuses the second arm otherwise
python3 leadsource_test.py import --project <id> --name "Source test - Explee" \
    --leads explee.leads.json --brief brief.json --apply
python3 leadsource_test.py import --project <id> --name "Source test - Pharow" \
    --leads pharow.leads.json --brief brief.json --exclude explee.arm.json --apply

# 5. two weeks later, both arms over the same days
python3 leadsource_test.py compare --arm explee.arm.json --arm pharow.arm.json \
    --period 30d --calls calls.json
```

**What it costs:** Pharow EUR 105 for 1,000 credits (better value than the EUR 90
/ 500 pack) + ~$12 of Explee + the sending, which you pay either way. `calls.json`
is `{"<campaign_id>": {"booked": 4, "showed": 2}}` from your calendar - it is what
turns the comparison into cost per call.

**Free sanity check first, while you set this up:** Pharow's 15-day trial gives
100 credits. Pull 100 leads for the same ICP, then:

```bash
python3 leadsource_test.py prepare --csv pharow-trial.csv --out trial.leads.json
python3 leadsource_test.py overlap --leads trial.leads.json --apply    # ~$1
```

**The 100 free leads answer coverage, not conversion.** They cannot be an arm of
the sending test: put them in a campaign and that campaign *is* the Pharow arm -
there is no Explee arm, because those are Pharow's people. The same list on both
sides measures nothing. And 100 leads at a ~5% reply rate is five replies, which
is noise, not a result; the gate is 300 a side for a reason.

So the trial buys you three answers, all of them cheap and none of them requiring
a send: what share Explee cannot find, whether the titles are really the buyers
you asked for, and whether the emails are real. Only the first needs a tool.

`overlap` asks Explee for the same people at the same companies and reports what
share of the list Explee simply cannot reach. That number decides which argument
applies: mostly-unique means it is a reach decision and the price stops mattering;
mostly-overlapping means the premium has to clear 2.17x on reply rate alone.

**Reply rate is measured per lead, not per email**, whenever both arms report
their lead count - which they do when both were imported. Per-email flatters
whichever arm is further into its sequence, and early in a test that is just
whichever one started first.

`import` hashes the brief and refuses the second arm when it differs; `prepare`
and `control` drop anyone already in the other arm (a lead in both replies once
and credits an arm at random); `compare` says so out loud if the arms started on
different days.

**The verdict gates** implement the plan's rule literally — 2x or drop it:

| Gate | Value | Why |
|---|---|---|
| `MIN_LEADS_PER_ARM` | 300 | below this, nothing is readable |
| `MIN_REPLIES_TOTAL` | 12 | across both arms, before reply rate decides anything |
| `SCALE_EFFECT` | 1.0 (2x) | a 30% edge is noise wearing a suit |
| `ALPHA` | 0.05 | two-proportion test on reply rate |

A significant but small lift returns **drop**, on purpose: the sourced data costs
more than a 30% edge is worth.

## Action 1 — the follow-up loop (the only lever left)

**The design, in one line: every replied lead gets read, anyone who said
something positive and then went quiet gets followed up — up to three times —
and you stop it on one person by writing `booked` or `stop` in their note in
the Explee inbox.** (The Google Sheet below is optional now; it used to be the
only way to say who booked.)

Explee's own support confirmed why this has to exist: *"once a lead replies, the
automated sequence is over for them for good; there's no automatic win-back."*

### One project per customer

You run several Explee projects. Each gets a file in `projects/`, and one cron
line runs all of them:

```bash
python3 recover.py --init "Acme Corp"     # writes projects/acme-corp.json
python3 recover.py --all                  # dry run, every project
python3 recover.py --all --apply          # send, every project
```

A project file is the whole configuration — the Explee project id, the sheet, the
language, and the copy the follow-ups use:

```json
{
  "name": "acme",
  "project_id": 12345,
  "language": "fr",
  "timezone": "Europe/Paris",
  "sheet": {"webapp_url": "https://script.google.com/.../exec", "token": "..."},
  "copy": {"sender": "Eliasse", "offer": "one line", "topic": "outbound"}
}
```

`projects/example.json` is the real linkfinderai one (project 30475) with the
sheet fields blank. **Project files are gitignored** apart from that example,
because they hold sheet tokens.

### Making the sheet — 60 seconds

The sheet does not exist yet; you create it once per project and it is a blank
Google Sheet with one header row.

1. Open **sheets.new**.
2. Paste the single line in **`hot-leads-template.tsv`** into cell A1. It is
   tab-separated, so it fills the columns in one go. (Or File → Import →
   `hot-leads-template.csv`, which comes with Jérôme already marked booked.)
3. File → Share → **Publish to web** → this sheet, **CSV** → copy the URL.
4. Put it in your project file as `sheet.csv_url`, then:

```bash
python3 recover.py --all           # dry run - reads the sheet, sends nothing
```

That is the whole setup. Upgrade to the Apps Script web app later, when pasting
new hot leads in by hand gets old.

The columns, and who fills them in:

| You type | Filled in for you |
|---|---|
| `booked`, `stop` | everything else |

### Set the sheet up once

A Google Sheet with two columns that matter — `email` and `booked` — plus
whatever else you like (`first_name`, `company`, `campaign_id`, `person_id`,
`became_hot_at`). Then either:

**Read-only, two minutes.** File → Share → Publish to web → CSV. New hot leads
get written to `hot-leads-to-paste.csv` for you to paste in.

```bash
python3 recover.py --sheet-csv "https://docs.google.com/.../pub?output=csv"
```

**Read and write.** Paste `sheet-bridge.gs` into Extensions → Apps Script, set
`TOKEN`, deploy as a web app (*Execute as: Me*, *Anyone with the link*), then new
hot leads append themselves and you only ever type in the Booked column.

```bash
python3 recover.py --sheet-webapp "https://script.google.com/macros/s/.../exec" \
                   --sheet-token "your-token"
```

**Two ways to take someone out of the loop**, and they mean different things:

| Column | Meaning | Counts as a win |
|---|---|---|
| `booked` | they have a call | yes |
| `stop` | leave them alone for any other reason — you answered them yourself, they are already a customer, you just do not want them chased | no |

Both halt the follow-ups immediately. **Jérôme goes in `booked`** — he took the
call, so he counts. `stop` is for the other kind of "dealt with": answered,
already a customer, or simply not to be chased. You type **anything**:
`x`, `oui`, a date, a tick. Blank, `no`, `non`, `0` and `-` mean not marked.

### What the sheet shows you

Sync fills in the context so a lead can be judged without opening Explee:
`first_name`, `company`, `job_title`, `campaign`, `replied_at`, and an `inbox`
link. Then every run writes back three columns you never type in:

| Column | What it tells you |
|---|---|
| `last_reply` | the first 300 characters of what they actually said |
| `followups_sent` | 0, 1 or 2 — and 3 means the loop is finished with them |
| `next_action` | `2026-09-05`, `re-engage on 2026-12-01`, `sent nudge today`, or why it stopped |

Delete any column you do not want; only `email` is required.

### What each run does

1. **Sync** — pulls hot leads from every campaign into the sheet (duplicates are
   dropped by email, so it is safe to run every five minutes).
2. **Read the booked column.** If the sheet cannot be read, **nothing sends** —
   an empty booked set would mail everyone who booked this week.
3. **For every replied conversation**, one of two jobs:
   - *they spoke last* → classify the reply and answer it with **two named times**
   - *we spoke last and they went quiet* → **nudge**, after 2 days, then 5 more

```bash
python3 recover.py --sheet-csv "..."            # dry run: prints every mail it would send
python3 recover.py --sheet-csv "..." --apply    # send
0 7 * * * cd /path && python3 recover.py --all --apply     # only if not using Actions
```

### The gates, in order

| Gate | Why |
|---|---|
| marked booked in the sheet | the whole point |
| `can_reply` is false | Explee's compliance gate — unsubscribed, or never replied |
| **3 replies already sent** | the API allows at most three per message they sent; a fourth is a 429 |
| classifier says no | *non merci*, *pas intéressé*, out of office, a spam complaint — never nudged |
| already handled (note marker) | written into the lead's shared note, so a teammate sees it and a second machine does not repeat it |
| `MAX_SENDS_PER_RUN = 25` | a classifier bug costs 25 emails, not an inbox |

A `"recontactez-moi en janvier"` is queued to its own date rather than nudged in
two days, and fires itself when due.

### It writes French

The classifier reads both languages — the five real replies on your dashboard
(*"L'approche au résultat me plait. Open pour un 1er échange"* → warm;
*"Non merci !"*, *"pas très convaincant… vos mails partent dans les spams"* →
never contacted again) — and `"language": "fr"` in `config.json` switches the
templates and the proposed times (*jeudi 4 septembre à 15h00*, not *Thursday*).

## The number that decides whether any of this worked

```bash
python3 baseline.py --project 4021 --booked 10 --showed 5 --label 2026-08 --save
```

Pull it **now**, before changing anything. Explee knows what it sent, what
replied, what went hot and what it cost; it does not know who turned up, so
`--booked` and `--showed` are typed in from the calendar and stored next to the
spend they belong to (`cost-per-call.json`). If half the calls no-show, a $50
cost per call is really $100 — the tool says so — and that is a different problem
from lead sourcing, fixed by confirmations and reminders, not by better data.

## What a human still has to do

- Verify the response shapes once, per the block at the top.
- Pick a source from [SOURCES.md](SOURCES.md) and export a CSV. Accept that the
  intent arm may lose — that is what a test is.
- Read a dry run before the first `--apply`. These are real emails to real people.
- For Action 1 only: export `booked.json` from Calendly, or ask for the Calendly
  reader so it stops being a manual step.

## Files

| File | What |
|---|---|
| `explee.py` | API client + `python3 explee.py GET <path>` for checking shapes |
| `followups.py` | reply classifier, the two-slot generator, the templates |
| `recover.py` | Action 1: scan the inboxes, decide, send, mark the note; writes `reports/` |
| `state.py` | `reports/state.json`: what every task last did, read by the page |
| `report_page.py` | renders the state into `/autogtm-report.html` at the repo root |
| `sequence.py` | replies by step, and shorten a campaign's sequence once the numbers say so |
| `prequalify.py` | score people on the campaign's criteria, import only the ones that pass |
| `leadsource_test.py` | Action 2: prepare / control / import / compare |
| `baseline.py` | cost per call that actually showed up, before and after |
| `instantly_leads.py` | Instantly SuperSearch leads -> the CSV `prepare` eats |
| `SOURCES.md` | every lead source with real France coverage, priced per usable lead |
| `leadsource_test.py overlap` | what share of another source's list Explee cannot reach |
| `brief.json` | the campaign copy both arms share - per-record project, not the subscription |
| `test_explee_autogtm.py` | 82 tests, offline |
