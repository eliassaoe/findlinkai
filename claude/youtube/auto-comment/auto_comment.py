#!/usr/bin/env python3
"""Post one CTA comment on every video of a YouTube channel, Shorts included.

Stdlib only — no pip install. Python 3.8+.

    python3 auto_comment.py --device-auth          # once: approve on any device
    python3 auto_comment.py                        # dry run, changes nothing
    python3 auto_comment.py --live                 # actually posts

--device-auth needs no browser on this machine: it prints a short code you
enter at google.com/device from a phone or laptop. --auth is the alternative
when a browser is available locally.

It is safe to re-run. A video that already carries the comment is skipped, so
a second run only fills in what the first one missed (or what YouTube's daily
quota cut short).

WHAT THIS CANNOT DO: pin. The YouTube Data API has no pin endpoint — the
comment resource exposes insert/list/update/setModerationStatus/delete and
nothing else. Pinning exists only in YouTube Studio and the mobile app. Every
posted comment is therefore written to pin-checklist.md with a deep link that
opens the video scrolled to that exact comment, which is the fastest manual
path there is.
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

# --- what gets posted ------------------------------------------------------

COMMENT_TEXT = "LinkFinder AI : linkfinderai.com"

# Substring used to recognise a comment this script already posted, so re-runs
# skip it. Keep it stable even if COMMENT_TEXT is reworded.
COMMENT_MARKER = "linkfinderai.com"

# --- constants -------------------------------------------------------------

API = "https://www.googleapis.com/youtube/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
DEVICE_URL = "https://oauth2.googleapis.com/device/code"
SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"
DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

# Loopback redirect for the paste-back flow. Desktop-app clients accept any
# port on localhost/127.0.0.1 without registering it.
LOOPBACK_REDIRECT = "http://localhost:8080"

HERE = Path(__file__).resolve().parent
TOKEN_FILE = HERE / ".youtube-token.json"
STATE_FILE = HERE / "state.json"
LOG_CSV = HERE / "posted.csv"
PIN_CHECKLIST = HERE / "pin-checklist.md"

# YouTube's default quota is 10,000 units/day. Costs that matter here:
QUOTA_INSERT = 50  # commentThreads.insert
QUOTA_LIST = 1  # any list call


class QuotaExceeded(Exception):
    """Daily quota is gone. Stop cleanly; the next run resumes."""


class ApiError(Exception):
    def __init__(self, status, reason, message):
        super().__init__(f"{status} {reason}: {message}")
        self.status = status
        self.reason = reason
        self.message = message


# --- HTTP ------------------------------------------------------------------


def _request(method, url, token=None, body=None, form=None, timeout=30):
    data, headers = None, {"Accept": "application/json"}
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            err = json.loads(raw)["error"]
            reason = (err.get("errors") or [{}])[0].get("reason", "")
            message = err.get("message", raw)
        except Exception:
            reason, message = "", raw
        if reason in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"):
            raise QuotaExceeded(message) from exc
        raise ApiError(exc.code, reason, message) from exc


def api_get(path, token, **params):
    """GET with retry on transient failures."""
    url = f"{API}/{path}?" + urllib.parse.urlencode(params, doseq=True)
    for attempt in range(4):
        try:
            return _request("GET", url, token=token)
        except QuotaExceeded:
            raise
        except (ApiError, urllib.error.URLError, TimeoutError) as exc:
            if isinstance(exc, ApiError) and exc.status < 500 and exc.status != 429:
                raise
            if attempt == 3:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("unreachable")


# --- OAuth -----------------------------------------------------------------


def load_client():
    """Client id/secret from env or client_secret.json next to this script."""
    cid = os.environ.get("YT_CLIENT_ID")
    secret = os.environ.get("YT_CLIENT_SECRET")
    if cid and secret:
        return cid, secret
    path = HERE / "client_secret.json"
    if path.exists():
        blob = json.loads(path.read_text())
        node = blob.get("installed") or blob.get("web") or blob
        return node["client_id"], node["client_secret"]
    sys.exit(
        "No OAuth client. Put client_secret.json (Desktop app) beside this script, "
        "or set YT_CLIENT_ID / YT_CLIENT_SECRET. See README.md."
    )


def _oauth_post(url, form):
    """POST to an OAuth endpoint, returning (http_status, parsed_body).

    OAuth errors carry a *string* `error` field, unlike the API's object, and
    the device flow signals "still waiting" through an HTTP error status. So
    this returns rather than raises.
    """
    data = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except ValueError:
            return exc.code, {"error": "http_error", "error_description": raw}


def print_auth_url():
    """Emit a consent URL whose redirect the user copies back by hand.

    The device flow cannot be used to post comments: Google rejects
    youtube.force-ssl as an "Invalid device flow scope", and that is the scope
    commentThreads.insert requires. This is the substitute that still needs no
    software on the user's machine — they approve in a browser, the redirect
    to localhost fails to load, and the address bar holds the code.
    """
    cid, _ = load_client()
    params = {
        "client_id": cid,
        "redirect_uri": LOOPBACK_REDIRECT,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    }
    print(AUTH_URL + "?" + urllib.parse.urlencode(params))


def exchange_code(pasted):
    """Trade an authorisation code for a refresh token.

    Accepts either the bare code or the whole failed redirect URL pasted from
    the address bar, which is what a human actually has to hand.
    """
    code = pasted.strip()
    if "code=" in code:
        query = urllib.parse.urlparse(code).query or code.split("?", 1)[-1]
        values = urllib.parse.parse_qs(query).get("code")
        if not values:
            sys.exit("No ?code= found in that URL.")
        code = values[0]

    cid, secret = load_client()
    status, token = _oauth_post(
        TOKEN_URL,
        {
            "code": code,
            "client_id": cid,
            "client_secret": secret,
            "redirect_uri": LOOPBACK_REDIRECT,
            "grant_type": "authorization_code",
        },
    )
    if "refresh_token" not in token:
        detail = token.get("error_description") or token.get("error") or token
        sys.exit(
            f"Exchange failed ({status}): {detail}\n"
            "Codes are single-use and expire in minutes — get a fresh one with "
            "--auth-url if this one was already spent."
        )
    granted = token.get("scope", "")
    if "youtube.force-ssl" not in granted:
        sys.exit(f"Wrong scope granted: {granted!r}. Posting comments needs {SCOPE}.")
    _save_refresh_token(token["refresh_token"])


def run_device_flow():
    """Device flow: no browser needed here, the user approves on any device.

    This is what makes the script runnable somewhere headless — a server, a
    container, a CI box — while the human approves from their phone.
    """
    cid, secret = load_client()
    status, data = _oauth_post(DEVICE_URL, {"client_id": cid, "scope": SCOPE})
    if "device_code" not in data:
        sys.exit(
            f"Device flow rejected ({status}): {data.get('error_description') or data}\n"
            "The OAuth client must be of type 'TVs and Limited Input devices'."
        )

    url = data.get("verification_url") or data.get("verification_uri")
    print("\n" + "=" * 58)
    print(f"  Open:  {url}")
    print(f"  Code:  {data['user_code']}")
    print("=" * 58)
    print("\nSign in as the channel owner and approve. Waiting...\n")

    interval = int(data.get("interval", 5))
    deadline = time.time() + int(data.get("expires_in", 1800))
    while time.time() < deadline:
        time.sleep(interval)
        status, token = _oauth_post(
            TOKEN_URL,
            {
                "client_id": cid,
                "client_secret": secret,
                "device_code": data["device_code"],
                "grant_type": DEVICE_GRANT,
            },
        )
        error = token.get("error")
        if error == "authorization_pending":
            continue
        if error == "slow_down":
            interval += 5
            continue
        if error == "access_denied":
            sys.exit("Authorisation was denied.")
        if error == "expired_token":
            sys.exit("The code expired. Run --device-auth again.")
        if error:
            sys.exit(f"Authorisation failed: {token.get('error_description') or error}")
        if "refresh_token" not in token:
            sys.exit(
                "Google returned no refresh token. Revoke this app at "
                "https://myaccount.google.com/permissions and retry."
            )
        _save_refresh_token(token["refresh_token"])
        return
    sys.exit("Timed out waiting for approval.")


def _save_refresh_token(refresh):
    TOKEN_FILE.write_text(json.dumps({"refresh_token": refresh}, indent=2))
    try:
        TOKEN_FILE.chmod(0o600)
    except OSError:
        pass
    print(f"Authorised. Refresh token saved to {TOKEN_FILE.name}.")


def run_consent_flow():
    """Loopback flow: opens a browser once, stores the refresh token."""
    cid, secret = load_client()
    holder = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = urllib.parse.urlparse(self.path).query
            holder.update(urllib.parse.parse_qs(query))
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            ok = "code" in holder
            self.wfile.write(
                b"<h2>Authorised. Close this tab and return to the terminal.</h2>"
                if ok
                else b"<h2>Authorisation failed. Check the terminal.</h2>"
            )

        def log_message(self, *_):  # keep the console clean
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{server.server_port}"
    params = {
        "client_id": cid,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    }
    url = AUTH_URL + "?" + urllib.parse.urlencode(params)
    print("Opening your browser to authorise. If nothing opens, paste this:\n")
    print(url + "\n")
    webbrowser.open(url)

    thread = threading.Thread(target=server.handle_request)
    thread.start()
    thread.join(timeout=300)
    server.server_close()

    if "code" not in holder:
        sys.exit("No authorisation code received (timed out after 5 minutes).")

    tokens = _request(
        "POST",
        TOKEN_URL,
        form={
            "code": holder["code"][0],
            "client_id": cid,
            "client_secret": secret,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
        },
    )
    if "refresh_token" not in tokens:
        sys.exit(
            "Google returned no refresh token. Revoke this app at "
            "https://myaccount.google.com/permissions and run --auth again."
        )
    _save_refresh_token(tokens["refresh_token"])


def access_token():
    refresh = os.environ.get("YT_REFRESH_TOKEN")
    if not refresh:
        if not TOKEN_FILE.exists():
            sys.exit("Not authorised yet. Run:  python3 auto_comment.py --auth")
        refresh = json.loads(TOKEN_FILE.read_text())["refresh_token"]
    cid, secret = load_client()
    tokens = _request(
        "POST",
        TOKEN_URL,
        form={
            "refresh_token": refresh,
            "client_id": cid,
            "client_secret": secret,
            "grant_type": "refresh_token",
        },
    )
    return tokens["access_token"]


# --- YouTube ---------------------------------------------------------------


def uploads_playlist(token, channel_id):
    data = api_get("channels", token, part="contentDetails", id=channel_id)
    items = data.get("items") or []
    if not items:
        sys.exit(
            f"Channel {channel_id} not found, or the signed-in Google account does "
            "not own it. Sign in as the channel owner and run --auth again."
        )
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def list_uploads(token, playlist_id):
    """Every upload, newest first. Shorts are ordinary videos and are included."""
    videos, page = [], None
    while True:
        data = api_get(
            "playlistItems",
            token,
            part="snippet,contentDetails",
            playlistId=playlist_id,
            maxResults=50,
            **({"pageToken": page} if page else {}),
        )
        for item in data.get("items", []):
            videos.append(
                {
                    "id": item["contentDetails"]["videoId"],
                    "title": item["snippet"]["title"],
                    "published": item["contentDetails"].get(
                        "videoPublishedAt", item["snippet"]["publishedAt"]
                    ),
                }
            )
        page = data.get("nextPageToken")
        if not page:
            return videos


def parse_duration(iso):
    """ISO-8601 duration -> seconds. Handles PT#H#M#S; days are not used by YouTube."""
    if not iso.startswith("PT"):
        return 0
    total, number = 0, ""
    for char in iso[2:]:
        if char.isdigit():
            number += char
        else:
            value = int(number or 0)
            total += value * {"H": 3600, "M": 60, "S": 1}.get(char, 0)
            number = ""
    return total


