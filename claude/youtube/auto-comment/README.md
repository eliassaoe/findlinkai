# Auto-comment the CTA on every video

Posts a CTA comment on every upload of the channel — Shorts included, they are
ordinary videos to the API. The text lives in `COMMENT_TEXT`:

> Find anyone's email, phone number or LinkedIn profile from a name or a
> company → linkfinderai.com

`auto_comment.py`, stdlib only, no `pip install`.

## Read this first: pinning cannot be automated

The YouTube Data API has **no pin endpoint**. The comment surface is
`commentThreads.insert/list`, `comments.insert/update/setModerationStatus/delete`
— and that is the whole list. Pinning exists only in YouTube Studio and the
mobile app, by hand, one video at a time. There is no bulk pin anywhere, not
even in Studio.

So the script posts, and then writes `pin-checklist.md`: one line per video with
a `?v=…&lc=<commentId>` deep link that opens the video **scrolled to your
comment**. Three-dot menu → Pin. That is the fastest manual path that exists.

If a permanent link matters more than a pinned one, the API *can* bulk-edit
descriptions (`videos.update`) — a first-line CTA in the description is fully
automatable, unlike a pin. Say the word and it's a small addition to this script.

## Setup — about 5 minutes, once

You need a Google OAuth client. It has to be yours; there is no way around it,
because posting a comment acts as your channel. Nothing to install.

> ### Do NOT use the `LinkFinder AI Addon` project
>
> That project (number `1096371450007`) hosts the **published Google Sheets
> Marketplace add-on** — its `Apps Script`, `Google Workspace Add-ons` and
> `Google Workspace Marketplace Integration Client` OAuth clients are the live
> add-on, and the project is verified by Google.
>
> The OAuth consent screen is configured **per project and shared by every
> client in it**. `youtube.force-ssl` is a sensitive scope, so adding it there
> puts the verified app back into re-verification: until Google re-approves,
> users hit the unverified-app screen and the project is subject to a 100-user
> cap. That cap would apply to the add-on's consent screen, not just to this
> script — i.e. it could take the published add-on down.
>
> **Create a separate Google Cloud project for this tool.** It is free, takes a
> minute, and isolates the consent screen completely.

1. https://console.cloud.google.com/ → project picker (top bar) → **New
   project**, name it something like `youtube-auto-comment`. Confirm the picker
   now shows that new project before continuing.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External → fill the required fields → under
   **Test users** add the Google account that owns the channel
   (`hamoureliasse@gmail.com`).
4. **Credentials → Create credentials → OAuth client ID**, application type
   **TVs and Limited Input devices**. Copy the client ID and client secret.
5. **Credentials → Create client**, application type **Desktop app**. Copy the
   client ID and secret into `client_secret.json` beside this script:

   ```json
   {"installed":{"client_id":"...","client_secret":"..."}}
   ```

   Not "TVs and Limited Input devices" — see below.

6. Authorise. If a browser is available on this machine:

   ```bash
   python3 auto_comment.py --auth
   ```

   If not — running on a server, a container, a sandbox — use the paste-back
   flow instead. Print a consent URL, open it in any browser, approve, and the
   redirect to `http://localhost:8080` will fail to load. That is expected: the
   address bar now holds the code. Paste the whole URL back.

   ```bash
   python3 auto_comment.py --auth-url
   python3 auto_comment.py --exchange 'http://localhost:8080/?code=4/0A...&scope=...'
   ```

   The refresh token lands in `.youtube-token.json` and you never do this again.

### Why not the device flow

`--device-auth` exists and works, but **cannot be used to post comments**.
Google rejects the only scope that matters:

    Invalid device flow scope: https://www.googleapis.com/auth/youtube.force-ssl

The device endpoint accepts `youtube`, `youtube.readonly` and `youtube.upload`
— but `commentThreads.insert` requires `youtube.force-ssl`, which it refuses.
And a TV/limited-input client cannot fall back to loopback either:

    Localhost URI is not allowed for 'NATIVE_DEVICE' client type in this context.

Hence **Desktop app** as the client type, with the paste-back flow above when
there is no local browser. Both findings are from probing the live endpoints,
not from the docs — the YouTube device-flow page shows `force-ssl` in a sample
response, which is misleading.

> A brand-new project's consent screen is unverified, so Google expires refresh
> tokens after 7 days and shows a warning screen you click through. Both are
> fine for a one-off backfill of the channel. If you later want this on a cron
> for new uploads, re-authorise weekly rather than seeking verification — and
> never by moving the client into the add-on's project.

## Run

```bash
python3 auto_comment.py                    # dry run: lists targets, posts nothing
python3 auto_comment.py --live --limit 3   # post on 3 videos, check they look right
python3 auto_comment.py --live             # the rest
```

Useful flags:

| Flag | Default | |
| --- | --- | --- |
| `--channel` | `UCAq5URh_O2gbg4bFFwBWfdg` | the other two authorised channels also work |
| `--text` | see `COMMENT_TEXT` | any body you like |
| `--since-days` | — | only recent uploads; makes a daily cron ~2 units |
| `--rewrite` | — | update text of comments already posted, in place |
| `--type` | `all` | `long` or `short` to target one format |
| `--delay` | `20` | seconds between posts, jittered ±40% |
| `--limit` | — | stop after N posts |

**Re-running is safe.** Before each post the script checks whether this channel
already left a comment containing `linkfinderai.com` on that video, and progress
goes to `state.json` after every single post. Interrupt it, hit the quota wall,
lose the connection — re-run the identical command and it picks up where it
stopped. Someone *else's* comment mentioning the domain does not count as yours.

## Quota

Default allowance is 10,000 units/day, resetting at midnight Pacific.

| Call | Units | |
| --- | --- | --- |
| `commentThreads.insert` | 50 | per video |
| duplicate check | 1 | per video |
| listing uploads | 1 | per 50 videos |

So **~51 units per video, roughly 195 videos per day**. The channel is at 334
uploads, so a full backfill is two days: the script stops on `quotaExceeded`,
saves state, and re-running after the midnight-Pacific reset finishes the rest
without duplicates.

For the daily cron, `--since-days 7` stops paging the uploads playlist at the
window edge, so a day with no new uploads costs about 2 units.

## The spam filter

300+ byte-identical comments carrying the same URL, posted fast, is exactly the
shape YouTube's automated filter looks for. Being the channel owner helps a lot
but is not a guarantee — filtered comments go to "Held for review" in Studio and
are invisible to viewers, and the API reports them as posted either way.

Which is why `--delay` defaults to 20s with jitter (≈55 min for the channel) and
why `--limit 3` exists. **Do the small run first**, then open one of those
videos in an incognito window and confirm the comment is actually visible before
committing the rest.

## Tests

```bash
python3 test_auto_comment.py
```

A fake API drives the whole loop offline — no network, no credentials. Covers
duration parsing, Shorts detection, idempotency, comments-disabled videos,
quota exhaustion and resume, the `--since-days` window, the device-flow poll,
and the two report files.

## Keeping it running

`.github/workflows/youtube-auto-comment.yml` runs this daily against new
uploads. It needs `YT_CLIENT_ID`, `YT_CLIENT_SECRET` and `YT_REFRESH_TOKEN` as
repository secrets — and the consent screen **published**, since a Testing-status
app expires refresh tokens after 7 days.
