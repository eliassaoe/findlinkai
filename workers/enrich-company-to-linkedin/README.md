# enrich-company-to-linkedin

`company_name_to_linkedin_url` (company name → LinkedIn company page), as a
worker n8n calls. **Search only**: n8n keeps its credit charging and history
logging. Every request must carry `X-Worker-Key = N8N_SHARED_SECRET`, or it
gets a 403.

## Why (docs/find-rate.md, 7 Nov 2026)

- 77% found over 150 days (4,700 runs, 37 accounts). The n8n branch takes
  Google's first result unchecked. In a sample of results whose URL doesn't
  resemble the name, about half are another company: *Krause Rail Systems* →
  SRS Rail, *Nihon Yamamura Glass* → San Miguel Yamamura Australasia,
  *Federal Agricultural Mortgage* → American Farm Mortgage.
- Domains typed as the company ("crazydonkeyglass.com") found **2.9%**. The
  tiny shops among them mostly have no LinkedIn page at all, so expect this
  to rise for real companies only.
- LinkedIn's own company search (Apify `harvestapi/linkedin-company`,
  ~$0.003) on 10 of the hardest names returned 3 pages, all exactly right,
  including two Google never found (Shandong Huasheng Zhongtian, D.R.
  Ferroviaria Italia). For the other 7 it returned nothing rather than a
  guess.

## How it decides

1. Google, top 10 (not only the first). It keeps the first `/company/` page
   whose name contains every significant word of the input. Legal forms
   (Inc, GmbH, Srl…), country codes and "holding" don't count. Squashed forms
   match ("3A Composites" ↔ `3ac-composites` via the title).
2. **Legal forms from two countries mean two companies.** "Metatronix Srl"
   (Italy) is not "Meta-Tronix Pvt Ltd" (India).
3. A domain input is searched as `"stripe.com" site:linkedin.com/company`,
   then by its stem.
4. On a miss, LinkedIn company search, accepted only when the name matches,
   or the page's website equals the domain that was typed.

Known trade-off: a right page under an unrelated name (Federal Agricultural
Mortgage → "Farmer Mac") is now a blank instead of a lucky hit. Precision over
recall, because the user acts on the page we return.

Response: `{result, status: "success", source: "google" | "linkedin_search" | "none"}`;
502 when Serper is down (n8n falls back to its old path).

## Test

```bash
node --test worker.test.mjs   # 11 tests, no network, cases from real history rows
```

Setup in the dashboards (Cloudflare + n8n, as a prompt for Claude in Chrome):
`N8N-SETUP-PROMPT.md`.
