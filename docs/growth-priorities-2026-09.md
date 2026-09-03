# What to do next, measured 2026-09-03

**Sources:** PostHog 263837, Supabase `snxhsboboatjywgwdeds`, Instantly workspace,
all pulled 2026-09-03. Supersedes the state (not the reasoning) in
`docs/revenue-levers-2026-08.md`, `docs/channel-bet-youtube-vs-seo.md` and
`FUNNEL-REVIEW.md`, which are 8-9 days old.

## The one-line answer

**More YouTube is not the priority, and the repo's own decision record already
says so.** `docs/youtube-decision-record.md` wrote the rule before the outcome
was known, precisely so it could not be rationalised later:

> Signups still converting >15% but payers still 0 -> **The funnel failed, not
> the channel.** Fix activation->paid before spending another hour on video.

That is exactly the state measured today.

## The funnel, last 30 days

| Step | People | Rate |
| --- | --- | --- |
| Saw the free-tool offer (`first_result_offer_shown`) | 2,393 | — |
| Clicked it (`first_result_offer_clicked`) | 21 | **0.88%** |
| Signed up (`signup_success`) | 681 | — |
| Activated (`enrich_started`) | 560 | 82% |
| Uploaded a CSV (`csv_uploaded`) | 56 | 10% of activated |
| **Paid (`checkout_payment_success`)** | **6** | **0.88% of signups** |

Payers per month: **Jun 11 · Jul 7 · Aug 7**, while signups went 520 -> 643 ->
655. Acquisition grew ~26%; payers fell. Signup->paid is going the wrong way
(2.1% -> 1.1% -> 1.1%).

Business state: **7,229 accounts · 31 subscribers · 89 pack buyers.**
Subscribers have not moved since 2026-08-25.

## What changed since the August docs — three things, all real

**1. The checkout leak is closed.** `docs/checkout-leak.md` recorded 42 plan
selections producing 7 redirects. Week of 2026-08-23: **15 `plan_selected` ->
12 `checkout_worker_request_started` -> 12 `checkout_session_created` -> 12
`checkout_redirect_started`.** 80%, up from 17%. `checkout_click_swallowed` and
`checkout_stuck_watchdog` have never fired and are not in the project taxonomy.
The remaining drop is redirect -> payment (12 -> 3), which is the Dodo step and
a different question. **Stop treating checkout as the bottleneck.**

**2. The outbound machine was rebuilt, and then pointed at link-building.** The
38 mailboxes stuck on `status: -1` are gone. Nine fresh ones on three new
domains (`linkfinderai-outbound/-contact/-with.com`) were created 2026-08-29,
all `status: 1`, warmup 100, 15/day each.

But **all five revenue campaigns are gone too** — Done-for-you outbound, CRM
audit, Lead Gen Guarantee, SEO/AEO service, AI visibility. The workspace now
holds exactly **one** campaign, `Listicles`, which sells nothing: it asks
listicle authors for a mention.

Its numbers: **38 sent · 0 replies · 3 bounced (7.9%) · 0 opportunities.**
A 7.9% bounce rate on domains five days old is how you lose the domains. Fix the
verification before adding keywords, per `docs/ai-keyword-outreach.md`.

**3. YouTube referral traffic is flat, not compounding.** People per week from
`www.youtube.com`: **19 · 24 · 32 · 20 · 25** across six weeks of continuous
publishing — roughly **100/month**. The decision record's own kill line is
"below ~150/month after six months". Google recovered and stabilised
(854-1,416/week), so the -40% emergency that justified diversifying has passed.

YouTube still converts best on first touch (25.6%) and is worth keeping. It is
not worth being the priority, and the per-video UTM work that would let the
November review say anything at all is still not done.

## Correction — `docs/dfy-activation-campaign.md` is wrong on subscribers

That doc says:

> There is no dormant-subscriber problem. 30 of 31 subscribers use the tool.

