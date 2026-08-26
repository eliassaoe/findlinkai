# CLAUDE.md — read before doing anything

## ⛔ MAKING A YOUTUBE VIDEO? STOP AND READ THESE TWO FILES FIRST

    claude/youtube/METHOD.md      <- the production chain
    claude/guidee/STYLE.md        <- the content law

**Do not write a script, generate a voiceover, or render anything before you
have read both.** They have been ignored twice, and both times the result was
thrown away.

### The format, non-negotiable

A **real screen recording of LinkFinder AI**, narrated, walking ONE enrichment
slowly from start to a visible result. It is a tutorial. It is not an
explainer, not a talking-points video, not text animation over a script.

1. **Title** is `<Action> With LinkFinder AI`, and must score **>= 80** on
   `vidiq_score_title` (`type: long`, `channelId: UCAq5URh_O2gbg4bFFwBWfdg`).
2. **The first line of narration is fixed**:
   *"In this video we are going to see how to … using LinkFinder AI."*
   Not a hook. Not a cold open. That exact construction.
3. **Keyword is a tutorial search** — "find a CEO's email address", "scrape
   LinkedIn profiles". Never a problem statement or an opinion.
4. **Step 01 shows the payoff** — the found email, the exported CSV — before
   showing how.
5. **The demo is slow and complete.** 22–35 steps, 2–4 minutes, real demo data
   (Microsoft, Tesla, Salesforce), a real value visible in every result step.
6. Name the credit cost out loud once. Close by naming the next action.
7. Never "simply", "just", "easily".

### The one thing an agent cannot do

**Record the demo.** The sandbox blocks `linkfinderai.com`, so the app cannot
be loaded or captured. The recording is a human step in Guidde at 1727x1080 —
that is why storyboards exist.

**Never substitute motion graphics for the demo to work around this.** A video
without the product on screen is not this format. Deliver the storyboard,
voiceover and cards, and say the recording is outstanding.

---

## This session is ephemeral

Nothing survives except what is committed to this repo. No memory carries
between sessions. If you establish a process, a decision, or a rule — write it
into a file here in the same session, or it is gone.

## Project map

| What | Where |
| --- | --- |
| Video rules | `claude/youtube/METHOD.md`, `claude/guidee/STYLE.md` |
| Storyboards | `claude/guidee/scripts/`, catalog in `claude/guidee/catalog.json` |
| App UI ground truth (never invent a label) | `claude/guidee/app-ui.md` |
| CRM cleanup + HubSpot | `CRM-SETUP.md` |
| Outbound campaign | `OUTBOUND-CRM-AUDIT.md` |
| Workers | `workers/` — but most live workers are NOT in this repo; read them with the Cloudflare connector |

## Facts that are easy to get wrong

**Credit costs** (`app.html`, `creditCosts` — authoritative):

    linkedin_profile_to_phone       50     linkedin_profile_to_email       10
    linkedin_profile_to_linkedin_info 10   email_to_linkedin_url            5
    lead_full_name_to_email          7     lead_full_name_to_linkedin_url   1
    company_name_to_*                1

**Plans**: Starter $49 / 5,000 mo · Professional $89 / 20,000 · Enterprise $149
/ 50,000. `app.html` stores the ANNUAL figure and divides by 12 — that is not a
bug. **Packs**: $25 / 1,000 · $75 / 3,500 · $200 / 10,000.

**Who counts as a subscriber**: `subscription_id IS NOT NULL` on
`linkfinderai_users`. `is_unlimited` and `plan_type` do NOT mean subscribed —
credit-pack buyers have `is_unlimited = true` and no subscription.

**`email_verified` on `linkfinderai_users` is NOT trustworthy.** A migration
backfilled every existing row to `true`; 4,616 of those accounts have no
Supabase auth row at all. The only real signal is
`auth.users.confirmed_at IS NOT NULL`. And `@gmail.com` says nothing about
signup method — anyone can type a fake gmail into an email+password form.
See `docs/email-verified-is-wrong.md` before any bulk send.

**Never recommend PAYG to a CRM user.** CRM users go to subscriptions; they are
stickier and the HubSpot connection costs money every month.

## Marketing sends: who is eligible

**Two gates, both required, on every PostHog marketing campaign.** They are
independent — one predicts whether the mail arrives, the other whether the
reader can buy.

**1. Recency, not verification.** Send only to
`auth.users.confirmed_at IS NOT NULL AND last_sign_in_at > confirmed_at + 5 min`.
Do NOT gate on `email_verified` — the column is a backfill artifact, AND the
PostHog person property of that name is never set at all, so the
`email_verified is_not "false"` filter on workflows 1, 2, 3, 5, 6, 8 and 9
matches every person and filters nobody. On the 25 Aug AEO send, people who
had returned bounced at 0%; confirmed-but-never-returned at 7.1%; no auth row
at all at 9.1%. Full working: `docs/bounce-rate-is-about-recency.md`.

**2. Country.** Send only to these markets:

    US CA GB IE AU NZ DE FR NL BE LU CH AT
    SE NO DK FI IS IT ES PT SG JP KR IL AE HK TW

Everything else is excluded. This is an ICP/spend decision, not a
deliverability one — no recipient-geo signal exists in the bounce data, so do
not justify it on bounce. Justify it on conversion: PK (2,261 visitors), BD
(732), PH (683) and NG (373) have produced **zero** subscribers between them,
roughly 4,000 people consuming credits and sending reputation for nothing.

**IN is excluded by standing instruction, against the data.** India is the
largest traffic source (12,383) and the third-largest subscriber source — 4 of
the 23 locatable subscribers, ~13% of the paying base, converting at 0.032%
vs 0.059% in the US. Excluding it is a deliberate call by Eliasse, not a
finding. Re-check it before treating it as settled.

**Do NOT filter out freemail addresses.** A Gmail address says nothing about
whether someone buys — 5 of the 11 subscribers in the returner segment are on
freemail. Domain correlates with deal size, not with worth contacting.

**After every batch send, suppress the bounces before the next touch fires.**
PostHog does not do this for you: after 25 Aug all ten bounced addresses were
still scheduled for touches 2, 3 and 4. Use `opt-outs-add`.