def annotate_kind(token, videos):
    """Tag each video 'short' or 'long' using duration. 1 quota unit per 50."""
    by_id = {v["id"]: v for v in videos}
    ids = list(by_id)
    for start in range(0, len(ids), 50):
        chunk = ids[start : start + 50]
        data = api_get("videos", token, part="contentDetails", id=",".join(chunk))
        for item in data.get("items", []):
            seconds = parse_duration(item["contentDetails"]["duration"])
            by_id[item["id"]]["seconds"] = seconds
            by_id[item["id"]]["kind"] = "short" if 0 < seconds <= 180 else "long"
    for video in videos:
        video.setdefault("kind", "long")
        video.setdefault("seconds", 0)
    return videos


def already_commented(token, video_id, my_channel_id):
    """True if this channel already left a comment carrying the marker.

    Returns the string 'disabled' when the video has comments turned off.
    """
    try:
        data = api_get(
            "commentThreads",
            token,
            part="snippet",
            videoId=video_id,
            maxResults=100,
            order="time",
            searchTerms=COMMENT_MARKER,
            textFormat="plainText",
        )
    except ApiError as exc:
        if exc.reason in ("commentsDisabled", "videoNotFound", "forbidden"):
            return "disabled"
        raise
    for thread in data.get("items", []):
        top = thread["snippet"]["topLevelComment"]["snippet"]
        author = (top.get("authorChannelId") or {}).get("value")
        text = top.get("textOriginal") or top.get("textDisplay") or ""
        if author == my_channel_id and COMMENT_MARKER.lower() in text.lower():
            return True
    return False


