#!/usr/bin/env python3
"""Offline tests: a fake YouTube API exercises the whole posting loop.

    python3 test_auto_comment.py

No network, no credentials. Proves duration parsing, Shorts detection,
idempotency, comments-disabled handling, quota stop, and the reports.
"""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auto_comment as ac  # noqa: E402

CHANNEL = "UCAq5URh_O2gbg4bFFwBWfdg"
FAILURES = []


def check(label, got, want):
    if got != want:
        FAILURES.append(f"{label}: got {got!r}, want {want!r}")
        print(f"  FAIL {label}: got {got!r}, want {want!r}")
    else:
        print(f"  ok   {label}")


# --- duration parsing ------------------------------------------------------

print("parse_duration")
check("PT45S", ac.parse_duration("PT45S"), 45)
check("PT3M", ac.parse_duration("PT3M"), 180)
check("PT2M31S", ac.parse_duration("PT2M31S"), 151)
check("PT1H2M3S", ac.parse_duration("PT1H2M3S"), 3723)
check("live (P0D)", ac.parse_duration("P0D"), 0)

# --- fake API --------------------------------------------------------------

VIDEOS = [
    {"id": "vid_long_1", "title": "Find a CEO email", "dur": "PT4M10S"},
    {"id": "vid_short_1", "title": "Shorts: scrape a profile", "dur": "PT48S"},
    {"id": "vid_done_1", "title": "Already commented", "dur": "PT5M"},
    {"id": "vid_off_1", "title": "Comments disabled", "dur": "PT30S"},
    {"id": "vid_long_2", "title": "Export to CSV", "dur": "PT6M2S"},
]

posted_calls = []
quota_after = [999]


def fake_api_get(path, token, **params):
    if path == "channels":
        return {"items": [{"contentDetails": {"relatedPlaylists": {"uploads": "UU_fake"}}}]}
    if path == "playlistItems":
        return {
            "items": [
                {
                    "contentDetails": {"videoId": v["id"], "videoPublishedAt": "2026-08-01T00:00:00Z"},
                    "snippet": {"title": v["title"], "publishedAt": "2026-08-01T00:00:00Z"},
                }
                for v in VIDEOS
            ]
        }
    if path == "videos":
        wanted = set(params["id"].split(","))
        return {
            "items": [
                {"id": v["id"], "contentDetails": {"duration": v["dur"]}}
                for v in VIDEOS
                if v["id"] in wanted
            ]
        }
    if path == "commentThreads":
        vid = params["videoId"]
        if vid == "vid_off_1":
            raise ac.ApiError(403, "commentsDisabled", "comments are disabled")
        if vid == "vid_done_1":
            return {
                "items": [
                    {
                        "snippet": {
                            "topLevelComment": {
                                "snippet": {
                                    "authorChannelId": {"value": CHANNEL},
                                    "textOriginal": ac.COMMENT_TEXT,
                                }
                            }
                        }
                    }
                ]
            }
        if vid == "vid_long_2":
            # somebody else's comment mentioning the domain — must NOT count
            return {
                "items": [
                    {
                        "snippet": {
                            "topLevelComment": {
                                "snippet": {
                                    "authorChannelId": {"value": "UCsomeoneelse"},
                                    "textOriginal": "is linkfinderai.com any good?",
                                }
                            }
                        }
                    }
                ]
            }
        return {"items": []}
    raise AssertionError(f"unexpected path {path}")


def fake_request(method, url, token=None, body=None, form=None, timeout=30):
    assert method == "POST" and "commentThreads" in url
    if len(posted_calls) >= quota_after[0]:
        raise ac.QuotaExceeded("quotaExceeded")
    vid = body["snippet"]["videoId"]
    posted_calls.append((vid, body["snippet"]["topLevelComment"]["snippet"]["textOriginal"]))
    return {"snippet": {"topLevelComment": {"id": f"cmt_{vid}"}}}


ac.api_get = fake_api_get
ac._request = fake_request
ac.access_token = lambda: "fake-token"

print("\nlisting + shorts detection")
vids = ac.annotate_kind("t", ac.list_uploads("t", "UU_fake"))
check("video count", len(vids), 5)
check("shorts detected", sorted(v["id"] for v in vids if v["kind"] == "short"),
      ["vid_off_1", "vid_short_1"])

