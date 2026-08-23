# Daily YouTube video — the method

**Read this before making a video. It is the whole process.**

This file exists because the method was lost. Sessions run in ephemeral
containers: nothing survives except what is committed to this repo. On 23 Aug a
session had to reverse-engineer the pipeline from vidIQ job history because
nobody had written it down. Keep this file current — if the process changes,
change this file in the same session.

## Channel

**Elias IA** — `UCAq5URh_O2gbg4bFFwBWfdg` — 4.8k subs, long-form horizontal,
2–5 min, lead-gen / LinkedIn / n8n. (Also owned: Linkfinder AI
`UCLDVCTNGcJkzVeFzcoZYDYA`, 9 videos; Aidemy `UC7v9m2UV-W2oPh_UNHl4_tQ`, empty.
Daily videos go on **Elias IA**.)

## What the data says to make

Measured 23 Aug from `vidiq_channel_videos`:

| kind | example | views | breakout |
| --- | --- | --- | --- |
| n8n build | Build a Lead Gen Machine with n8n | 66 | **3.57** |
| Claude / MCP | Claude Code MCP: Scrape LinkedIn Without Coding | 31 | **3.49** |
| n8n agent | Ultimate LinkedIn Scraper AI Agent with n8n | 46 | 2.65 |
| "X Alternative" ×16 (21–22 Aug) | Wiza / Snov / UpLead / Seamless … | 2–6 | ~1.0 |

Builds and Claude/n8n demos beat competitor-alternative videos by ~10x.
Sixteen alternative videos in two days all flatlined. **Default to a build or a
demo. Do not batch more alternative videos.**

## The pipeline

Four vidIQ tools, in this order. Everything is async: each returns an
`mcpJobId`, poll `vidiq_job_poll` until `completed`.

```
keyword research  ->  title (score >= 80)  ->  script
                                                 |
                        +------------------------+
                        |                        |
              vidiq_voiceover_generate   vidiq_motion_graphics  (x6-8)
                        |                        |
                        +---------> vidiq_compose <-----------+
                                          |
                                     MP4, 1920x1080
```

### 1. Keyword

`vidiq_keyword_research` — mode `research`, seed the topic, `country: "US"`.
Read volume vs competition; pick the phrase that goes in the title.

### 2. Title — must score 80 or better

`vidiq_score_title` with `type: "long"` and `channelId`. Returns 0–100.

> 23 Aug: "I Scanned My CRM and Found 1,847 Missing Emails (Free Tool)" → **87**

Iterate until >= 80. What scores well on this channel: first-person result
("I Scanned…"), a specific odd number, a parenthetical payoff ("(Free Tool)").
Under 60 chars. Use `vidiq_generate_titles` for variants if stuck.

### 3. Script

Conversational, second person, ~1,700–1,900 characters ≈ 110–120 seconds.
Structure that works:

1. **Hook (0–15s)** — the problem as a loss they already own. Not a greeting,
   not the tool name. *"Everybody talks about getting more leads. Nobody talks
   about the leads you already paid for that you can't contact."*
2. **Why nobody fixes it (15–45s)** — name the reason the problem persists.
3. **The demo (45s–2m)** — the URL out loud, then what it does, then the
   objection killed on camera (for the audit, that is "nothing uploads").
4. **The turn** — one thing they should do even if they never use the product.
5. **Close** — link in description, plus a comment prompt that asks for a
   number. Tease the next video.

Spell URLs phonetically for the voiceover: `linkfinder A I dot com slash C R M
audit`. Never write "simply", "just", or "easily".

### 4. Voiceover

`vidiq_voiceover_generate`. **Voice: `iP95p4xoKVk53GoZ742B`** (Chris —
Charming, Down-to-Earth). No custom/cloned voice exists on the account; if one
is added later, prefer it and update this line.
Cost 14 credits / 1,000 chars. **Poll it first — the returned
`durationSeconds` is what every scene length is sized against.**

### 5. Motion graphics

`vidiq_motion_graphics`, `outputPreset: "youtube-16-9"`, one call per scene,
6–8 scenes, 13–21s each. They render in parallel.

Brand, taken from `crm-sync.html`:

```
accent  #2563eb      bg      #111827 (gradient from #0b1220)
text    #f8fafc      muted   #94a3b8
warn    #f59e0b      danger  #ef4444     good  #22c55e
font    Inter
```

Scene grammar that reads well: small uppercase `pill` label → medium `text`
setup → huge `text` payoff (`sizeRel` 0.13–0.15, weight 800) → `divider` →
supporting line. Stat scenes use `number` nodes with `countUp` and a gradient.
Stagger entries 0.2–0.3s. Always `fitToFrame: true`.

**Label invented numbers as examples.** The stat scene on 23 Aug is headed
`EXAMPLE AUDIT — 2,000 CONTACTS` because those figures are illustrative. Never
present a made-up number as a measured one.

### 6. Compose

`vidiq_compose`, `format: "landscape"`, voiceover attached.

**Scene durations must sum to the voiceover length, not the clip lengths.**
Clips render longer than needed on purpose; trim each in the compose call.
23 Aug: 135s of clips, 112.3s of voiceover → scaled ×0.833 to 112.5s total.
Overshoot leaves silence on the end; undershoot cuts the narration off.

`transitionIn: {kind: "fade", duration: 0.4}` on every scene after the first.

Signed URLs expire in 12h — poll, compose, and download in one sitting.

## Output

Download the MP4 with `curl` (S3 is reachable from the sandbox; the
linkfinderai.com domain is **not**) and send it with `SendUserFile`.

Then write title, description with timestamps, tags and thumbnail direction
alongside it in `content/youtube/<date>-<slug>.md`.

## What this cannot do

No screen recording of the live product — the sandbox network blocks
`linkfinderai.com`, so the app cannot be loaded, let alone captured. Motion
graphics plus narration is the format that works here. A real product
walkthrough is the Guidde pipeline in `claude/guidee/`, which is a human
recording a click script, and is a different thing.

## Log

| date | slug | title | title score |
| --- | --- | --- | --- |
| 2026-08-23 | crm-audit | I Scanned My CRM and Found 1,847 Missing Emails (Free Tool) | 87 |
