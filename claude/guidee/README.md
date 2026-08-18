# Guidee Video System

A repeatable pipeline for turning a video title into a finished LinkFinder AI
product video, using the same Guidde recorder that produced the existing
guidees.

## The one thing to understand first

A Guidde PDF is an **output** of a screen recording, not an input to one.
Guidde captures the screen, auto-detects every click, and generates the
step titles, narration and the PDF from that capture. So there is no
`PDF -> video` path: without a new recording there are no new screenshots.

What *is* reusable — and what actually costs the time — is the **storyboard**:
the ordered list of clicks, the step titles, and the narration. Once that
exists, recording is mechanical: you follow the click script in the app,
Guidde does the rest, and the wording you record is already decided.

So this system generates storyboards, not videos:

```
video title  ->  storyboard (this repo)  ->  screen recording (Guidde)  ->  video + PDF
                        |
                        +-> YouTube title/description
                        +-> landing-page embed snippet
```

## Files

| File | What it is |
| --- | --- |
| `STYLE.md` | House style distilled from the existing guidees, plus the mistakes not to repeat |
| `template.md` | The exact output shape of every storyboard |
| `catalog.json` | Every shippable video, its target landing page, and whether it exists yet |
| `app-ui.md` | Ground truth for the app's real UI labels, so click scripts are never invented |
| `scripts/` | One storyboard per video |

## How to produce a new guidee

1. Pick a row from `catalog.json` with `"status": "missing"`.
2. Generate `scripts/<slug>.md` from `template.md`, obeying `STYLE.md` and
   using only UI labels that appear in `app-ui.md`.
3. Do a dry run of the click script in the app first, with the exact demo data
   named in the script. Fix anything that does not match reality.
4. Start the Guidde recorder and execute the click script without hesitating —
   every fumble becomes a junk step in the output.
5. Replace Guidde's auto-generated titles and narration with the ones in the
   storyboard. This is the step that makes them sound like a product, not a
   screen reader.
6. Publish, then paste the embed snippet into the landing page named in the
   script and flip the catalog row to `"status": "live"`.

## Why the landing-page mapping matters

The site has ~200 pages and 8 videos. Each video is worth far more attached to
a money page than sitting on a channel: it lifts dwell time on the page that
ranks, and the YouTube description links back to it. Every storyboard in this
system therefore names exactly one target page, and no two videos target the
same page.