print("\nalready_commented")
check("ours counts", ac.already_commented("t", "vid_done_1", CHANNEL), True)
check("someone else's does not", ac.already_commented("t", "vid_long_2", CHANNEL), False)
check("disabled reported", ac.already_commented("t", "vid_off_1", CHANNEL), "disabled")
check("clean video", ac.already_commented("t", "vid_long_1", CHANNEL), False)


def run_main(argv, tmp):
    ac.HERE = tmp
    ac.STATE_FILE = tmp / "state.json"
    ac.LOG_CSV = tmp / "posted.csv"
    ac.PIN_CHECKLIST = tmp / "pin-checklist.md"
    sys.argv = ["auto_comment.py"] + argv
    return ac.main()


with tempfile.TemporaryDirectory() as raw:
    tmp = Path(raw)

    print("\ndry run posts nothing")
    posted_calls.clear()
    run_main(["--channel", CHANNEL], tmp)
    check("no posts in dry run", posted_calls, [])
    check("no state written", (tmp / "state.json").exists(), False)

    print("\nlive run")
    posted_calls.clear()
    run_main(["--channel", CHANNEL, "--live", "--delay", "0"], tmp)
    check("posted to the 3 clean videos",
          sorted(v for v, _ in posted_calls),
          ["vid_long_1", "vid_long_2", "vid_short_1"])
    check("posts the configured text verbatim",
          {t for _, t in posted_calls}, {ac.COMMENT_TEXT})
    check("configured text carries the marker",
          ac.COMMENT_MARKER in ac.COMMENT_TEXT, True)
    state = json.loads((tmp / "state.json").read_text())
    check("done includes pre-existing", "vid_done_1" in state["done"], True)
    check("disabled video skipped", state["skipped"].get("vid_off_1"), "comments disabled")

    print("\nre-run is idempotent")
    posted_calls.clear()
    run_main(["--channel", CHANNEL, "--live", "--delay", "0"], tmp)
    check("second run posts nothing", posted_calls, [])

    print("\nreports")
    checklist = (tmp / "pin-checklist.md").read_text()
    check("deep link present",
          "https://www.youtube.com/watch?v=vid_long_1&lc=cmt_vid_long_1" in checklist, True)
    check("csv header",
          (tmp / "posted.csv").read_text().splitlines()[0],
          "video_id,kind,comment_id,posted_at,title")

with tempfile.TemporaryDirectory() as raw:
    tmp = Path(raw)
    print("\nquota exhaustion stops cleanly and resumes")
    posted_calls.clear()
    quota_after[0] = 2
    run_main(["--channel", CHANNEL, "--live", "--delay", "0"], tmp)
    check("stopped after quota", len(posted_calls), 2)
    saved = json.loads((tmp / "state.json").read_text())
    check("progress persisted", len(saved["done"]), 3)  # 2 posted + 1 pre-existing
    quota_after[0] = 999
    posted_calls.clear()
    run_main(["--channel", CHANNEL, "--live", "--delay", "0"], tmp)
    check("resume finishes the rest", len(posted_calls), 1)

# --- device flow -----------------------------------------------------------

print("\ndevice flow")
ac.load_client = lambda: ("cid.apps.googleusercontent.com", "sec")

calls = []
script = [
    (200, {"device_code": "dc", "user_code": "ABCD-EFGH",
           "verification_url": "https://www.google.com/device",
           "interval": 0, "expires_in": 60}),
    (428, {"error": "authorization_pending"}),
    (403, {"error": "slow_down"}),
    (200, {"refresh_token": "rt_live", "access_token": "at"}),
]


def fake_oauth_post(url, form):
    calls.append((url, form))
    return script[len(calls) - 1]


ac._oauth_post = fake_oauth_post
with tempfile.TemporaryDirectory() as raw:
    ac.TOKEN_FILE = Path(raw) / ".youtube-token.json"
    ac.run_device_flow()
    check("polled through pending + slow_down", len(calls), 4)
    check("device grant used", calls[1][1]["grant_type"],
          "urn:ietf:params:oauth:grant-type:device_code")
    check("refresh token saved",
          json.loads(ac.TOKEN_FILE.read_text())["refresh_token"], "rt_live")

print("\ndevice flow rejects a non-device client")
calls.clear()
script[:] = [(401, {"error": "invalid_client", "error_description": "not found"})]
try:
    ac.run_device_flow()
    check("exits on bad client", "no exit", "SystemExit")
except SystemExit as exc:
    check("exits on bad client", "TVs and Limited Input" in str(exc), True)

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILURE(S)")
    sys.exit(1)
print("All tests passed.")
