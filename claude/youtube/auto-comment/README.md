# Auto-comment the CTA on every video

Posts **`LinkFinder AI : linkfinderai.com`** as a top-level comment on every
upload of the channel — Shorts included, they are ordinary videos to the API.

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

1. https://console.cloud.google.com/ → create a project (any name).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External → fill the required fields → under
   **Test users** add the Google account that owns the channel
   (`hamoureliasse@gmail.com`).
4. **Credentials → Create credentials → OAuth client ID**, application type
   **TVs and Limited Input devices**. Copy the client ID and client secret.
5. Authorise — this works with no browser on the machine running the script:

   ```bash
   export YT_CLIENT_ID='....apps.googleusercontent.com'
   export YT_CLIENT_SECRET='....'
   python3 auto_comment.py --device-auth
   ```

   It prints a short code. Open **google.com/device** on any phone or laptop,
   enter it, sign in as the channel owner, approve. Google warns that the app
   is unverified — expected for your own private tool. The refresh token lands
   in `.youtube-token.json` and you never do this again.

   `--auth` is the alternative if a browser *is* available locally; it opens
   a loopback consent page instead. Application type must then be **Desktop
   app**, and you can drop the downloaded `client_secret.json` beside this
   script instead of exporting the two variables.

> While the consent screen is in **Testing** status Google expires refresh
> tokens after 7 days. Fine for a one-off backfill. If you want this on a cron
> for new uploads, hit **Publish app** on the consent screen — for a
> single-user tool that needs no Google review.

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
| `--text` | `LinkFinder AI : linkfinderai.com` | any body you like |
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

So **~51 units per video, roughly 195 videos per day**. At 163 uploads the
channel fits in one run, with a little room. Past that the script stops on
`quotaExceeded`, saves state, and tells you to re-run tomorrow.

## The spam filter

163 byte-identical comments carrying the same URL, posted fast, is exactly the
shape YouTube's automated filter looks for. Being the channel owner helps a lot
but is not a guarantee — filtered comments go to "Held for review" in Studio and
are invisible to viewers, and the API reports them as posted either way.

Which is why `--delay` defaults to 20s with jitter (≈55 min for the channel) and
why `--limit 3` exists. **Do the small run first**, then open one of those
videos in an incognito window and confirm the comment is actually visible before
committing the other 160.

## Tests

```bash
python3 test_auto_comment.py
```

A fake API drives the whole loop offline — no network, no credentials. Covers
duration parsing, Shorts detection, idempotency, comments-disabled videos,
quota exhaustion and resume, and the two report files.
