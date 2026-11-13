"""Upload waves: what to send to vidIQ next, and recording what was sent.

    python3 video_factory/tools/wave.py next 30        # writes /tmp/wave.json, prints a summary
    python3 video_factory/tools/wave.py record ROWS    # ROWS: "slug uploadId postId videoId" lines on stdin

`next` takes the earliest-dated posts of schedule1000.json that are built (MP4 in
a video-factory* release) and not in data/uploaded360.json, and gives for each:
the MP4 URL, title, description, tags, publishAt and the thumbnail to attach
(Best series: its AI thumbnail from data/best_thumbs.json; other long videos:
raw.githubusercontent.com/<repo>/thumbs/<slug>.png, filled by thumbs.yml;
shorts: none). A post whose date has already passed is skipped (YouTube refuses
a publishAt in the past) and listed as `late`.
"""
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
REPO = "eliassaoe/findlinkai"


def gh(path):
    return subprocess.run(["gh", "api", path, "-q", ".[].name"] if "assets" in path else ["gh", "api", path],
                          capture_output=True, text=True).stdout


def built_assets():
    tags = json.loads(subprocess.run(["gh", "api", f"repos/{REPO}/releases?per_page=50"], capture_output=True, text=True).stdout)
    where = {}
    for rel in tags:
        tag = rel["tag_name"]
        if not tag.startswith("video-factory"):
            continue
        for p in range(1, 13):
            names = subprocess.run(["gh", "api", f"repos/{REPO}/releases/{rel['id']}/assets?per_page=100&page={p}",
                                    "-q", '.[] | "\\(.name) \\(.updated_at)"'], capture_output=True, text=True).stdout.split("\n")
            names = [n for n in names if n.strip()]
            if not names:
                break
            for n in names:
                name, at = n.split()
                if name.endswith(".mp4"):
                    s = name[:-4]
                    if s not in where or at > where[s][1]:
                        where[s] = (tag, at)
    return {s: t for s, (t, _) in where.items()}


def thumbs_on_branch():
    out = subprocess.run(["gh", "api", f"repos/{REPO}/git/trees/thumbs", "-q", ".tree[].path"], capture_output=True, text=True).stdout
    return {p[:-4] for p in out.split() if p.endswith(".png")}


def nxt(n):
    up = json.loads((HERE / "data" / "uploaded360.json").read_text())
    posts = json.loads((HERE / "schedule1000.json").read_text())["posts"]
    best = json.loads((HERE / "data" / "best_thumbs.json").read_text())
    built = built_assets()
    thumbs = thumbs_on_branch()
    now = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=30)
    rows, late = [], []
    for p in sorted(posts, key=lambda p: p["date"]):
        s = p["slug"]
        if s in up or s not in built:
            continue
        when = dt.datetime.fromisoformat(p["date"].replace("Z", "+00:00"))
        if when < now:
            late.append(s)
            continue
        sc = json.loads((HERE / "scenarios" / f"{s}.json").read_text())
        short = sc.get("format") == "short"
        thumb = None
        if not short:
            if s in best:
                thumb = best[s]["url"]
            elif s in thumbs:
                thumb = f"https://raw.githubusercontent.com/{REPO}/thumbs/{s}.png"
        rows.append({"slug": s, "url": f"https://github.com/{REPO}/releases/download/{built[s]}/{s}.mp4",
                     "title": p["title"] if short else sc["title"], "text": sc["description"], "tags": sc["tags"][:30],
                     "publishAt": p["date"], "thumb": thumb, "short": short})
        if len(rows) >= n:
            break
    Path("/tmp/wave.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    print(f"{len(rows)} to upload, {len(late)} late (date passed): {late[:5]}")
    for r in rows:
        print(r["publishAt"], r["slug"], "thumb" if r["thumb"] else ("short" if r["short"] else "NO THUMB"))


def record():
    f = HERE / "data" / "uploaded360.json"
    up = json.loads(f.read_text())
    today = dt.date.today().isoformat()
    for line in sys.stdin:
        parts = line.split()
        if len(parts) >= 3:
            up[parts[0]] = {"uploadId": parts[1], "postId": parts[2], **({"videoId": parts[3]} if len(parts) > 3 else {}), "scheduled": today}
    f.write_text(json.dumps(up, indent=1) + "\n")
    print(len(up), "uploaded in total")


if __name__ == "__main__":
    if sys.argv[1] == "next":
        nxt(int(sys.argv[2]) if len(sys.argv) > 2 else 30)
    else:
        record()
