# Video factory — daily YouTube tutorials with no human step

Built 12–13 Nov 2026 at the owner's request: "a system that makes YouTube videos
on its own, scheduled for months, and I do nothing".

## What one video is

A real recording of the LinkFinder AI app (`app.html` from this repo, served
locally and driven by Playwright), narrated, in the format of
`claude/youtube/METHOD.md`:

1. Cover card: `<Action> With LinkFinder AI` + *"In this video we are going to see
   how to … using LinkFinder AI."*
2. Step 01 = the payoff: the finished result table, slow zoom.
3. The flow: one single lookup, then the same lookup on a CSV, Process, results,
   Export. The credit cost is said once.
4. Closing card naming the next action (first link in the description).

**Why this is not a mock-up.** The sandbox cannot reach linkfinderai.com, so the
app runs from the repo with its network answered locally. Every value on screen
comes from a real LinkFinder AI lookup made when the scenario was written
(`mocks._source` in each scenario). The UI is the production `app.html` of the
commit that built the video. Time-limited banners, the chat bubble and the
interview popup are hidden; nothing else is changed.

## Files

| File | Role |
| --- | --- |
| `scenarios/<slug>.json` | One video: title, cover line, narration per step, actions, real values (`mocks.byInput`), description, tags |
| `assets/*.csv` | The CSV each scenario uploads |
| `render.mjs` | Serves the repo, answers the app's network calls from the scenario, drives the UI with a visible cursor, records frames with the Chrome screencast, paced by narration length |
| `cards.mjs` | Cover and closing cards (HTML → PNG) |
| `build.py` | Narration (edge-tts, one voice per video, Piper offline as fallback) → render → cards → ffmpeg assembly, loudness −16 LUFS → `<slug>.mp4` + `meta.json` |
| `tools/company_bulk.py`, `tools/name_bulk.py` | Generators for the two scenario shapes used so far |
| `.github/workflows/video-factory.yml` | Builds every scenario that has no MP4 in the `video-factory` release yet, on push to `scenarios/` or by hand (`slugs` input); uploads MP4 + meta to the release |

Local test without network: `python3 video_factory/build.py video_factory/scenarios/<slug>.json /tmp/out --fake-tts`
(silent narration sized from word count).

## Publishing

The MP4 public URL is
`https://github.com/eliassaoe/findlinkai/releases/download/video-factory/<slug>.mp4`.
`vidiq_video_upload(url=…)` imports it, `vidiq_social_post_draft_create`
schedules it on the YouTube channel with `publishAt` (max one year ahead).
Scheduled posts cannot be cancelled through vidIQ — only in YouTube Studio.

Channel: **Elias IA** (`UCAq5URh_O2gbg4bFFwBWfdg`), English, owner's choice
(13 Nov 2026). The product channel `@linkfinder_ai` (`UCLDVCTNGcJkzVeFzcoZYDYA`)
is not used.

## Adding videos

1. Pick a flow whose data is right. **Checked 12 Nov — do not use for videos
   until fixed:** company phone for multinationals (Salesforce → a German number,
   Microsoft/Atlassian → Australian, Stripe → French, hotel chains → Asia/garbage),
   `company_name_to_email` for professional-services firms (returns a named
   employee's email, a privacy-office inbox or a subsidiary's domain),
   LinkedIn employee count (HubSpot → "2-10"), company page data (Microsoft
   city = Bratislava). Good: website, LinkedIn page, name → LinkedIn profile,
   phone for US mid-size companies.
2. Run the real lookups (LinkFinder MCP or API) and keep only correct values.
3. Write the scenario with a generator, run it locally with `--fake-tts`, look
   at `payoff.jpg` and a few frames.
4. Title must score ≥ 80 on `vidiq_score_title` (type long, channel above).
5. Push: the workflow builds it.
