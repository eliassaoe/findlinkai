# YouTube Shorts — the rules

**Read `METHOD.md` and `claude/guidee/STYLE.md` first.** This file only covers
what's different for a Short. Everything in STYLE.md's wording rules and
METHOD.md's "what an agent can and cannot do" applies here unchanged —
including the hard limit: **the agent cannot record.** A Short needs the same
real screen recording a long-form video needs. Nothing about being vertical or
short changes that.

## Why this file exists

Every long-form storyboard in `claude/guidee/scripts/` is recorded once in
Guidde at 1727x1080. That one recording is the source for **both** videos:
the full long-form tutorial, and a Short cut from the same footage. This is
not a separate recording session — it's a second export from the same
timeline in Descript, reframed vertical and trimmed to the one moment that
carries on its own.

A Short is never built from motion graphics standing in for the demo, same as
the long-form rule. If a page has no long-form recording yet, it has no Short
yet either — record the long-form video first, then cut the Short from it.

## The format, in one line

**One beat from an already-recorded long-form video** — the input, the click,
the result — reframed vertical, trimmed to 20-45 seconds, with its own short
punchy narration. Not a summary of the whole video. Not a new demo.

## Non-negotiable rules

1. **Source footage only from a long-form video that is recorded, or fully
   storyboarded and about to be.** Pick a `catalog.json` row whose long-form
   video is either already recorded (`status: "live"`, or footage sitting in
   Descript before the YouTube upload) or has a complete storyboard in
   `claude/guidee/scripts/<slug>.md` — a cut sheet keyed to that storyboard's
   step numbers means the Short beat is already decided the moment the
   recording happens, no second planning pass needed. Never storyboard a
   Short for a page with neither — that's a new demo, not a cut, and an
   agent cannot invent what unrecorded, unstoryboarded footage will show.
2. **One beat, not a walkthrough.** Pick the single highest-value moment:
   almost always the input → Enrich Data click → result reveal. Skip account
   creation, dropdown navigation, bulk mode, everything else — that's what
   the full video is for. A Short that tries to compress 24 steps into 30
   seconds is unwatchable and defeats the point of cutting one instead of
   recording a new one.
3. **Vertical reframe, not the raw 16:9 capture.** Guidde captures at
   1727x1080. A Short is 1080x1920. Center-crop/punch in on the input field
   and the result panel — the two things that matter on a phone screen — not
   a shrunk 16:9 frame with black bars.
4. **20-45 seconds.** If the one beat can't read in that window at a clear
   pace, the beat is too big — narrow it further, don't just speed up the
   footage.
5. **Cold open on the result, not the click.** Unlike the long-form rule
   (payoff at step 01, narrated), a Short opens on 1-2 seconds of the
   finished result already on screen, THEN the narration explains what just
   happened and rewinds to show the one click that produced it. Shorts lose
   viewers in the first second; don't spend it on "in this video."
6. **Real demo data, matching the parent long-form video exactly.** Same
   company, same input — a Short and its parent video should never show
   different demo data for the same enrichment.
7. **Title** still ends `With LinkFinder AI` and still scores via
   `vidiq_score_title`, but with `type: "short"`, not `"long"`. Score >= 80,
   same bar.
8. **On-screen caption text for the one number/result that matters** — Shorts
   are frequently watched muted. Burn in the input and the result as text,
   not just spoken.
9. Never "simply", "just", "easily" — same as the long-form rule.

## The production chain

```
long-form storyboard, already recorded
      |
      v
Descript: locate the one beat (input -> Enrich Data -> result) in the
existing composition
      |
      v
cut sheet (claude/guidee/scripts/<slug>-short.md)  <- this file's format
      |
      +--- vidiq_score_title (type: short)
      +--- vidiq_voiceover_generate  ->  short narration mp3 (20-45s)
      |
      v
Descript: reframe vertical (1080x1920), trim to the one beat, cut in the
new short narration, burn in input/result captions
      |
      v
YouTube Shorts + (optional) embed on the same target page as the parent video
```

## Cut sheet template

Copy this shape for every `scripts/<slug>-short.md`.

```markdown
# <Title — same pattern, `type: short` scored>

| | |
| --- | --- |
| **Parent video** | `<slug>` — `scripts/<slug>.md` (must already be recorded) |
| **Beat used** | steps <N>-<M> from the parent's click script |
| **Runtime** | <20-45>s |
| **Demo data** | identical to the parent |

## Cold open (0-2s)
> [result already on screen, no narration yet — or one burned-in caption]

## Narration
> <rewind-and-explain narration, 20-45s total, matching the parent's demo
> data and credit-cost fact if it fits>

## Caption overlay
- Input: `<value>`
- Result: `<value>`

## Reframe notes
<what to punch in on, from the 1727x1080 source, to fill a 1080x1920 frame>
```

## Fixed values

Same as `METHOD.md`: channel `UCAq5URh_O2gbg4bFFwBWfdg`, voice
`iP95p4xoKVk53GoZ742B` (Chris), palette accent `#2563eb` / bg `#111827` /
text `#f8fafc` / font Inter. Output changes to **1080x1920** instead of
1920x1080.
