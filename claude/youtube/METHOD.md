# Daily YouTube video — the rules

**Read this AND `claude/guidee/STYLE.md` before making anything.**
STYLE.md is the content law. This file is the production chain around it.

> Corrected 23 Aug. An earlier version of this file described a
> motion-graphics-only pipeline. That was wrong and produced a video with no
> product in it, the wrong intro, and an explainer keyword instead of a tutorial
> keyword. The rules below are reconstructed from `claude/guidee/`, the Descript
> project, and the vidIQ job history — not from memory.

## The format, in one line

A **real screen recording of LinkFinder AI**, narrated, opening with a fixed
cover line, walking one enrichment slowly from start to finished result.

It is a tutorial. It is not an explainer, not a talking-points video, not
kinetic typography over a script.

## Non-negotiable rules (from STYLE.md)

1. **Cover card**: title is `<Action> With LinkFinder AI`. First line of
   narration is *"In this video we are going to see how to … using LinkFinder
   AI."* Exactly that construction. Not a hook, not a cold open.
2. **Step 01 is the payoff** — show the finished result (the found email, the
   exported CSV) before showing how.
3. **Slow, complete demo.** One tool, one flow, start to finish, until the
   viewer sees a real result on screen. 22–35 steps, 2–4 minutes. Above 40,
   split into two videos.
4. **Real demo data** — Microsoft, Tesla, Salesforce. Never `John Doe`.
5. **Every result step shows a real value.** An empty result panel makes the
   product look broken.
6. **Narration opens with the verb the viewer performs** — `Click…`, `Fill in…`,
   `Select…` — and every third step says what they *get*, not what they see.
7. **Name the credit cost out loud once**, on the first enrichment step.
8. **A closing step that names the next action.**
9. Second person, present tense. No hedging. Never "simply", "just", "easily".
   American spelling.

## Keyword and title

The keyword is a **tutorial/demo search**, matching how the catalog is written:
*"Find a CEO's Email Address"*, *"Find a Company's Employee Count"*,
*"Scrape LinkedIn Profiles"*. Not an opinion or a problem statement.

- `vidiq_keyword_research` — mode `research`, `country: "US"`.
- `vidiq_score_title` — `type: "long"`, `channelId: UCAq5URh_O2gbg4bFFwBWfdg`.
  **Must score >= 80.** Iterate until it does.
- Title still has to end `With LinkFinder AI` per rule 1.

## The production chain

```
catalog.json row (status: missing)
      |
      v
storyboard  (claude/guidee/scripts/<slug>.md)      <- derive.py or template.md
      |
      v
GUIDDE RECORDING at 1727x1080  ->  guidde_real_footage.mp4     <- HUMAN STEP
      |
      +--- vidiq_voiceover_generate  ->  narration mp3
      +--- vidiq_motion_graphics     ->  cover / title / outro cards only
      |
      v
Descript: assemble footage + voiceover + cards  ->  publish
      |
      v
YouTube + embed snippet into the storyboard's target page
```

Evidence this is the real chain — Descript project
`LinkFinder AI - Tutorial Video` (20 Aug):

```
guidde_real_footage.mp4       video  58s
voiceover_intro_company.mp3   audio  22.8s
-> composition "Section 1-2 Real Footage"
-> https://share.descript.com/view/NpZaXxlBVSq
```

Motion graphics are **cards around the demo**, never the body of the video.

## Fixed values

| | |
| --- | --- |
| Channel | Elias IA — `UCAq5URh_O2gbg4bFFwBWfdg` |
| Recording size | 1727x1080 (what Guidde captures at) |
| Voice | `iP95p4xoKVk53GoZ742B` (Chris — Charming, Down-to-Earth). No cloned voice on the account. |
| Palette | accent `#2563eb` · bg `#111827` (from `#0b1220`) · text `#f8fafc` · muted `#94a3b8` · font Inter |
| Output | 1920x1080 landscape |

## What an agent can and cannot do

**Can**: pick the catalog row, research the keyword, write and score the title,
write the storyboard against `app-ui.md`, generate the voiceover, render the
cover/title/outro cards, assemble in Descript, write the description and tags.

**Cannot**: record the demo. The sandbox network blocks `linkfinderai.com`
entirely, so the app cannot be loaded, let alone captured. The Guidde recording
is a human step — which is the whole reason the storyboard exists, so that
recording is mechanical rather than improvised.

**Never** substitute motion graphics for the demo to work around that. A video
without the product in it is not this format.

## Log

| date | slug | title | score | status |
| --- | --- | --- | --- | --- |
| 2026-08-23 | crm-audit | I Scanned My CRM and Found 1,847 Missing Emails (Free Tool) | 87 | **rejected — no demo, wrong intro, explainer keyword** |
| 2026-08-23 | bulk-csv-enrichment | Enrich A Whole CSV Of Leads At Once With LinkFinder AI | — | storyboard ready, awaiting recording |
