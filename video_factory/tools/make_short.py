"""Makes a YouTube Short (format: short, 1080x1920, ~20-35 s) from a long
scenario: same real values, only the single lookup, one hook line on the
finished result, a call to action at the end.

    python3 video_factory/tools/make_short.py <long-slug> <short-slug> "<title>" "<hook>" "<caption>"

Owner, 13 Nov 2026: vary durations and formats, shorts as well as long videos.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]


def first_sentence(t):
    m = re.match(r"(.+?[.!?])(\s|$)", t)
    return m.group(1) if m else t


def make(long_slug, slug, title, hook, caption, cta="Link in the description to try it free."):
    sc = json.loads((HERE / "scenarios" / f"{long_slug}.json").read_text())
    steps = []
    for s in sc["steps"]:
        s = json.loads(json.dumps(s))
        waits = any("waitText" in d for d in s["do"])
        if not waits:
            s["narration"] = first_sentence(s["narration"])
        steps.append(s)
        if waits:
            s["narration"] = s["narration"].rstrip() + " " + cta
            s["tail"] = 1.2
            break
    out = {
        "slug": slug, "format": "short", "title": title,
        "payoff": hook, "shortCaption": caption,
        "mocks": sc["mocks"], "setup": sc.get("setup", []), "steps": steps,
        "tags": sc.get("tags", []) + ["shorts"],
        "description": f"{hook}\n\nTry LinkFinder AI free: https://linkfinderai.com/app?utm_source=youtube&utm_medium=short&utm_campaign={slug}\n\nThe value on screen is a real LinkFinder AI result.\n#shorts",
        "thumb": {**sc.get("thumb", {}), "style": "white"},
        "_from": long_slug,
    }
    # titles/cards fields the card renderer expects even if unused
    for k in ("cover", "coverSub", "outro", "outroHeadline", "outroSub"):
        out[k] = sc.get(k, "")
    (HERE / "scenarios" / f"{slug}.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    return out


if __name__ == "__main__":
    make(*sys.argv[1:6])
