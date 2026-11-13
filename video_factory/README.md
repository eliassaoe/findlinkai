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
`https://github.com/eliassaoe/findlinkai/releases/download/<release>/<slug>.mp4`.
GitHub caps a release at **1000 assets** (3 per video: mp4, meta, thumb), and
`video-factory` hit it on 13 Nov with 338 videos. Since then a scenario uploads to
its `release` field, default `video-factory-2`: ideas500 longs go to
`video-factory-3` (first 300) and `video-factory-4`, its shorts to
`video-factory-5`. An MP4 that is not in `video-factory` is in the release its
scenario names (or `video-factory-2` if it names none).
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
   **Every wrong value is a product bug (owner rule, 13 Nov 2026):** log it in
   `docs/workflow-fixes-from-videos.md` with the input, the wrong output and the
   cause, fix the n8n node in a draft, and tell the owner to publish.
3. Write the scenario with a generator, run it locally with `--fake-tts`, look
   at `payoff.jpg` and a few frames.
4. Title must score ≥ 80 on `vidiq_score_title` (type long, channel above).
5. Push: the workflow builds it.

## Shorts (owner's rule, 13 Nov 2026: YouTube SEO, not viral)

Shorts target **what people type in YouTube search**: one searched keyword per
short ("how to find cold email leads", "company name to domain"…), picked with
`vidiq_keyword_research` (volume and competition noted in each scenario's
`keyword` field), title built on that keyword and scored ≥ 85 with
`vidiq_score_title type=short`. Never a famous brand or person as the hook
("Nike's phone number" — nobody searches it; tried and dropped 13 Nov).
`tools/seo_shorts.py` holds the specs; `format: short` renders 1080x1920.
No personal contact data (a person's email or mobile) on screen, ever.

## Thumbnails

`thumb.mjs` draws a 1280x720 PNG from the scenario's real values
(`mocks.byInput`), in one of six styles set by `thumb.style`: `banner`
(yellow + black banners, red arrow — the look of the channel's best LinkFinder
thumbnails), `card` (huge 3-line hook), `flow` (empty list -> filled list),
`number` (giant "10/10 FOUND"), `white` (one name -> one result, huge), `sheet`
(Google Sheets look). Owner's rule (13 Nov): **vary the styles, never one look
for every video** — the point is to find which one gets clicked. `build.py` makes
`<slug>.thumb.png` with every video and the workflow uploads it to the release.
Committed copies live in `thumbnails/` so `raw.githubusercontent.com` can serve
them to `vidiq_update_video_thumbnail` (it refuses redirects, so not release URLs).

`vidiq_score_thumbnail` only scores the live YouTube thumbnail of a **public**
video (it refuses outside image hosts), so a scheduled video is scored the day
it goes public; the score goes in `schedule.json` (`thumbScore`). After ~10
public videos, compare CTR by `thumbStyle` and drop the losing styles.

YouTube refuses `<` or `>` anywhere in a description or tag (so no `->` arrows).
Pilot drafts and their ids: `schedule.json`.


## The 363 + 18 plan: daily upload waves (owner approved 13 Nov 2026, "c'est un grand oui")

- Plan and dates: `schedule360.json` (titles and dates the owner approved in the
  "360 YouTube Plan" page). Upload state: `data/uploaded360.json`
  (`uploadId`, `postId`). Thumbnails for the Best series: `data/best_thumbs.json`.
- Each wave (~30 a day, YouTube caps uploads per channel per day): take the
  earliest-dated posts that are built (MP4 in the scenario's release, see Publishing) and not
  in `uploaded360.json`; `vidiq_video_upload(url=release asset)` →
  `vidiq_social_post_draft_create` (YOUTUBE, public, categoryId 28, publishAt =
  the plan date, title/tags/description from the scenario; Best series also
  `thumbnailImageId` from `vidiq_upload_image(best_thumbs url)`) →
  `vidiq_social_post_publish` → record `postId` in `uploaded360.json`, commit with
  `[skip ci]`.
- Release assets cannot be deleted from a Claude session (403); to rebuild a
  video, dispatch `video-factory.yml` with `slugs` — the upload uses `--clobber`.
- 108 v360 videos were rebuilt on 13 Nov for title case / "a/an" (list in the
  commit "gen360: proper title case"); upload only after that run finished.

## The 1,000-video plan: 3 long + 2 shorts a day (owner, 13 Nov 2026)

The owner's call: 5 videos a day, **3 long + 2 shorts** (long videos bring the
site visitors), about 1,000 videos, which means about 500 new ideas, each usable
as a long video and as a short.

- `tools/ideas500.py` holds the ideas, every one a searched YouTube phrase from
  `vidiq_keyword_research` (13 Nov; measured volume in `volume` when vidIQ
  measures it, "" when it is under its 750/month floor). Four families:
  `head` (tool and how-to searches: "cold email" 265K, "how to scrape leads from
  search" 79K, "ai lead generation" 80K…), `alt` ("Snov.io alternative"…),
  `industry` ("law firm email list"…, 50 industries added 13 Nov plus the two
  missing longs of the 40 old ones), `clients` ("how to find clients for video
  editing" 79K, copywriting 14K, thumbnail design 12.6K…).
- Long = the flagship format (`best_series.build`): first line "In this video we
  are going to see how to … using LinkFinder AI", the result, one company step by
  step, the same lookup on a CSV, Sheets / API / History, close on the next action.
  Short = the same main lookup on the same company, ~20 s. Only the 120
  biggest-volume ideas get a short now (2 a day after the 284 already planned);
  the others can be cut later from the same data.
- Title templates scored with `vidiq_score_title` (13 Nov): head 84, industry
  85-95, clients 89, short 88; the alternative form "X Alternative: Free Company
  Emails (2026)" scored 79 and was replaced by "X Alternative: How to Find Company
  Emails Free" (82).
- Main company: the least-used company whose four lookups all pass
  `gen360.check`; Best-series companies go to the back of the queue. An idea whose
  industry has no checked data yet is listed under `skipped` in
  `data/ideas500.json` and comes back when the lookups exist.
- `tools/schedule1000.py` writes `schedule1000.json`: every date of
  `schedule360.json` kept (plan=360), the new longs fill each day up to 3
  (12:00 / 14:00 / 16:00 / 20:00 UTC), biggest search first, then families
  interleaved; the new shorts take 10:00 / 18:00 on days that have none.
  Upload waves follow `schedule1000.json` from now on.

### Automatic daily wave (owner, 13 Nov 2026: "envoie tout sur vidIQ")

vidIQ cannot hold 830 videos and send them later: `vidiq_social_post_publish`
uploads to YouTube at once (private, public at `publishAt`), so YouTube's daily
upload limit applies on the day of the upload. A daily scheduled task
("YouTube daily upload wave", 08:34 Paris) therefore does ~30 a day:
`tools/wave.py next 30` (earliest-dated, built, not yet uploaded, with title,
description, tags, publishAt and thumbnail) → vidIQ upload / draft / publish /
status → `tools/wave.py record` → commit `[skip ci]`. Thumbnails of long videos
are served from the orphan branch `thumbs` (`thumbs.yml`, re-run after each
factory build) because vidIQ refuses release-asset redirects.
Every video gets its thumbnail (shorts included, `thumbs` branch; Best series
as a JPEG under YouTube's 2 MB limit), attached at upload with
`thumbnailImageId`. Videos uploaded before 13 Nov evening had none: all 71
scheduled ones were set with `vidiq_update_video_thumbnail` (5 credits each);
YouTube allows ~10 thumbnail changes per ~15 minutes. State:
`data/thumbs_applied.json`.
`wave.py` only picks posts not in `data/uploaded360.json`, so always `git pull`
before a manual wave to avoid uploading a video twice.
