# SEO/AEO campaign builder

Domains in, send-ready rows out. Copy for the emails lives in
`docs/seo-service-outbound.md`; this is the machine that fills it in.

```
domains.csv
  -> LinkFinder  company_domain_to_employees   decision maker      (1 credit)
  -> LinkFinder  linkedin_profile_to_email     their email        (10 credits)
  -> LLM         "best <category> tools?"      named? who is?     (~$0.0002)
  -> composed email
  -> instantly_import.csv
```

## Run it

```bash
# costs nothing, uses fixtures, proves the wiring
python3 outbound/build_campaign.py --input outbound/fixtures/domains.sample.csv --dry-run

# for real
export LINKFINDER_API_KEY=...        # your dashboard key
export OPENROUTER_API_KEY=...        # or --llm-provider openai + OPENAI_API_KEY
python3 outbound/build_campaign.py --input outbound/domains.csv --limit 25
```

Input CSV needs three columns, all required:

```csv
domain,company,category
chargebee.com,Chargebee,subscription billing
```

`category` is what a buyer would actually type — "subscription billing", not
"SaaS". It is the query put to the model, so it decides the whole email.

`--limit` defaults to 25 (~275 credits). It is a spend guard, not a page size.
Contacted domains are appended to `outbound/contacted.txt` and skipped next run.

## Why it asks a model per prospect instead of guessing

The email says *"I asked ChatGPT for the best {category} tools this morning.
{c1} and {c2} came up. {company} didn't."* That is a claim about something we
did, sent to a real person. So the script does it, once per prospect, and
**skips anyone whose check fails** — there is no code path that produces a
competitor name without a model returning it.

That is also the commercially correct choice. You are pitching technical SaaS
marketers on their own category. Name a company that is not actually a
competitor and you have proven you did not look — which is worse than not
sending at all. The real answer costs about two hundredths of a cent.

Two prospects get dropped on purpose:

- **check failed** — no usable answer from the model, so the opener would
  assert something we never established.
- **already visible** — the model *did* name them. The opener would be false,
  and they are a weaker prospect anyway.

`--dry-run` exercises both, plus no-person and no-email.

## Pushing into the Instantly campaign

The campaign already exists, in draft:

```
SEO/AEO service — B2B SaaS (AI visibility opener)
eb621d4c-db05-499b-99fc-28baad2e6e49
```

Three steps (day 0 / +3 / +5), text-only, **open and link tracking off**,
20/day per account, 12 minutes between sends, stops on reply and auto-reply.
Tracking is off deliberately: a pixel and rewritten links are what make a
one-to-one email look like a campaign, and this one lives or dies on reading
as a person who looked something up.

```bash
export INSTANTLY_API_KEY=...
python3 outbound/build_campaign.py --input outbound/domains.csv --limit 25 \
  --instantly-campaign eb621d4c-db05-499b-99fc-28baad2e6e49
```

The sequence interpolates five variables. `first_name`, `company_name` and
`website` map onto Instantly's built-ins; `category`, `competitor_1` and
`competitor_2` are pushed as custom variables under exactly those keys. Change
a key here and the email goes out with a literal `{{competitor_1}}` in it.

A push that fails raises rather than passing quietly — a lead you believe you
contacted and never did is worse than a visible error. Failures stay in the
CSV so you can add them by hand.

## Sending

**The campaign is in draft and cannot send yet.** All 38 accounts return `status: -1` with
`EAUTH / can't create new access token` — revoked Google tokens, dead since
17 March, and a filter for active accounts returns an empty list. That is
task #29 and it is a browser OAuth job per account.

So, today:

**Send by hand.** Open `instantly_import.csv`, 20 a day from your own inbox.
The `subject` and `body` columns are final text — no merge fields left. This is
the faster path anyway: a $1,500 offer needs ten conversations, not volume, and
manual sends need no warmup.

**Once #29 is done:** Instantly imports this CSV directly (Leads → Import CSV),
mapping `email`, `first_name`, `company_name`, plus `subject`/`body` as custom
variables. Then re-warm before volume — accounts idle since March will burn the
domains if you open at full rate.

## Where the leads come from

This script does **not** source companies — it enriches a list you supply.
LinkFinder's own AI lead search was removed on 23 Aug (unapproved Apify actor,
403 for every user — `docs/lead-search-bugs.md`), so there is no working
discovery step to call.

Build the seed list from a directory where B2B SaaS self-identify by category
(G2, Capterra, a niche listicle). Category quality matters more than volume:
200 well-categorised domains outperform 2,000 vague ones, because `category`
is the input to the only personalised sentence in the email.

## Files

| | |
| --- | --- |
| `build_campaign.py` | the pipeline |
| `test_logic.py` | unit tests for parsing + prospect matching |
| `fixtures/` | dry-run data covering all four skip paths |
| `contacted.txt` | dedupe ledger, appended on every real run |
| `run_log.jsonl` | one line per composed email, incl. the model's full list |

`instantly_import.csv`, `contacted.txt` and `run_log.jsonl` are outputs and
carry prospect emails — they are gitignored, keep them out of the repo.

## Tests

```bash
python3 outbound/test_logic.py
```

Covers the two functions that could silently put a **wrong name into a real
email**: the model-output parser (fenced JSON, prose, numbered lists,
refusals) and the prospect matcher (`Chargebee` / `charge bee` /
`Chargebee Billing` / `Chargebee.io` all resolve to the prospect, and a
too-short brand never matches by accident).
