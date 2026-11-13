"""The 1,000-video calendar (owner, 13 Nov 2026): 5 a day = 3 long + 2 shorts.

Keeps every date already in schedule360.json (some are uploaded and scheduled on
YouTube) and fills the gaps with the ideas500 videos:
  longs   up to 3 a day from 15 Nov, slots 12:00 / 14:00 / 16:00 / 20:00 UTC
  shorts  2 a day (10:00, 18:00 UTC): the empty days before 20 Nov first, then after the last one
Longs go measured-volume first (biggest search first), then families interleaved
so two neighbours are never the same family or company.

    python3 video_factory/tools/schedule1000.py   # writes schedule1000.json
"""
import collections
import datetime as dt
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
START = dt.date(2026, 11, 15)
LONG_SLOTS = ["12:00", "16:00", "20:00", "14:00"]
SHORT_SLOTS = ["10:00", "18:00"]


def vol(v):
    if not v:
        return 0
    return float(v[:-1]) * (1000 if v.endswith("K") else 1) if v[-1] in "Kk" else float(v)


def order_longs(ideas):
    measured = sorted([i for i in ideas if i.get("volume")], key=lambda i: -vol(i["volume"]))
    rest = [i for i in ideas if not i.get("volume")]
    by = collections.defaultdict(list)
    for i in rest:
        by[i["family"]].append(i)
    out = list(measured)
    fams = ["industry", "alt", "clients", "head"]
    while any(by.values()):
        for f in fams:
            if by[f]:
                out.append(by[f].pop(0))
    # no company twice in a row
    for k in range(1, len(out)):
        if out[k]["company"] == out[k - 1]["company"]:
            for j in range(k + 1, len(out)):
                if out[j]["company"] != out[k - 1]["company"]:
                    out[k], out[j] = out[j], out[k]
                    break
    return out


def main():
    old = json.loads((HERE / "schedule360.json").read_text())["posts"]
    ideas = json.loads((HERE / "data" / "ideas500.json").read_text())["ideas"]
    taken = {p["date"] for p in old}
    per_day = collections.Counter((p["date"][:10], p["format"]) for p in old)
    posts = [dict(p, plan="360") for p in old]

    longs = order_longs(ideas)
    day = START
    while longs:
        d = day.isoformat()
        for t in LONG_SLOTS:
            if not longs or per_day[(d, "long")] >= 3:
                break
            when = f"{d}T{t}:00Z"
            if when in taken:
                continue
            i = longs.pop(0)
            posts.append({"slug": i["slug"], "format": "long", "family": i["family"], "kind": i["kind"], "title": i["title"],
                          "keyword": i["keyword"] + (f" ({i['volume']})" if i.get("volume") else ""), "date": when, "plan": "ideas500"})
            taken.add(when)
            per_day[(d, "long")] += 1
        day += dt.timedelta(days=1)

    shorts = [i for i in ideas if i.get("short")]
    last_short = max(dt.date.fromisoformat(p["date"][:10]) for p in old if p["format"] == "short")
    days = [START + dt.timedelta(days=k) for k in range((last_short - START).days + 1)]
    days += [last_short + dt.timedelta(days=k) for k in range(1, 400)]
    for day in days:
        if not shorts:
            break
        d = day.isoformat()
        for t in SHORT_SLOTS:
            when = f"{d}T{t}:00Z"
            if not shorts or per_day[(d, "short")] >= 2 or when in taken:
                continue
            i = shorts.pop(0)
            posts.append({"slug": i["short"], "format": "short", "family": i["family"], "kind": i["kind"],
                          "title": i["title"].split("(")[0].strip() + " #shorts", "keyword": i["keyword"], "date": when, "plan": "ideas500"})
            taken.add(when)
            per_day[(d, "short")] += 1
    posts.sort(key=lambda p: p["date"])
    out = {"_note": __doc__.strip().splitlines()[0] + " Old plan entries keep plan=360.", "posts": posts}
    (HERE / "schedule1000.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    f = collections.Counter(p["format"] for p in posts)
    print(len(posts), dict(f), posts[0]["date"][:10], "->", posts[-1]["date"][:10])
    full = sum(1 for d in {p["date"][:10] for p in posts} if per_day[(d, "long")] >= 3 and per_day[(d, "short")] >= 2)
    print("days with 3 long + 2 shorts:", full)


if __name__ == "__main__":
    main()
