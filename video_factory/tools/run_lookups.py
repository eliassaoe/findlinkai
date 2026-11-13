"""Runs the real LinkFinder AI lookups the 360-video plan needs, through the
public API (LINKFINDER_API_KEY), and appends them to data/lookups.json.

    LINKFINDER_API_KEY=... python3 video_factory/tools/run_lookups.py [--limit N] [--only industry,...]

One row per (type, input): {"type", "input", "result", "at"}. Already-done rows
are skipped, so the job can be re-run until everything is there. Values are
company-level public data (website, main phone, LinkedIn page, contact inbox).
"""
import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE.parent / "workers" / "gtm"))
from linkfinder import LinkFinder, LinkFinderError  # noqa: E402

OPS = {  # op -> output field the API returns it under
    "company_name_to_website": "website",
    "company_name_to_phone": "phone",
    "company_name_to_linkedin_url": "linkedin_url",
    "company_name_to_email": "email",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="")
    ap.add_argument("--ops", default=",".join(OPS))
    a = ap.parse_args()
    ind = json.loads((HERE / "data" / "industries.json").read_text())
    out_f = HERE / "data" / "lookups.json"
    rows = json.loads(out_f.read_text()) if out_f.exists() else []
    done = {(r["type"], r["input"]) for r in rows if r.get("result") is not None}
    only = set(filter(None, a.only.split(",")))
    todo = []
    for key, v in ind.items():
        if key.startswith("_") or (only and key not in only):
            continue
        for c in v["companies"]:
            for op in a.ops.split(","):
                if (op, c) not in done:
                    todo.append((op, c))
    if a.limit:
        todo = todo[: a.limit]
    print(f"{len(todo)} lookups to run", flush=True)
    import urllib.request

    def opener(req, timeout=60):  # Cloudflare 1010 blocks the default Python-urllib signature
        req.add_header("User-Agent", "LinkFinderAI-video-factory/1.0 (+https://linkfinderai.com)")
        return urllib.request.urlopen(req, timeout=timeout)

    lf = LinkFinder(opener=opener)

    def one(t):
        op, c = t
        for attempt in range(3):
            try:
                raw = lf._post({"type": op, "input_data": c})
                res = raw.get("result")
                if raw.get("job_id"):
                    res = lf.run(op, c, OPS[op])
                time.sleep(1.5)  # stay under the API's Cloudflare rate limit
                return {"type": op, "input": c, "result": res, "raw_status": raw.get("status"),
                        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
            except LinkFinderError as e:
                err = f"{e}"[:200]
                time.sleep(20 * (attempt + 1))
        return {"type": op, "input": c, "result": None, "error": err}

    with ThreadPoolExecutor(max_workers=2) as ex:
        for i, r in enumerate(ex.map(one, todo), 1):
            rows = [x for x in rows if not (x["type"] == r["type"] and x["input"] == r["input"])] + [r]
            if i % 20 == 0 or i == len(todo):
                out_f.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
                print(f"{i}/{len(todo)}", flush=True)
    out_f.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
    ok = sum(1 for r in rows if r.get("result") not in (None, "", "Not found"))
    print(f"rows {len(rows)}, with a value {ok}, credits ~{lf.credits_spent}")


if __name__ == "__main__":
    main()
