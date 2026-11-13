"""Union of two lookups.json files (the run's and main's), so a run never loses
its rows to a push race. A row with a result beats one without.

    python3 video_factory/tools/merge_lookups.py ours.json theirs.json > merged.json
"""
import json
import sys

out = {}
for f in sys.argv[1:]:
    for r in json.load(open(f)):
        k = (r["type"], r["input"])
        if k not in out or (out[k].get("result") is None and r.get("result") is not None):
            out[k] = r
print(json.dumps(list(out.values()), indent=1, ensure_ascii=False))
