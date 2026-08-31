# Listicle outreach on a cron

The n8n workflow "Listicle Outreach Finder" now runs in Supabase. You add
keywords to a table; once a minute a cron job asks the answer engines which
pages they cite for the next one, then emails the content people at the
companies that published those pages.

Everything is in `supabase/migrations/2026083012*..14*` and
`supabase/functions/process-ai-keyword/`.

## Adding keywords

    insert into ai_keywords (keyword) values
      ('best linkedin email finder'),
      ('how to find a ceo email address'),
      ('best b2b data enrichment tools');

That is the whole interface. Paste in hundreds. Duplicates are rejected by a
unique index on `lower(keyword)`, so re-pasting a list costs nothing.

**Adding a row starts real outreach.** The leads it finds go straight into the
live Instantly campaign "Listicles" and get emailed. There is no dry-run switch
— to look before you send, add one keyword and read `ai_keyword_citations` and
`ai_outreach_leads` before adding the rest.

## Watching it

    select * from ai_keyword_progress;

A keyword moves `pending` -> `discovering` -> `enriching` -> `processed`.
It sits in `enriching` for one minute per page it turned up, which is the
job doing its work, not a stall. `failed` means the keyword itself could not be
processed and `error` says why.

    -- what the answer engines actually cite, which is the ranking data itself
    select keyword, domain, cited_by, citation_count, google_position, status
      from ai_keyword_citations order by keyword, citation_count desc;

    -- who got mailed, and off which article
    select email, job_title, company, keyword, article_url, pushed, push_error
      from ai_outreach_leads order by created_at desc;

## What it spends

This is the part to understand before adding a big list. LinkFinder bills
`company_domain_to_employees` **per employee returned**, at half a credit each,
so `AI_KEYWORDS_EMPLOYEE_COUNT` is the real price of every page:

| Setting | Default | Cost per page worked |
| --- | --- | --- |
| `AI_KEYWORDS_EMPLOYEE_COUNT` | 15 | 7.5 credits per seniority |
| `AI_KEYWORDS_SENIORITIES` | `director,head` | x2, so ~15 credits |
| `AI_KEYWORDS_MAX_LEADS_PER_DOMAIN` | 3 | caps the 10-credit email lookups |
| `AI_KEYWORDS_MAX_CITATIONS` | 12 | pages worked per keyword |

So a keyword costs on the order of 12 x 15 = ~180 credits in the worst case,
and much less in practice because most domains are skipped as already worked.
The n8n flow asked for 100 employees per call, which was 50 credits a call
before it looked at a single job title.

The 10-credit `linkedin_profile_to_email` lookup is only paid when the employee
record does not already carry an address. It usually does — the live response
for `ahrefs.com` returns `ryan.law@ahrefs.com` inline, and the first real
keyword pushed four leads while buying none of them — so this is normally free.
The n8n flow bought every address regardless.

One real keyword, `best linkedin email finder tools`, is what these numbers come
from: 11 pages cited, 9 worked, 24 employees seen, 2 new leads. Most domains
returned nobody at director/head level in marketing, which is the normal shape —
budget the queue on pages, not on leads.

Two de-dupes keep the cost falling as the list grows:

- **A domain is worked once, ever** (`ai_outreach_domains`). The same twenty
  sites are cited for every keyword in a niche; without this, keyword two
  hundred pays again for people keyword one already found.
- **A person is mailed once, ever** (`ai_outreach_leads`, unique on the
  address).

## Configuring it

Keys live in Supabase Vault, under names only this feature reads — deliberately
not the `LINKFINDERAI_TOKEN` / `INSTANTLY_API_KEY` project secrets, which belong
to the older `process-keyword` flow and may be a different account.

    select vault.update_secret(id, 'sk-or-v1-...', name, description)
      from vault.secrets where name = 'openrouter_api_key';

Names: `openrouter_api_key`, `serper_api_key`, `linkfinder_api_key`,
`instantly_api_key`, `ai_keywords_campaign_id`, `ai_keywords_models`.
The caps in the table above are Edge Function environment variables instead,
set under Edge Functions -> Secrets.

`ai_keywords_models` defaults to
`perplexity/sonar-pro, openai/gpt-4o, google/gemini-3.6-flash` — the three from
the n8n workflow. They are asked in parallel through OpenRouter's `web` plugin
with `engine: exa`, and the keyword is sent **verbatim** as the prompt. That is
the measurement: the keyword is the question a buyer types, and dressing it up
would rank the dressed-up prompt instead.

## Things that will bite

**Out of OpenRouter credits stalls the queue rather than emptying it.** A 402,
a 429, a timeout or a 5xx puts the keyword back on `pending` with the reason in
`error`; only a real failure marks it `failed`. Without that, an empty balance
would write off several hundred keywords in an afternoon at one a minute. If
everything sits in `pending` with an `error`, read the error — it is usually a
balance.

**There is an older, unrelated `keywords` table.** It is driven by
`process-keyword`, which scrapes Google through Apify and pushes to a different
Instantly campaign, and its cron still runs every 15 seconds. Adding rows there
gets you the old behaviour. The table for this is `ai_keywords`.

**One keyword at a time is enforced in SQL**, in `ai_claim_work()`. To go
faster, add a second cron job with a `pg_sleep` offset the way
`process-partner-1..4` do — but the cadence is the spend rate, so read the
credit table first.

## What changed from the n8n workflow

Same shape, same filters, same campaign. The differences are all things the
live APIs turned out to require:

- **`company_domain_to_employees` can answer 202 with a `job_id`** instead of a
  result — the docs call it the endpoint most likely to. The workflow parsed
  that as an empty employee list and silently found nobody. This polls.
- **The live employee response has no `firstName` / `lastName`**, only `name`.
  The workflow read `firstName` and `lastName` straight into Instantly, so
  every lead arrived nameless. This splits `name`.
- **The email/domain check compared strings.** `result contains domain` drops
  everyone at `learn.g2.com` and admits `bobg2.com@gmail.com`. This compares the
  company-level domain of each side, so subdomains match and lookalikes do not.
- **Sales titles are excluded even when they match.** The filter is a substring
  match and `growth` is the leaky one: a live run on `zoominfo.com` matched a
  "Global Account Director, Enterprise Growth" and a "Director of Sales,
  Retention and Growth". `department=marketing` did not exclude them, so the
  title has to — that is where the two ZoomInfo sales contacts sitting in the
  campaign from 29 Aug came from.
- **Platform domains are dropped** — reddit, youtube, wikipedia, medium and so
  on are cited constantly and have no marketing team to pitch. Review sites
  (g2, capterra, trustradius) are deliberately kept: being listed on those is
  the point.
- **Pages are worked strongest-first**, by how many models cited them and then
  by Google position, so a keyword whose budget runs short spent it on the
  pages that actually rank.
- **The ranking data is kept.** The workflow computed which models cited which
  page, and where Google had it, then threw it away. It is now
  `ai_keyword_citations`.
