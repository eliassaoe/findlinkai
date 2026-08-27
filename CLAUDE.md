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
| CSV enrichments in History | `docs/csv-enrichment-history.md` |
| CRM cleanup + HubSpot | `CRM-SETUP.md` |
| Outbound campaign | `OUTBOUND-CRM-AUDIT.md` |
| Workers | `workers/` — but most live workers are NOT in this repo; read them with the Cloudflare connector |
| Integrations (all generated from one catalog) | `integrations/` — `integrations/catalog/` is the source; `npm run build && npm test` in `integrations/` |
| **The published Google Sheets add-on** | `integrations/google-sheets-addon/` — read its README before touching it |

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

**Three different things are called "the Google Sheets integration".** Do not
confuse them:

| Thing | Where it lives | Who uses it |
| --- | --- | --- |
| The Marketplace add-on | `integrations/google-sheets-addon/` — master copy; live copy is an Apps Script project in Drive | Everyone who installed it from the store |
| The copy-paste script | `linkedIn-enrichment-google-sheets.html` | Anyone who follows that page and pastes `=LINKFINDER()` in |
| An unpublished second add-on | `integrations/google-sheets/` | Nobody — it has never been deployed |

The add-on's manifest has **no `oauthScopes` block**, so Apps Script infers scopes
from the code. Adding any new Apps Script service (`DriveApp`, `GmailApp`,
`ScriptApp`…) widens them and pulls the add-on from the store until Google
re-verifies it. A test enforces this.

**Never recommend PAYG to a CRM user.** CRM users go to subscriptions; they are
stickier and the HubSpot connection costs money every month.
