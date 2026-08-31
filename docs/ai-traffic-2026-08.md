# AI traffic — what's actually arriving

**Date:** 2026-08-31 · **Source:** PostHog 263837

## Two different things both get called "AI traffic"

They behave nothing alike, and mixing them produces a wrong conclusion.

| | People since 2026-06-01 | Signups | Activated | Paid |
| --- | --- | --- | --- | --- |
| **Humans clicking through from an AI answer** | 114 | **22 (19.3%)** | 10 | **1** |
| **AI agents fetching pages** (bots) | 415 | **0** | **0** | **0** |

The agents are LLMs reading the site, not visitors. They will never convert and
should never be counted as traffic. The humans are among the best-converting
people on the property.

## The humans: high quality, low volume, and ChatGPT is collapsing

Unique visitors per month by AI source:

| Month | ChatGPT | Perplexity | Gemini | Claude | Copilot |
| --- | --- | --- | --- | --- | --- |
| Jan | **66** | 1 | 0 | 1 | 1 |
| Feb | **69** | 11 | 1 | 0 | 1 |
| Mar | 44 | 13 | 2 | 1 | 2 |
| Apr | 35 | 8 | 6 | 4 | 3 |
| May | 28 | 13 | 6 | 3 | 0 |
| Jun | 13 | 6 | 11 | 4 | 1 |
| Jul | 13 | 10 | **20** | 4 | 0 |
| Aug | 18 | 1 | 8 | 5 | 0 |

**ChatGPT referrals are down ~75% from February** (69 → 18). Gemini peaked at 20
in July and halved. Total AI referral traffic is roughly **30 people/month**.

At 19.3% signup conversion this is the second-best channel measured, behind
YouTube's 25.6% and well ahead of Google's 7.3% — on about a fifth of YouTube's
volume. One payment in three months.

*Caveat: this rate is any-touch since June; the channel table in
`docs/channel-bet-youtube-vs-seo.md` is first-touch for August. Directionally
comparable, not identical methodology.*

## The agents: one three-day scrape, not a trend

Daily AI agent fetches:

| Date | Fetches |
| --- | --- |
| Jul 20 – Aug 11 | ~1/day |
| **Aug 12** | **41** |
| **Aug 13** | **126** |
| **Aug 14** | **178** |
| Aug 16 – 31 | ~5/day (one 22 on Aug 30) |

**345 of August's 448 fetches landed in three days.** That is a scrape, not
growing AI interest. The underlying baseline did rise — roughly 1/day to 5/day —
but that is ~150 fetches a month by machines that never convert.

## What AI systems actually read

AI agent fetches since 2026-07-01:

| Page | Fetches | Share |
| --- | --- | --- |
| `/linkedin-search-by-email` | 313 | 70% |
| `/company-employee-finder` | 98 | 22% |
| `/linkedin-url-finder` | 11 | 2% |
| `/find-company-employee-count` | 10 | 2% |
| everything else (14 pages) | ~27 | 4% |

**Two pages take 92% of it.** Of the ~215 pSEO pages in the sitemap — the
"best X" roundups and "X alternative" comparisons — only a handful were fetched
even once, in single digits.

Two specific do-one-job tool pages absorb nearly all machine attention.

**Corrected 2026-08-31.** An earlier version of this line said the listicles were
rewarded by "neither Google nor AI systems". The Google half was wrong — see
`docs/listicle-aeo-results.md`. Google did reward them, to a peak of 715
search visitors in May. What holds is only the AI half: AI systems do not read
them.

## What follows

1. **Never report the two together.** An "AI traffic up 30x" headline would be
   entirely a three-day scrape of one page.
2. **The ChatGPT decline is the real signal**, and it moves with the Google
   decline. Both are the same story: less referred click-through from answer
   engines.
3. **`/linkedin-search-by-email` and `/company-employee-finder` are the assets
   AI systems already choose.** If AEO is going to be worked at all, those two
   pages are the proven surface — not another roundup.
4. **The AEO campaigns are still drafts.** "AEO/SEO — AI visibility check" and
   "SEO/AEO service — B2B SaaS" sit at status 0 in Instantly, on 38 mailboxes
   that cannot send (see `docs/revenue-levers-2026-08.md`).

## Caveats

- `$virt_traffic_category` is a PostHog virtual property computed at query time,
  so its history could not be verified against stored data. The three-day shape
  argues against a classification change, but this is inference.
- Referrer-based AI detection undercounts: assistants often strip the referrer,
  so the human numbers are a floor, not a census.
