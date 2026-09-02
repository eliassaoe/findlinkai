---
name: lead-finder
description: Find high-intent B2B leads and load them into an outreach campaign. Use when someone asks who they should target, wants an ICP worked out, wants leads sourced from LinkedIn post engagement or named accounts, or wants a lead list enriched and pushed into Instantly or another sequencer. Drives lead-finder/ in this repo.
---

# Finding high-intent leads

You are the half of this system that thinks. `lead-finder/` is the half that spends
money. Keep that boundary: you decide *who* and *why*, the code decides *how much*,
and no credit is spent without the person in front of you agreeing to a number first.

## The shape of the work

1. Work out who they should target.
2. Turn one of those into intent signals — things a person did recently.
3. Write an agent file.
4. Dry run. Read the rejection tally. Fix the ICP. Dry run again.
5. Live run against a stated credit cap.
6. Write the outreach copy from the signal, push, and report.

## 1. ICPs

Read their site (`WebFetch`), then propose **five** ICPs. Each one names the job
titles, the company size, the trigger that makes them buy, and — the part that makes
this useful — the objection you would have to beat. Ask which one to start with;
do not pick for them unless they ask you to.

If they already sell to someone, say so plainly: the best ICP is usually the one their
last ten customers came from, not the largest market.

## 2. Intent signals

An ICP is a description. A signal is something a named person did this month. For each
proposed ICP, name the signals worth watching, then get the ones this repo can actually
read:

- **`linkedin_post_reactions`** — everyone who reacted to one post. Use a competitor's
  launch or pricing post, an industry post about the pain you solve, or a hiring post
  for the role that owns your problem. This is the strong signal.
- **`company_employees`** — employees at a named account, filtered by department and
  seniority. No timing signal; use it to cover accounts they have already chosen.

**Never invent a post URL.** Ask them to paste real ones, or search for real posts and
show them what you found. A made-up URL fails the run, and a stale one — anything more
than about two weeks old — is not intent, it is archaeology. Say that out loud when you
ask.

## 3. Write the agent file

Copy `lead-finder/agents/revops-hubspot.json`, keep the shape, and fill it in. Things
that go wrong when you are careless:

- `excludeCompanies` must include their own domain and their competitors. Without it
  the first live run emails a competitor's VP of Sales.
- `titles.include` matches on substrings of the job title. `"sales"` catches "Sales
  Intern"; `"vp sales"` and `"head of sales"` do not. Put the junk in `titles.exclude`.
- Reaction records carry no country and no company size, so those filters only bite on
  employee-list records. Do not promise geographic filtering on a post-only agent.
- `maxItems` is a spend cap on a per-record charge, not a preference.

Then `node bin/lead-finder.mjs plan agents/<id>.json` and show them the worst case in
credits before going further.

## 4. Dry run, then fix the ICP

```bash
node bin/lead-finder.mjs run agents/<id>.json
```

This sources and scores but spends nothing on enrichment. The output you care about is
the rejection tally. Read it as a diagnosis:

| What you see | What it means |
| --- | --- |
| `title_mismatch` is most of them | The include list is too narrow, or the post's audience is not this ICP |
| `qualified` is nearly everyone | The ICP is not filtering — you will pay to enrich people who will never buy |
| Almost nobody clears `minScore` | The threshold is above what a single source can produce; either lower it or add a second signal |
| 3 leads from a 150-reaction post | Wrong post, not a wrong ICP. Find a better one |

Iterate here. It is free, and it is the only place the ICP gets any evidence.

## 5. The live run

Never run `--live` without doing all three of these first:

1. Show the plan's credit number.
2. Say what `--max-credits` you will pass, and why.
3. Get an explicit yes.

```bash
node bin/lead-finder.mjs run agents/<id>.json --live --max-credits 400
```

Report what came back honestly: emails found, emails not found (still charged),
what stopped the run. A lookup that returns nothing costs the same ten credits as one
that works — never present the spend as if only successes counted.

## 6. Copy, push, report

The signal is the copy. A first line that names what they engaged with is the entire
advantage of sourcing this way, so write one per lead from the source they came from —
never a merge field with nothing behind it. If a lead came only from an account list,
say so and write them a different, weaker opener rather than pretending there was a
trigger.

Push with a `destination` on the agent, or export the CSV and hand it over. Then
`report` for what the sources are actually producing. Replies live in the outreach
tool, not here — pass them in with `--stats` or say the column is unknown. Do not
guess a reply rate.

## Running it weekly

`.github/workflows/lead-finder.yml` is the routine. It defaults to `plan` so the
schedule alone never spends. Before scheduling a live one, tell them the standing cost
per run and that post URLs go stale — a weekly routine on a fixed post URL finds the
same people forever, and the seen-list means it will correctly find nobody at all.

## Rules

- No credit spent without an explicit yes to a number.
- Never invent a LinkedIn URL, a person, a company, or a reply rate.
- The tests run offline (`cd lead-finder && npm test`). If you change the scoring,
  change the test that pins it — that file is the specification of who gets paid for.
