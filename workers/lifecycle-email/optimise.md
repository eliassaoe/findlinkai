# The weekly job

A Routine fires a fresh Claude session every Monday. That session has no memory of
last week — everything it needs is this file, the repo, and PostHog. Follow it in
order. It takes about ten minutes and it is mostly copy-paste.

The one rule: **you collect the numbers, `decide.py` decides.** An LLM asked
"did the new subject win?" says yes almost every time — it sees 12 clicks against
9 and reads a trend. Do not form an opinion about the winner. Run the script and
carry out what it prints.

---

## 0. Get to the code

```bash
cd /home/user/findlinkai
git fetch origin claude/revenue-sales-analysis-12rk4c || true
git checkout claude/revenue-sales-analysis-12rk4c 2>/dev/null || git checkout -B claude/revenue-sales-analysis-12rk4c origin/claude/revenue-sales-analysis-12rk4c
git pull --ff-only origin claude/revenue-sales-analysis-12rk4c || true
cd workers/lifecycle-email
```

If that branch has been merged, work from the default branch instead — the files
are the same.

## 1. Check the loop is actually receiving data

```
mcp__posthog_mcp__exec:  call execute-sql {"query":"SELECT event, count() FROM events WHERE event LIKE '$workflows_email_%' AND timestamp > now() - INTERVAL 14 DAY GROUP BY event ORDER BY 2 DESC"}
```

Zero rows means one of two things and you must find out which before doing
anything else:

- **Engagement events are off.** PostHog → Settings → Workflows → Engagement
  events. It is off by default and **does not backfill**, so every day it stays
  off is a week of data that can never be recovered. If this is the cause, stop,
  tell Eliasse in one line, and do nothing else.
- **The workflows are still drafts.** `call workflows-list {}` — status must be
  `active`, not `draft`. Same deal: report and stop.

`$workflows_email_sent` present but `_opened` / `_link_clicked` absent for more
than a week is a tracking problem, not a copy problem. Say so and stop.

## 2. Pull the numbers

`measure.sql` is the query. Substitute the two placeholders and run it:

```bash
python3 - <<'PY'
import json
q = open('measure.sql').read().replace('{window_days}','90').replace('{attribution_days}','7')
print(json.dumps({'query': '\n'.join(l for l in q.split('\n') if not l.strip().startswith('--') and l.strip())}))
PY
```

Pass that object to `mcp__posthog_mcp__exec: call execute-sql <object>`, then save
the result to `measure.json` as a list of row objects (keys: `subject`, `sent`,
`opened`, `clicked`, `converted`, `bounced`, `failed`, `first_sent`, `last_sent`).
`decide.py` also accepts execute-sql's raw `{columns, results}` shape, so saving
the response verbatim is fine.

## 3. Decide

```bash
python3 decide.py measure.json          # look first
python3 decide.py measure.json --apply  # then commit to it
```

One line per step. The actions:

| Action | What it means | What you do |
|---|---|---|
| `WAIT` | not enough data, or the two arms have not separated | nothing |
| `START` | champion has a real baseline, put the next challenger up | step 4 |
| `PROMOTE` | the challenger won | step 4 |
| `RETIRE` | the challenger lost or drew | step 4 |
| `EXHAUSTED` | every variant on that step has been tested | step 6 |
| `UNDERPOWERED` | the step is too quiet to ever A/B | leave it; mention it once |
| `ALARM` | bounce rate over 3% | **stop.** Deliverability, not copy. Report and do nothing else. |
| `BROKEN` | `variants.json` is inconsistent | fix it before anything else |

`--apply` rewrites the `status` fields in `variants.json` and stamps each
variant's latest numbers onto it. That file is the record — git history is the
audit trail of every decision this loop has ever made.

## 4. Push the copy that should now be live

For each step the script listed under "need a copy swap":

```bash
python3 build_email.py <step> <variant-id>
```

That prints the exact argument object for `workflows-patch-action-email` —
`id`, `action_id`, `operations`, `email_patch`. Drop the `_meta` key (it is for
your log, not for PostHog) and send the rest:

```
mcp__posthog_mcp__exec:  call workflows-patch-action-email <object>
```

Then, for each workflow you touched:

```
call workflows-test-run {"id":"<workflow_id>","mock_async_functions":true}
call workflows-publish  {"id":"<workflow_id>"}
```

**`workflows-publish` is not optional.** Patching an active workflow stages a
draft; without publishing, nothing you did this week reaches a single person.

Sanity check before you publish: the response's
`actions[].config.inputs.email.value.html` must be non-empty for every email
step. A missing `html` means the email fails at send time. It has happened
before — the design ops in `build_email.py` force a server-side re-render, so if
`html` is empty something went wrong and you should not publish.

## 5. Commit

```bash
git add -A && git commit -m "email loop: <one line of what changed and why>"
git push -u origin claude/revenue-sales-analysis-12rk4c
```

Retry a failed push up to four times, backing off 2s, 4s, 8s, 16s.

## 6. When a step is EXHAUSTED

Write two or three new variants into `variants.json` for that step, as `queued`.
Rules, all of them learned the hard way:

- **A new angle, not a rewrite.** The `_angles` block at the top of
  `variants.json` lists what has been tried. Sequential tests can only resolve
  big differences, so a variant that is the champion with better adjectives
  wastes six weeks to prove nothing.
- **Never optimise for opens.** Apple Mail Privacy Protection fabricates opens
  for people who never looked, inflating the number 12–18%. Curiosity-bait
  subjects reliably post 40% opens against 2% clicks. `decide.py` cannot promote
  on open rate by construction; do not undo that.
- **Subject under 60 characters**, one idea, lower case reads like a person.
- **One call to action.** The skeleton has exactly one button and that is
  deliberate.
- Fill in `hypothesis` honestly — it is what makes the result mean something
  when it comes back six weeks later.

Then run the validator:

```bash
python3 -c "
import json; d=json.load(open('variants.json'))
for k,s in d['steps'].items():
    assert sum(v['status']=='champion' for v in s['variants'])==1, k
    assert sum(v['status']=='testing' for v in s['variants'])<=1, k
    for v in s['variants']: assert set(('id','angle','status','hypothesis','subject','preheader','body','cta','url','after','reason')) <= set(v), (k,v['id'])
print('ok')"
```

## 7. Report

One short message to Eliasse. What changed, what it is now testing, and the one
number that matters. If nothing changed, say that in a sentence — a quiet week is
a real result and padding it out makes the loop harder to trust.

Do not report open rates as if they were good news.

---

## What this loop cannot do

Worth re-reading whenever it seems to be underperforming.

**It is sequential, not concurrent.** PostHog holds one email per step, so the
champion and the challenger run in different weeks. A good fortnight can look
like a good subject line. `MIN_EFFECT` (25%) and the alpha ladder push back on
that, but they do not eliminate it — they trade sensitivity for trust, on
purpose.

**It cannot test the quiet steps.** `checkout_2` and similar send a handful a
week. At that volume no test will ever conclude, and `decide.py` says
`UNDERPOWERED` rather than pretending. More traffic into the step is the fix; a
cleverer subject line is not.

**Volume sets the clock.** The welcome step sends ~130/week. That is roughly
three weeks to bank a baseline and three more for a challenger — about one
answer every six weeks, four or five a year per step. A five-arm concurrent test
on this volume would need six months to resolve, which is why the design is one
challenger at a time.

**Conversion is sparse.** Until a step accumulates 8 conversions across both
arms, clicks decide. Clicks are a proxy and a click that never converts is worth
nothing, so treat any click-only promotion as provisional.
