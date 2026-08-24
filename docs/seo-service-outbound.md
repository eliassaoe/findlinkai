# Cold emails for the SEO/AEO service

Written 24 Aug. Every number in these is real and checked against PostHog — see
the bottom of this file for the source queries. Do not round them up.

## How these get sent

**By hand, from your own inbox, 20 a day.** Not Instantly. All 38 sending
accounts have been dead since March (`EAUTH`, revoked Google tokens) and
re-warming them is 2–4 weeks. You do not need volume for a $1,500 offer — you
need ten conversations.

Rules that matter for a real inbox:
- **No link in email 1.** Links suppress deliverability and make a personal
  email read like a campaign. Email 3 can carry one.
- **No tracking pixel, no open tracking.** You are one person writing to
  another person.
- **Under 120 words.** These are read on a phone.
- Plain text. No signature block, no logo, no "Best regards".

## The two minutes of research before each send

Do not skip this — it is the entire reason these work.

1. Ask ChatGPT (or Perplexity): *"best <their category> tool"*. Write down who
   it names. Check whether the prospect is in the list.
2. Search Google for 2–3 tool-shaped queries their buyer would type —
   `"<category> api"`, `"<competitor> alternative"`, `"how to <job>"`. Note who
   ranks and whether they have a page for it at all.

That gives you the one specific, true, checkable sentence the email opens with.

---

## Sequence A — the AI visibility opener  ← lead with this

The strongest opener available in 2026, because it is concrete, they have
almost certainly never been told it, and it sets up both halves of the offer.

### A1 — day 0

> **Subject:** you're not in ChatGPT's answer
>
> Hi {{first}},
>
> I asked ChatGPT and Perplexity for the best {{category}} tool this morning.
> {{competitor_1}} and {{competitor_2}} came up. {{company}} didn't.
>
> That is usually not a product problem. LLMs cite pages that answer the exact
> question, and most SaaS sites only have a homepage and a blog — nothing
> targeting the specific things buyers type.
>
> I fixed this on my own SaaS. 205 pages aimed at exactly those queries: 371
> organic visits a month to 11,474 in five months, and referrals now coming
> from ChatGPT, Gemini, Perplexity, Claude and Copilot.
>
> Want me to send you the list of queries {{company}} is invisible for?
>
> — Eliasse

**The ask is a list, not a call.** A meeting request from a stranger is a big
yes. A list costs them nothing, and the moment they say "sure" you are in a
conversation with a warm prospect who has told you their problem matters.

### A2 — day 3, same thread, reply to your own email

> Following up with one number in case it is useful either way.
>
> The pages that work are not blog posts. They are one page per query, built
> from a template — mine average 56 organic visits a month each, and they are
> the ones the AI assistants quote.
>
> Still happy to send over the {{company}} list.

### A3 — day 8, last one

> Last one from me.
>
> What I actually do: 150 of those pages for a SaaS, live and indexed in six
> weeks. $1,500, and if they are not live in six weeks you get all of it back.
>
> If it is not a fit, no problem at all — reply "not now" and I will leave you
> alone.

---

## Sequence B — the competitor gap opener

Use where the prospect already ranks for their brand and clearly cares about
SEO. More familiar to them, so slightly lower reply rate, but the ones who do
reply are further along.

### B1 — day 0

> **Subject:** {{competitor}} ranks for "{{query}}", you don't
>
> Hi {{first}},
>
> {{competitor}} is on page one for "{{query}}". {{company}} has no page for it
> at all — same for "{{query_2}}".
>
> These are not big content pieces. They are one page per query, generated from
> a template. I built 205 of them for my own SaaS and went from 371 organic
> visits a month to 11,474 in five months. They average 56 visits a month each.
>
> Want the list of the ones {{company}} is missing?
>
> — Eliasse

### B2 — day 3

> One thing I should have said: the reason this works now and did not two years
> ago is that the same pages get cited by ChatGPT and Perplexity. You are
> building for both at once.
>
> Still glad to send the list.

### B3 — day 8

Same as A3.

---

## When they reply "sure, send the list"

Send the list. Ten to twenty queries, who currently ranks, and whether an AI
assistant names them. **No pitch in that email.** Then:

> That is the gap. If you want, I will build the pages — 150 of them, live and
> indexed in six weeks, $1,500, full refund if they are not live. After that
> it is $1,500/month for new clusters and outreach, cancel whenever.

The list is the sale. By the time they have read it they have already decided.

---

## What you may claim, and what you may not

**True and checkable:**
- 371 → 11,474 organic visits/month, Feb→Jul 2026
- 205 pages, averaging ~56 organic visits/month each
- The traffic is non-branded — the homepage is only the 6th largest organic
  entry point, behind /instagram-profile-url-finder, /linkedin-email-finder,
  /linkedin-search-by-email, /sign-up and /linkedin-url-finder
- Referral traffic from ChatGPT, Gemini, Perplexity, Claude and Copilot,
  continuously since February

**Do NOT claim:**
- Any AEO *lift*. AI referrals peaked in March (209 views) and have drifted to
  ~78/month. The citations are a byproduct of the pages existing, not something
  you have optimised on purpose yet. Say "my pages get cited", never "I grew
  citations by X%". After client one, measure AI referrals before and after —
  then the claim is yours.
- That LinkFinder finds backlink placements. It does not. It finds the
  **person** to pitch at a site you have already chosen. That is the true
  version and it is the better one: everyone can list target sites, almost
  nobody can reach a human at them.
- Revenue from the traffic. 11k visits sits alongside ~$1.8k MRR. If asked,
  say so plainly — you are selling traffic, and being straight about the gap
  is more convincing than dodging.

## Before the first send

August organic is ~27% below July, and AI referrals are down too. Task #1
("gate free tool pages after first lookup") shipped in the same window and
gated the exact pages that earn the traffic. Find out whether that is the
cause. Not because a prospect will catch it — because "here is my traffic, and
here is me catching a dip and fixing it" is a better story than a clean line.

## Source queries

```sql
-- monthly organic
SELECT toStartOfMonth(timestamp) AS m, count() AS pageviews,
       countIf(JSONExtractString(properties,'$referring_domain') LIKE '%google%'
            OR JSONExtractString(properties,'$referring_domain') LIKE '%bing%'
            OR JSONExtractString(properties,'$referring_domain') LIKE '%duckduckgo%') AS from_search
FROM events WHERE event='$pageview' AND timestamp > now() - INTERVAL 180 DAY
GROUP BY m ORDER BY m;

-- AI assistant referrals
SELECT JSONExtractString(properties,'$referring_domain') AS ref,
       count() AS views, uniq(person_id) AS people
FROM events WHERE event='$pageview' AND timestamp > now() - INTERVAL 180 DAY
  AND (ref ILIKE '%chatgpt%' OR ref ILIKE '%perplexity%' OR ref ILIKE '%claude%'
    OR ref ILIKE '%gemini%' OR ref ILIKE '%copilot%')
GROUP BY ref ORDER BY views DESC;
```