def post_comment(token, channel_id, video_id, text):
    body = {
        "snippet": {
            "channelId": channel_id,
            "videoId": video_id,
            "topLevelComment": {"snippet": {"textOriginal": text}},
        }
    }
    data = _request(
        "POST",
        f"{API}/commentThreads?part=snippet",
        token=token,
        body=body,
    )
    return data["snippet"]["topLevelComment"]["id"]


# --- state -----------------------------------------------------------------


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"done": {}, "skipped": {}}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def write_reports(state):
    rows = ["video_id,kind,comment_id,posted_at,title"]
    lines = [
        "# Pin checklist",
        "",
        "The YouTube Data API cannot pin — no endpoint exists for it. Each link",
        "below opens the video with the comment already highlighted: tap the",
        "three-dot menu on it and choose **Pin**. On mobile YouTube this is the",
        "fastest path; YouTube Studio has no bulk pin either.",
        "",
    ]
    for video_id, entry in sorted(
        state["done"].items(), key=lambda kv: kv[1].get("posted_at", "")
    ):
        title = entry.get("title", "").replace('"', "'")
        rows.append(
            f'{video_id},{entry.get("kind","")},{entry.get("comment_id","")},'
            f'{entry.get("posted_at","")},"{title}"'
        )
        link = f"https://www.youtube.com/watch?v={video_id}&lc={entry.get('comment_id','')}"
        lines.append(f"- [ ] [{title}]({link})")
    LOG_CSV.write_text("\n".join(rows) + "\n")
    PIN_CHECKLIST.write_text("\n".join(lines) + "\n")


