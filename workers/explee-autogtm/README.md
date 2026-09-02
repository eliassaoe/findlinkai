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
    --period month --calls calls.json
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

**The design, in one line: every hot lead lands in a Google Sheet, you tick the
ones who booked, and anyone unticked gets followed up — up to three times, then
we stop.**

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
*/5 * * * * cd /path && EXPLEE_API_KEY=... python3 recover.py --sheet-csv "..." --apply
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
| `recover.py` | Action 1: scan the inboxes, decide, send, mark the note |
| `leadsource_test.py` | Action 2: prepare / control / import / compare |
| `baseline.py` | cost per call that actually showed up, before and after |
| `instantly_leads.py` | Instantly SuperSearch leads -> the CSV `prepare` eats |
| `SOURCES.md` | every lead source with real France coverage, priced per usable lead |
| `leadsource_test.py overlap` | what share of another source's list Explee cannot reach |
| `brief.json` | the campaign copy both arms share - per-record project, not the subscription |
| `test_explee_autogtm.py` | 40 tests, offline |