It conflates **ever ran** with **currently active**. Measured today, joining on
`token`:

| | Count |
| --- | --- |
| Subscribers | 31 |
| Never ran anything | 1 |
| **Active in last 30 days** | **8** |

Both facts are true: 30 of 31 have run something *at some point*, and 23 of 31
have run nothing *in the last 30 days*. `CHURN-PLAYBOOK.md` was right and the
"correction" that overrode it was not. CLAUDE.md points readers at that doc, so
this matters. **~$1,437 of the ~$1,939 MRR sits in accounts dormant 30d+.**

## Ranked — what to do now

### 1. The 67 pack buyers who paid and got nothing

| | |
| --- | --- |
| Pack buyers who never ran a single lookup | **67** |
| Idle credits held | **922,873** |
| Bought the $200 / 10,000 pack | **45** |
| Bought the $75 / 3,500 pack | 18 |
| Pack buyers active in last 30 days | **3 of 89** |

Roughly **$10,450 already collected** from people who received nothing for it.
The email is written (English and French) in `docs/dfy-activation-campaign.md`
and there is no evidence it has been sent. Send it from the personal inbox, 18
confirmed addresses first — **not** through Instantly, for the reasons that doc
gives. Zero new traffic required, and the warmest list on the property.

### 2. The 23 dormant subscribers

8 of 31 active. Churn ~6.5%/mo. The three PostHog cohorts and the three
archetype plays already exist in `CHURN-PLAYBOOK.md`; nothing has been run
against them. Protecting existing MRR beats winning it twice.

### 3. Ungate the bulk nudge — a one-line change

Bulk predicts payment (8.3% vs ~1% baseline, per `FUNNEL-REVIEW.md`). Last 30
days: **560 people enriched, 78 saw `bulk_nudge_shown`, 56 uploaded a CSV.**

`app.html:6265` still reads `if (localStorage.getItem('lf_bulk_nudge_shown')) return;`
— it fires once per browser, forever. This was `FUNNEL-REVIEW.md`'s lever #2 on
2026-08-25 and has not been touched since.

### 4. Rewrite the free-tool offer — the biggest surface on the property

**2,393 people saw it in 30 days. 21 clicked.** Bigger than the signup count,
bigger than anything in the app. Where they see it:

| Page | People |
| --- | --- |
| `/linkedin-phone-number-finder` | 1,305 |
| `/linkedin-email-finder` | 477 |
| `/linkedin-search-by-email` | 245 |

The copy (`js/lf-gate.js`, `buildOffer`) reads **"Want 50 more lookups?"** —
and it is injected *after* `resultsSection`, below the answer, where a visitor
who got what they came for never scrolls. Someone who just got one phone number
does not want "50 lookups"; they want the next phone number. Match the offer to
the page's own verb, and put it where the result is.

## What I would not do right now

- **More videos at higher volume.** Retention is the gate, not count
  (`METHOD.md`), and the funnel caps every channel at 0.88%.
- **More pSEO pages.** 215 near-duplicate pages already carry the concentration
  risk `channel-bet-youtube-vs-seo.md` names.
- **Adding listicle keywords** until the 7.9% bounce rate is fixed. It spends
  credits and risks three five-day-old domains.
- **A lead magnet.** Already argued down in `docs/traffic-capture-verdict.md`;
  nothing measured today changes it.

## How to refresh this

```sql
-- subscriber dormancy (join on token, NOT email)
with h as (select user_id, max(timestamp) last_run from enrichment_history group by user_id)
select count(*) filter (where u.subscription_id is not null) subs,
       count(*) filter (where u.subscription_id is not null
                          and h.last_run > now() - interval '30 days') active_30d
from linkfinderai_users u left join h on h.user_id = u.token;
```

PostHog: `first_result_offer_shown` vs `first_result_offer_clicked`,
`signup_success` -> `enrich_started` -> `csv_uploaded` -> `checkout_payment_success`,
30-day window.