# --- main ------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Post a CTA comment on every video of your channel.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Default is a dry run. Nothing is posted without --live.",
    )
    parser.add_argument("--auth", action="store_true", help="one-time consent via local browser")
    parser.add_argument(
        "--device-auth",
        action="store_true",
        help="consent via a code approved elsewhere (cannot post comments: Google "
        "rejects youtube.force-ssl for this flow)",
    )
    parser.add_argument(
        "--auth-url", action="store_true", help="print a consent URL to open in any browser"
    )
    parser.add_argument(
        "--exchange", metavar="URL", help="redirect URL (or bare code) pasted back from --auth-url"
    )
    parser.add_argument("--live", action="store_true", help="actually post (default: dry run)")
    parser.add_argument(
        "--channel",
        default=os.environ.get("YT_CHANNEL_ID", "UCAq5URh_O2gbg4bFFwBWfdg"),
        help="channel id (default: the LinkFinder AI channel)",
    )
    parser.add_argument("--text", default=COMMENT_TEXT, help="comment body to post")
    parser.add_argument(
        "--type",
        choices=["all", "long", "short"],
        default="all",
        help="which videos to target (default: all, Shorts included)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=20.0,
        help="seconds between posts, jittered +/-40%% (default: 20)",
    )
    parser.add_argument("--limit", type=int, help="stop after N posts, for a cautious first run")
    args = parser.parse_args()

    if args.auth_url:
        print_auth_url()
        return 0
    if args.exchange:
        exchange_code(args.exchange)
        return 0
    if args.device_auth:
        run_device_flow()
        return 0
    if args.auth:
        run_consent_flow()
        return 0

    token = access_token()
    print(f"Channel: {args.channel}")

    playlist = uploads_playlist(token, args.channel)
    videos = list_uploads(token, playlist)
    print(f"Found {len(videos)} uploads.")

    if args.type != "all":
        videos = annotate_kind(token, videos)
        videos = [v for v in videos if v["kind"] == args.type]
        print(f"{len(videos)} match --type {args.type}.")
    else:
        videos = annotate_kind(token, videos)
        shorts = sum(1 for v in videos if v["kind"] == "short")
        print(f"  {shorts} Shorts, {len(videos) - shorts} long-form — all targeted.")

    state = load_state()
    todo = [v for v in videos if v["id"] not in state["done"]]
    print(f"{len(state['done'])} already done in a previous run, {len(todo)} to go.")

    if not args.live:
        print("\nDRY RUN — nothing will be posted. Re-run with --live.\n")
        for video in todo[: args.limit or 10]:
            print(f"  would comment on [{video['kind']:>5}] {video['id']}  {video['title'][:70]}")
        if len(todo) > (args.limit or 10):
            print(f"  ... and {len(todo) - (args.limit or 10)} more")
        units = len(todo) * (QUOTA_LIST + QUOTA_INSERT)
        print(f"\nEstimated quota: ~{units:,} units. Daily allowance is 10,000 by default.")
        if units > 10000:
            print(f"That is {units / 10000:.1f} days of quota — re-run daily, it resumes.")
        print(f"Estimated wall time at --delay {args.delay:g}: ~{len(todo) * args.delay / 60:.0f} min.")
        return 0

    posted = failed = skipped = 0
    try:
        for index, video in enumerate(todo, 1):
            if args.limit and posted >= args.limit:
                print(f"Reached --limit {args.limit}.")
                break

            existing = already_commented(token, video["id"], args.channel)
            if existing == "disabled":
                state["skipped"][video["id"]] = "comments disabled"
                skipped += 1
                print(f"[{index}/{len(todo)}] skip {video['id']} — comments disabled")
                continue
            if existing:
                state["done"][video["id"]] = {
                    "title": video["title"],
                    "kind": video["kind"],
                    "comment_id": "",
                    "posted_at": "pre-existing",
                }
                skipped += 1
                print(f"[{index}/{len(todo)}] skip {video['id']} — already commented")
                continue

            try:
                comment_id = post_comment(token, args.channel, video["id"], args.text)
            except ApiError as exc:
                failed += 1
                state["skipped"][video["id"]] = f"{exc.reason or exc.status}: {exc.message[:120]}"
                print(f"[{index}/{len(todo)}] FAIL {video['id']} — {exc}")
                save_state(state)
                continue

            posted += 1
            state["done"][video["id"]] = {
                "title": video["title"],
                "kind": video["kind"],
                "comment_id": comment_id,
                "posted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            save_state(state)
            print(f"[{index}/{len(todo)}] posted on {video['id']}  {video['title'][:60]}")

            if index < len(todo):
                pause = args.delay * random.uniform(0.6, 1.4)
                time.sleep(pause)

    except QuotaExceeded as exc:
        print(f"\nDaily quota exhausted: {exc}")
        print("Progress is saved. Re-run the same command after quota resets (midnight PT).")
    except KeyboardInterrupt:
        print("\nInterrupted. Progress is saved — re-run to continue.")
    finally:
        save_state(state)
        write_reports(state)

    print(f"\nPosted {posted}, skipped {skipped}, failed {failed}.")
    print(f"Log: {LOG_CSV.name}   Pin checklist: {PIN_CHECKLIST.name}")
    print("Pinning is manual — the API has no pin endpoint. Work through the checklist.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
