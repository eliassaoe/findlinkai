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

## The measured baseline

**[BASELINE.md](BASELINE.md)** — the real dashboard numbers as of 2 Sept 2026:
5,231 emails, 1.05% reply, 14 interested, $11.21 per interested lead. It replaces
the illustrative figures in the original plan, and it shows that the $50 target
is exactly a 22% interested-to-booked rate. Read it before deciding anything.

## Setup

```bash
cp config.example.json config.json     # sender, offer line, timezone, slot hours
export EXPLEE_API_KEY=...
python3 test_explee_autogtm.py         # 40 tests, no network, no key needed
```

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

## Action 1 — recover the leaked replies (parked)

### The booking problem

**Explee cannot tell you who booked a call.** Its inbox knows replies; the
booking lives in Calendly. So `recover.py` takes `--booked booked.json`, a list
of email addresses you export yourself, and without it the script will cheerfully
follow up someone who booked yesterday.

Three ways out, cheapest first:

1. **Export it by hand** once a week from Calendly. Fine to start, dies of
   boredom by week three.
2. **Read Calendly's API** — `GET /scheduled_events` plus `/invitees` gives you
   the invitee emails, it is one endpoint and about twenty lines in `explee.py`
   style. This is the real fix and it is not built yet.
3. **Only follow up threads nobody answered** — already how it behaves: a lead
   who booked almost always has a human reply in the thread, and that stops us.
   It is a decent proxy, not a guarantee.

Until (2) exists, treat this half as **not ready to run unattended**.

```bash
python3 recover.py                                     # dry run: prints every mail it would send
python3 recover.py --booked booked.json --apply        # send
```

`booked.json` is a list of email addresses that already have a call, exported
from your calendar or CRM (a JSON array, or one address per line). Without it
this will happily follow up someone who booked yesterday, so treat it as
required, not optional.

`--calendar-views opened.json` (same format) is the list of people who opened
your scheduler and did not book — Cal.com/Calendly can export it. It unlocks the
plan's "opened calendar, didn't book" row; without it those leads get the warm
follow-up instead, which is a softer version of the same move.

**The five gates that stop a send**, in order: `can_reply` false · in `booked` ·
somebody already answered the lead's last message · our marker is already in the
lead's note for that exact message · the classifier returned a silent bucket
(unsubscribe, out of office, not interested, already booked, unrecognised).
`MAX_SENDS_PER_RUN = 25` caps the damage a classifier bug can do.

**State lives in the lead's shared note**, not in a local file, so a teammate
sees why a follow-up went out and a run from another machine does not repeat it:

```
Met at SaaStock. Wants phone data, not emails.

[explee-recovery]
2026-09-02T10:04Z bucket=send_info msg=a91f2c action=sent
2026-09-02T10:04Z bucket=not_now msg=7c11de action=queued due=2026-12-01
[/explee-recovery]
```

**"Not now" is a dated queue, and it fires itself.** Nothing sends at the time;
the due date is parsed from the lead's own words ("in 2 weeks", "next quarter")
and a later run picks it up and sends the re-engage mail once.

**Speed is the point** — conversion drops by the hour, so run it on a cron every
five minutes rather than nightly:

```
*/5 * * * * cd /path/workers/explee-autogtm && EXPLEE_API_KEY=... \
  python3 recover.py --booked booked.json --apply >> recover.log 2>&1
```

Every sending template proposes **two named times**, in business hours, on two
different days, at least 18 hours out. Never a bare link — that is what the leak
is made of. `compose()` refuses to return a message that lost its slots, so a
template edit cannot quietly turn these back into "here's my calendar".

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
