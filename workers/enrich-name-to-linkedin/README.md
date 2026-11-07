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

## Added 7 Nov 2026 (docs/find-rate.md)

- **A company is required.** Two tokens with no company or domain ("Jane
  Smith") get a `422 {error: "company_required"}` and are **not charged**.
  On the logged history, name-only "hits" carried the searched surname in
  the URL 38% of the time, so most were a different person. Three-part names
  are recognised ("John F Kennedy", "Ana de Souza"), so they aren't mistaken
  for name + company. Structured `first_name` / `last_name` / `company`
  (or `company_name`) in the body are used when present.
- **Up to three Google passes on a miss**, stopping at the first confident
  match (`buildQueries`):
  1. the n8n query, unchanged;
  2. `"first last" "company" linkedin` (exact phrases, no `site:` filter);
  3. `first last <first company word> site:linkedin.com/in`.
  Legal suffixes and country codes are dropped from the company in passes 2
  and 3. A miss now costs up to three Serper calls instead of one; the
  customer's charge is unchanged (1 on a hit, 0.5 on a miss).

- **LinkedIn's own people search as the last step** (Apify actor
  `harvestapi/linkedin-profile-search-by-name`, "Short" mode, about $0.004 a
  call, about 4 s). It's only called after every Google pass missed, and only
  when the `APIFY_TOKEN` secret is set. A row is accepted only if its headline
  names the company we were given (generic words like "group" or "family"
  don't count). Tested 7 Nov on 6 people every Google query missed: 2
  confirmed (Turning Point Brands, ANA Inc), 2 probable at a new employer
  (rejected on purpose), 2 not found. Google found 0 of 6.

Why not Filtrat: Filtrat (checked 7 Nov) has no
name → LinkedIn endpoint, only name + domain → email. A database would be a
second vendor; the slot for it is right after the loop in `fetch()`.

**API behaviour change to announce when this goes live:** a name with no
company used to return an empty result and charge 0.5; it now returns 422 and
charges nothing. Update `api-documentation.html` in the same release.

## Called from n8n (the rollout mode)

When the request carries `X-Worker-Key` equal to the `N8N_SHARED_SECRET`
secret, the worker **only searches**. It doesn't read or charge credits and
doesn't need a user token, because n8n keeps its own charging (`Code97` /
`Code24`) and history logging. The response is `{result, status, source}`,
where `source` is `google`, `linkedin_search` or `none`. A missing or wrong
secret falls back to the normal paid path, so the no-charge mode can't be used
to borrow our Serper and Apify keys. `422 company_required` is returned on both
paths.

Step-by-step dashboard setup (Cloudflare + n8n, written as a prompt for Claude
in Chrome): `N8N-SETUP-PROMPT.md`.

## Deploy

```bash
cd workers/enrich-name-to-linkedin
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put SERPER_API_KEY
npx wrangler secret put APIFY_TOKEN      # optional: enables the LinkedIn-search fallback
npx wrangler secret put N8N_SHARED_SECRET # n8n mode: search only, n8n charges
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
