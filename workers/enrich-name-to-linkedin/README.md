# enrich-name-to-linkedin

`lead_full_name_to_linkedin_url` as a Cloudflare Worker. The first branch of the
n8n enrichment router to move into code.

## Why this one first

It is the highest-volume enrichment on the platform — 13,333 runs in 60 days,
more than every other type combined — and it returns nothing 44% of the time.
Moving it is worth more than the other twenty branches put together, and it
establishes the pattern for them.

## What changed against n8n

The n8n branch queries Serper, then accepts `organic[0]` if its title contains
token 0 and token 1 of the input. Four things go wrong with that:

| Problem | Effect | Fix here |
|---|---|---|
| Only `organic[0]` is considered | The right profile at position 2+ is discarded and reported "not found" | Scores the top 10 — they were already in the same response |
| No check that the link is a profile | `/company/`, `/posts/`, `/pulse/` URLs pass and get returned | `isProfileUrl()` gate |
| `contains` on raw strings | "José" never matches "Jose"; `O'Brien` never matches `OBrien` | `normalize()` strips accents and punctuation |
| token[1] assumed to be the surname | "Jean Pierre Dupont" matches against "Pierre" | Shape-based parsing, scores every name token |

Unchanged on purpose: the upstream provider, the credit prices (1 on a hit, 0.5
on a miss, matching `Code97`/`Code24`), and the response shape
`{result, status}`. This has to be swappable behind the existing webhook one
request at a time, so identical output is the point.

Two behaviour changes that are deliberate, not accidental:

- **An input with no name costs nothing.** n8n charges the not-found fee for
  input it could never have resolved.
- **An upstream outage returns 502, not an empty result.** Reporting "not found"
  when Serper is down bills the customer for our failure and poisons the fill-rate
  numbers.

## Deploy

```bash
cd workers/enrich-name-to-linkedin
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put SERPER_API_KEY
npx wrangler deploy
```

## Test

```bash
node --test worker.test.mjs
```

23 tests, no network. The parsing and scoring functions are exported so the
cases that break the n8n version are pinned as regressions.

## Rolling traffic over

Do not switch the whole type at once. In the n8n `Switch` branch for
`lead_full_name_to_linkedin_url`, put an `If` in front that routes a percentage
of requests to this Worker's URL and the rest down the existing path. Compare
fill rates in `enrichment_history` for a few days — same query as the audit:

```sql
select count(*) filter (where (result::jsonb->>'result') <> '') * 100.0 / count(*)
from enrichment_history
where type = 'lead_full_name_to_linkedin_url'
  and timestamp >= now() - interval '3 days';
```

Expect the Worker's share to sit above 55.7%. If it does not, the matching
threshold (`MIN_SCORE`) is the first thing to look at — raising it trades recall
for precision, lowering it does the reverse.

## Known limits

- `MIN_SCORE = 2` means a given name alone never returns a profile. That is
  deliberate: a wrong LinkedIn URL is worse than an honest blank, because the
  customer emails the wrong person.
- Credit charging is read-then-write, guarded on the values read and retried up
  to three times. Under a heavy bulk run some requests may hit contention and
  return without charging. Better than double-charging; a Postgres function
  doing the decrement atomically would be better than both.
